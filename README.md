# web-utilities

Browser extension utilities for page inspection.

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
