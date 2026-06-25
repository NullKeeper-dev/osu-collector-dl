import https from "https";
import { execFileSync } from "child_process";
import { Constant } from "./struct/Constant";

export default class Util {
  static isBoolean(obj: unknown): boolean {
    return !!obj === obj;
  }

  static replaceForbiddenChars(str: string): string {
    const regex = /[\\/<>:"|?*]+/g;
    return str.replace(regex, "");
  }

  static parseCollectionId(input: string): number | null {
    const trimmed = input.trim();
    const rawId = /^\d+$/.exec(trimmed);
    if (rawId) return Number(rawId[0]);

    const urlId =
      /(?:^|\/)collections\/(\d+)(?:[/?#]|$)/i.exec(trimmed) ??
      /(?:^|\/)collections\/(\d+)$/i.exec("https://" + trimmed);
    if (!urlId) return null;

    return Number(urlId[1]);
  }

  static readClipboardText(): string | null {
    if (process.platform !== "win32") return null;

    try {
      const text = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"],
        {
          encoding: "utf8",
          timeout: 5000,
          windowsHide: true,
        }
      );

      const trimmed = text.trim();
      return trimmed || null;
    } catch {
      return null;
    }
  }

  static async isOnline(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = https.get(Constant.OsuCollectorApiUrl, () => {
        resolve(true);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(10000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  static checkUndefined(
    obj: Record<string, unknown>,
    fields: string[]
  ): string | null {
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(obj, field)) {
        return field;
      }
    }
    return null;
  }

  static checkRange(number: number, start: number, end: number): boolean {
    return !(number < start || number > end);
  }

  static setTerminalTitle(title: string) {
    process.stdout.write(
      String.fromCharCode(27) + "]0;" + title + String.fromCharCode(7)
    );
  }
}
