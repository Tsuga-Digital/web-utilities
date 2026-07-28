'use strict';

const browserApi = globalThis.browser ?? globalThis.chrome;

function isSupportedTabUrl(url) {
  return Boolean(url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')));
}

async function injectAndToggle(tabId) {
  await browserApi.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['gridOverlayCore.js', 'contentScript.js']
  });

  const results = await browserApi.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      const api = globalThis.__TSUGA_GRID_OVERLAY__;
      if (!api) {
        return { enabled: false, gridCount: 0, error: 'Overlay API unavailable in frame.' };
      }
      return api.toggle();
    }
  });

  const totalGrids = results.reduce((sum, item) => {
    const gridCount = Number(item?.result?.gridCount ?? 0);
    return sum + gridCount;
  }, 0);

  const enabled = results.some((item) => Boolean(item?.result?.enabled));
  return { enabled, gridCount: totalGrids };
}

async function getActiveTab() {
  const [activeTab] = await browserApi.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || typeof activeTab.id !== 'number') {
    throw new Error('No active tab found.');
  }
  if (!isSupportedTabUrl(activeTab.url)) {
    throw new Error('This page is not supported. Use an http(s) or file:// page.');
  }
  return activeTab;
}

async function toggleActiveTabOverlay() {
  const activeTab = await getActiveTab();
  return injectAndToggle(activeTab.id);
}

function toReadableError(error) {
  if (!error) {
    return 'Unknown error.';
  }

  const message = String(error.message || error);
  if (message.includes('Cannot access') || message.includes('Cannot access contents')) {
    return 'Extension cannot access this page. Check host permissions and restricted browser pages.';
  }
  return message;
}

browserApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'toggle-grid-overlay') {
    return false;
  }

  toggleActiveTabOverlay()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: toReadableError(error) }));

  return true;
});

browserApi.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-grid-overlay') {
    return;
  }

  toggleActiveTabOverlay().catch(() => {
    // Ignore command failures; popup flow surfaces detailed errors.
  });
});
