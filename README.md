# osu-collector-dl

A program that automates the scraping, download, and beatmap collection generation for Osu!Collector.

## Installation

1. Download the latest release from the [releases](https://github.com/roogue/osu-collector-dl/releases) page.
2. Extract the compressed file

## Usage

1. Run the `osu-collector-dl.exe` file from the downloaded folder.
2. Enter the ID or paste the full URL of the collection you want to download. For example, both `44` and `https://osucollector.com/collections/44/speed-practice` are valid. If paste does not work in your terminal, copy the ID or URL and press Enter at the prompt to read it from your clipboard.
3. Select a working mode.
4. Wait until the program finishes its task.

## Configuration

You can customize various settings for the program by editing the `config.json` file. To do this, follow the instructions below:

1. Right-click on the `config.json` file
2. Select "Open with" from the context menu.
3. Choose a text editor (such as Notepad) to open the file and make desired changes.

Below is the data stored in the config.json.

```json
{
  "parallel": true,
  "concurrency": 5,
  "intervalCap": 50,
  "logSize": 15,
  "directory": "",
  "mode": 1,
  "mirrors": ["catboy", "osuDirect"],
  "noVideoFallback": true
}
```

### Explaination

> **parallel**
>
> - `true` Download multiple beatmap sets at the same time. This is enabled by default.
> - `false` Download only one beatmap set at a time.

> **concurrency** (DO NOT CHANGE IF YOU ARE NOT SURE OF WHAT YOU ARE DOING)
>
> - The number of downloads to request at a time.
> - Range: 0 - 10
> - It is recommended to set this to a low number (such as 5) to prevent abuse of the osu!mirror API and getting potential IP bans or rate limits.

> **intervalCap** (DO NOT CHANGE IF YOU ARE NOT SURE OF WHAT YOU ARE DOING)
>
> - The maximum number of downloads to request in one minute.
> - Range: 0 - 120
> - It is recommended to set this to a low number (such as 50) to prevent abuse of the osu!mirror API and getting potential IP bans or rate limits.

> **logSize**
>
> - The maximum number of log messages during the download process.

> **directory**
>
> - The path to the folder where you want to save the downloaded beatmaps.
> - If no value is provided, the current working directory will be used.
> - The double quotes around the path is necessary.

> **mode**
>
> - `1`: Download Beatmap Set only.
> - `2`: Download Beatmap Set + Generate .osdb
> - `3`: Generate .osdb only.

> **mirrors**
>
> - Download mirrors to try, in order.
> - Supported values: `"catboy"` and `"osuDirect"`.
> - If a beatmap set is unavailable on one mirror, the program will automatically try the next configured mirror.

> **noVideoFallback**
>
> - `true`: Retry downloads without video when the mirror supports it.
> - `false`: Only try the normal beatmap set download.

## FAQ

### I got "The request is blocked" or "Unable to get daily rate limit" when I run the program.

> This program relies on third-party osu! beatmap mirrors for automated downloads. If one mirror blocks a beatmap set, cannot find it, or reports that it is unavailable, the program will try the next configured mirror and then try the no-video fallback when enabled. Beatmap sets that still cannot be downloaded are skipped and written to `ocdl-missing.log` in the collection folder so the rest of the collection can continue.

### It says "Retrying" during the download process, am I doing anything wrong?

> It is normal for API requests to sometimes fail due to factors such as rate limiting and internet connection issues. The script has a built-in retrying process that will handle these issues automatically. It is expected to see the "Retrying" message during the download process.

### I want the beatmaps to be automatically added to my collections. Is that possible?

> Unfortunately, this feature will not be implemented as directly modifying your personal osu! folder is risky and could potentially result in corrupted files. It is recommended to use [Collection Manager](https://github.com/Piotrekol/CollectionManager) (CM) by Piotrekol to modify your collection for more stable functionality.

### Why won't my program even start? The program shuts off right after I opened it.

> There could be several reasons why your program is not starting. One potential cause is that you have incorrectly edited the config file, such as forgetting to include double quotes around the directory path. If you are not sure what the problem is, try reinstalling the program.

### The program freezes in the middle of the process without displaying any error messages. What can I do?

> It can be due to the program is waiting for the next burst of download requests to prevent unwanted rate limits or IP bans. You can also try pressing Enter on your keyboard to see if that prompts the program to continue. This can sometimes happen if you accidentally clicked on the terminal window, which can cause the program to pause.

### I’ve reached my daily download limit. How can I get the remaining beatmaps?

> You can use [Collection Manager](https://github.com/Piotrekol/CollectionManager) (CM) by Piotrekol along with the generated .osdb file to download the missing beatmaps. Alternatively, you can wait until the limit resets the next day.

### I accidentally downloaded the wrong collection. How can I stop the downloads?

> To stop the downloads, you can simply close the terminal window. This will terminate the program. Alternatively, you can try pressing CTRL+C on your keyboard, which will send a signal to the program to stop running.

## License

This project is licensed under the MIT License. See the [LICENSE](https://choosealicense.com/licenses/mit/) file for details.
