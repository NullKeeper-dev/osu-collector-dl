import { createWriteStream, existsSync } from "fs";
import { Response } from "undici";
import _path from "path";
import OcdlError from "../struct/OcdlError";
import Util from "../util";
import EventEmitter from "events";
import { BeatMapSet } from "../struct/BeatMapSet";
import Manager from "./Manager";

import PQueue from "p-queue";
import { Requestor } from "./Requestor";
import { DownloadMirror } from "../types";

interface DownloadAttempt {
  mirror: DownloadMirror;
  noVideo: boolean;
}

// Define an interface for the events that the DownloadManager class can emit
interface DownloadManagerEvents {
  downloaded: (beatMapSet: BeatMapSet) => void;
  error: (beatMapSet: BeatMapSet, e: unknown) => void;
  retrying: (beatMapSet: BeatMapSet) => void;
  downloading: (beatMapSet: BeatMapSet) => void;
  skipped: (beatMapSet: BeatMapSet, reason: string) => void;
  rateLimited: () => void;
  dailyRateLimited: (beatMapSets: BeatMapSet[]) => void;
  // End is emitted along with un-downloaded beatmap
  end: (beatMapSets: BeatMapSet[]) => void;
}

export declare interface DownloadManager extends Manager {
  on<U extends keyof DownloadManagerEvents>(
    event: U,
    listener: DownloadManagerEvents[U]
  ): this;

  emit<U extends keyof DownloadManagerEvents>(
    event: U,
    ...args: Parameters<DownloadManagerEvents[U]>
  ): boolean;
}

export class DownloadManager extends EventEmitter implements DownloadManager {
  path: string;

  // Queue for concurrency downloads
  private queue: PQueue;
  private downloadedBeatMapSetSize = 0;
  private remainingDownloadsLimit: number | null;
  private lastDownloadsLimitCheck: number | null = null;
  private testRequest = false;

  constructor(remainingDownloadsLimit: number | null) {
    super();

    this.remainingDownloadsLimit = remainingDownloadsLimit;

    this.path = _path.join(
      Manager.config.directory,
      Manager.collection.getCollectionFolderName()
    );

    this.queue = new PQueue({
      concurrency: Manager.config.parallel ? Manager.config.concurrency : 1,
      intervalCap: Manager.config.intervalCap,
      interval: 60e3, // Always one minute
    });
  }

  // The primary method for downloading beatmaps
  public bulkDownload(): void {
    // Add every download task to queue
    Manager.collection.beatMapSets.forEach((beatMapSet) => {
      this._queueDownload(beatMapSet);
    });

    // Emit if the download has been done
    this.queue.on("idle", () => {
      this.emit("end", this.getNotDownloadedBeatapSets());
    });

    this.on("rateLimited", () => {
      if (!this.queue.isPaused) {
        this.testRequest = true;
        this.queue.pause();
        this.queue.concurrency = 1;
        setTimeout(() => this.queue.start(), 60e3);
      }
    });
    return;
  }

  public getDownloadedBeatMapSetSize() {
    return this.downloadedBeatMapSetSize;
  }

  public getRemainingDownloadsLimit() {
    return this.remainingDownloadsLimit;
  }

