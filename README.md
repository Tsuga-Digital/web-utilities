# web-utilities

Browser extension utilities for page inspection and playback control.

## YouTube Music Auto-Continue utility

The extension automatically confirms YouTube Music’s “Video paused. Continue watching?” prompt and resumes playback when possible.

### Features

- Runs only on `https://music.youtube.com/*`, including the desktop YouTube Music PWA.
- Enabled by default, with an on/off control in the extension popup.
- Watches YouTube Music’s dynamic interface without modifying network requests.
- Re-injects itself into already-open YouTube Music tabs when the extension starts or updates.
- Uses the prompt’s accessible text and button labels instead of relying on one obfuscated CSS class.
- Covers the known YouTube Music `ytmusic-you-there-renderer`/`#button` form and the standard YouTube `yt-confirm-dialog-renderer`/`#confirm-button` form, including nested button-shape wrappers and open shadow roots.
- Also handles the separate pre-pause toast: “Still watching? Video will pause soon.”

### Limitations

- YouTube can change its prompt markup or wording, which may require selector updates.
- Browser autoplay policies can still reject a playback resume in some situations.
- Chrome extensions cannot run inside Chrome on mobile devices.

## Grid Overlay utility

This extension toggles a non-invasive visual overlay around CSS grid containers and their resolved row and column tracks.

### Features

- Non-invasive overlay layer using each grid's `getBoundingClientRect()`
- Draws resolved column and row edges, including visible gutter gaps
- On-demand injection (no automatic page-load content script)
- Keyboard command for automation and accessibility: `Ctrl+Shift+G` (`Command+Shift+G` on macOS)
- Supports dynamic DOM updates through mutation observers
- Works across frames by injecting into all frames when activated
- Traverses open shadow roots in each frame

### Limitations

- Closed shadow roots are not accessible.
- Subgrid tracks are not exposed as resolved sizes by current browser CSSOM APIs, so subgrid containers receive an outline only.
- Sideways writing modes and grids under rotated or skewed transforms receive an outline only because their tracks are not axis-aligned.
- Complex functional gap values beyond pixel, percentage, and simple `calc()` expressions may not be resolved.
- Track rendering is capped at 2,000 unique edges per grid to protect page responsiveness.
- Browser-restricted pages (for example, `chrome://` or add-on stores) cannot be inspected.
- Cross-origin frame access depends on browser extension host permissions and browser policy.

### Load the extension locally

1. Clone this repository locally.
2. Open your browser's extension page:
   - Chrome/Edge: `chrome://extensions`
   - Firefox: `about:debugging#/runtime/this-firefox`
3. Enable Developer Mode.
4. Load this folder from your machine:
   `/absolute/path/to/web-utilities`

### Codex / Computer Use workflow

Stable activation paths:

1. Keyboard shortcut: press `Ctrl+Shift+G` (`Command+Shift+G` on macOS).
2. Popup action: click extension icon, then **Toggle overlay**.
3. If the shortcut conflicts with browser defaults, reassign it from your browser’s extension shortcuts page.

### Development

Run tests:

```bash
npm test
```
