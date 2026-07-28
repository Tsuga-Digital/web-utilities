const STYLE_ID = "web-utilities-grid-highlight-style";
const MARKER_CLASS = "web-utilities-grid-highlighted";
const INDEX_ATTR = "data-web-utilities-grid-index";

function getGridContainers() {
  return Array.from(document.querySelectorAll("*")).filter((element) => {
    const display = globalThis.getComputedStyle(element).display;
    return display === "grid" || display === "inline-grid";
  });
}

function applyGridHighlights() {
  const containers = getGridContainers();
  if (containers.length === 0) {
    return { enabled: true, count: 0 };
  }

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${MARKER_CLASS} {
        outline: 2px dashed #ff006e !important;
        outline-offset: -1px !important;
        position: relative !important;
      }

      .${MARKER_CLASS}::after {
        content: attr(${INDEX_ATTR});
        position: absolute;
        top: 0;
        left: 0;
        z-index: 2147483647;
        font: 11px/1.3 monospace;
        color: #fff;
        background: #ff006e;
        padding: 2px 4px;
        pointer-events: none;
      }
    `;
    document.documentElement.appendChild(style);
  }

  containers.forEach((container, index) => {
    container.classList.add(MARKER_CLASS);
    container.setAttribute(INDEX_ATTR, `grid-${index + 1}`);
  });

  return { enabled: true, count: containers.length };
}

function removeGridHighlights() {
  document.querySelectorAll(`.${MARKER_CLASS}`).forEach((element) => {
    element.classList.remove(MARKER_CLASS);
    element.removeAttribute(INDEX_ATTR);
  });

  document.getElementById(STYLE_ID)?.remove();

  return { enabled: false, count: 0 };
}

function toggleGridHighlights() {
  return document.getElementById(STYLE_ID) ? removeGridHighlights() : applyGridHighlights();
}

const extensionApi = globalThis.browser ?? globalThis.chrome;
extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== "toggle-grid-highlighter") {
    return;
  }

  sendResponse(toggleGridHighlights());
});
