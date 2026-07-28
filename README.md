# web-utilities

Browser extension utilities for page inspection.

## Grid Overlay utility

This extension toggles a non-invasive visual overlay around CSS grid containers.

### Features

- Non-invasive overlay layer using each grid's `getBoundingClientRect()`
- On-demand injection (no automatic page-load content script)
- Keyboard command for automation and accessibility: `Ctrl+Shift+G` (`Command+Shift+G` on macOS)
- Supports dynamic DOM updates through mutation observers
- Works across frames by injecting into all frames when activated
- Traverses open shadow roots in each frame

### Limitations

- Closed shadow roots are not accessible.
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

Automation hook after injection:

- `window.__TSUGA_GRID_OVERLAY__.toggle()`
- `window.__TSUGA_GRID_OVERLAY__.enable()`
- `window.__TSUGA_GRID_OVERLAY__.disable()`
- `window.__TSUGA_GRID_OVERLAY__.status()`

### Development

Run tests:

```bash
npm test
```
