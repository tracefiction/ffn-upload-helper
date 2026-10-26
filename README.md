# Upload Helper for FanFiction.net

Unofficial browser extension for the FanFiction.net Doc Manager.

New documents often fail with "Processing Error: The document is not in a supported format, over 5MB, or password-protected", even when the file is fine. The extension retries the upload until it saves (up to 60 tries, about 3 seconds apart) and shows its progress.

It also:

- keeps scene breaks like `* * *` or `~~~`, which FanFiction.net deletes, as a horizontal line
- converts .docx, .txt and .html files in the browser so centred titles, bold/italic from Word styles and separate paragraphs survive
- checks file size and type before sending

It runs only on the Doc Manager pages and collects no data.

## Install

Chrome: open `chrome://extensions`, turn on Developer mode, click Load unpacked and choose this folder.

Firefox: open `about:debugging#/runtime/this-firefox`, click Load Temporary Add-on and choose `manifest.json`.

## Development

```sh
npm install
npm test
npm run test:e2e
npm run package
```

I also made [Trace](https://tracefiction.com), another tool for FanFiction.net and AO3 that keeps track of what you're reading.