  // Downloads a single beatmap file
  private async _downloadFile(
    beatMapSet: BeatMapSet,
    options: { retries: number } = { retries: 3 }
  ): Promise<boolean> {
    let isProbeRequest = false;
    if (this.testRequest) {
      isProbeRequest = true;
      this.testRequest = false;
    }

    // Check if the daily rate limit hit
    if (
      this.remainingDownloadsLimit != null &&
      this.remainingDownloadsLimit <= 0
    ) {
      this.emit("dailyRateLimited", this.getNotDownloadedBeatapSets());
      return false;
    }

    // Request the download
    try {
      const skippedReasons: string[] = [];
      for (const attempt of this._getDownloadAttempts()) {
        this.emit("downloading", beatMapSet);
        // Check if the specified directory exists
        // This is placed here to prevent crashes while user editing folder
        if (!this._checkIfDirectoryExists()) {
          this.path = process.cwd();
        }

        const response = await Requestor.fetchDownloadCollection(
          beatMapSet.id,
          attempt
        );

        const rateLimitRemaining =
          response.headers.get("x-ratelimit-remaining") ??
          response.headers.get("ratelimit-remaining");
        if (rateLimitRemaining && parseInt(rateLimitRemaining) <= 12) {
          // 12 is the highest request cost.
          if (!this.queue.isPaused) {
            this.emit("rateLimited");
          }
        }

        if (response.status === 429) {
          // If user still get 429 after a test request (60 seconds wait), then check if user is daily rate limited
          if (isProbeRequest) {
            if (
              !this.lastDownloadsLimitCheck ||
              Date.now() - this.lastDownloadsLimitCheck > 5e3
            ) {
              // 5 seconds cooldown
              this.lastDownloadsLimitCheck = Date.now();
              const rateLimitStatus = await Requestor.checkRateLimitation();
              if (rateLimitStatus === 0) {
                this.emit(
                  "dailyRateLimited",
                  this.getNotDownloadedBeatapSets()
                );
              } else {
                this.remainingDownloadsLimit = rateLimitStatus;
              }
            }
          }

          if (!this.queue.isPaused) {
            this.emit("rateLimited");
          }
          this._queueDownload(beatMapSet, options);
          return false;
        }

        if ([403, 404, 451].includes(response.status)) {
          skippedReasons.push(
            this._formatAttemptFailure(attempt, response.status)
          );
          continue;
        }

        if (response.status !== 200) {
          throw `Status Code: ${response.status}`;
        }

        this._restoreConcurrencyAfterProbe(isProbeRequest);

        const fileName = this._getFilename(response);
        const file = createWriteStream(_path.join(this.path, fileName));
        if (response.body) {
          for await (const chunk of response.body) {
            file.write(chunk);
          }
        } else {
          throw "res.body is null";
        }
        file.end();

        this.downloadedBeatMapSetSize++;
        if (this.remainingDownloadsLimit != null)
          this.remainingDownloadsLimit--;
        this.emit("downloaded", beatMapSet);
        return true;
      }

      this._restoreConcurrencyAfterProbe(isProbeRequest);
      this.emit("skipped", beatMapSet, skippedReasons.join(", "));
      return false;
    } catch (e) {
      if (isProbeRequest) {
        this.testRequest = true;
      }

      // Retry the download by pushing the map to the end of the queue, and use the alternative URL if this is the last retry
      if (options.retries) {
        this.emit("retrying", beatMapSet);

        this._queueDownload(beatMapSet, {
          retries: options.retries - 1,
        });
      } else {
        // If there are no retries remaining,
        // "error" event will be emitted,
        Manager.collection.beatMapSets.set(beatMapSet.id, beatMapSet);
        this.emit("error", beatMapSet, e);
      }

      return false;
    }
  }

  private _queueDownload(
    beatMapSet: BeatMapSet,
    options: { retries: number } = { retries: 3 }
  ): void {
    void this.queue.add(async () => {
      const completed = await this._downloadFile(beatMapSet, options);
      if (completed) {
        Manager.collection.beatMapSets.delete(beatMapSet.id);
      }
    });
  }

  private _getDownloadAttempts(): DownloadAttempt[] {
    const attempts: DownloadAttempt[] = [];
    for (const mirror of Manager.config.mirrors) {
      attempts.push({ mirror, noVideo: false });
      if (Manager.config.noVideoFallback && mirror === "osuDirect") {
        attempts.push({ mirror, noVideo: true });
      }
    }
    return attempts;
  }

  private _formatAttemptFailure(
    attempt: DownloadAttempt,
    status: number
  ): string {
    return `${attempt.mirror}${
      attempt.noVideo ? " no-video" : ""
    }: HTTP ${status}`;
  }

  private _restoreConcurrencyAfterProbe(isProbeRequest: boolean): void {
    if (isProbeRequest) {
      this.queue.concurrency = Manager.config.parallel
        ? Manager.config.concurrency
        : 1;
    }
  }

  public getNotDownloadedBeatapSets(): BeatMapSet[] {
    return Array.from(Manager.collection.beatMapSets).map(
      ([, beatMapSet]) => beatMapSet
    );
  }

  private _getFilename(response: Response): string {
    const headers = response.headers;
    const contentDisposition = headers.get("content-disposition");

    let fileName = "Untitled.osz"; // Default file name
    // Extract the file name from the "content-disposition" header if it exists
    if (contentDisposition) {
      const result = /filename=([^;]+)/g.exec(contentDisposition);

      // If the file name is successfully extracted, decode the string, and replace the forbidden characters
      if (result) {
        try {
          const decoded = decodeURIComponent(result[1]);
          const replaced = Util.replaceForbiddenChars(decoded);

          fileName = replaced;
        } catch (e) {
          throw new OcdlError("FILE_NAME_EXTRACTION_FAILED", e);
        }
      }
    }

    return fileName;
  }

  private _checkIfDirectoryExists(): boolean {
    return existsSync(this.path);
  }
}
