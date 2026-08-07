'use strict';

const browserApi = globalThis.browser ?? globalThis.chrome;
const YOUTUBE_MUSIC_URL_PREFIX = 'https://music.youtube.com/';

function isYoutubeMusicUrl(url) {
  return typeof url === 'string' && url.startsWith(YOUTUBE_MUSIC_URL_PREFIX);
}

async function injectYoutubeMusicAutoContinue(tabId) {
  if (!browserApi.scripting || typeof tabId !== 'number') {
    return;
  }

  try {
    await browserApi.scripting.executeScript({
      target: { tabId },
      files: ['youtubeMusicAutoContinue.js']
    });
  } catch (_error) {
    // Restricted or closing tabs can reject injection; the static content script
    // will handle the next normal page load.
  }
}

async function injectIntoOpenYoutubeMusicTabs() {
  if (!browserApi.tabs?.query) {
    return;
  }

  try {
    const tabs = await browserApi.tabs.query({});
    await Promise.all(
      tabs
        .filter((tab) => isYoutubeMusicUrl(tab.url) && typeof tab.id === 'number')
        .map((tab) => injectYoutubeMusicAutoContinue(tab.id))
    );
  } catch (_error) {
    // Ignore tab enumeration failures; normal navigation remains covered.
  }
}

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

browserApi.runtime.onInstalled?.addListener(() => {
  void injectIntoOpenYoutubeMusicTabs();
});

browserApi.runtime.onStartup?.addListener(() => {
  void injectIntoOpenYoutubeMusicTabs();
});

browserApi.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isYoutubeMusicUrl(tab.url)) {
    void injectYoutubeMusicAutoContinue(tabId);
  }
});

void injectIntoOpenYoutubeMusicTabs();
