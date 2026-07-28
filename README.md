# web-utilities

A small catch-all browser extension repo for simple development-focused web utilities.

## Included utility

- **CSS Grid Highlighter**: Toggle outlines/badges for all elements using `display: grid` or `display: inline-grid` on the active page.

## Files

- `/manifest.json` - Manifest V3 extension config for Chrome/Firefox
- `/popup.html` + `/popup.js` - Extension popup UI and toggle action
- `/contentScript.js` - Grid detection and highlight overlay logic

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `/home/runner/work/web-utilities/web-utilities`
5. Click the extension icon and press **Toggle CSS Grid Highlighter**

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `/home/runner/work/web-utilities/web-utilities/manifest.json`
4. Click the extension icon and press **Toggle CSS Grid Highlighter**
