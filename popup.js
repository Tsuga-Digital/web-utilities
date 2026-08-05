'use strict';

const browserApi = globalThis.browser ?? globalThis.chrome;

const toggleButton = document.getElementById('toggleButton');
const statusText = document.getElementById('statusText');
const autoContinueButton = document.getElementById('autoContinueButton');
const autoContinueStatus = document.getElementById('autoContinueStatus');
const AUTO_CONTINUE_STORAGE_KEY = 'youtubeMusicAutoContinueEnabled';

function setStatus(text, isError) {
  statusText.textContent = text;
  statusText.style.color = isError ? '#dc2626' : '';
}

async function toggleOverlay() {
  toggleButton.disabled = true;
  setStatus('Working...', false);

  try {
    const response = await browserApi.runtime.sendMessage({ type: 'toggle-grid-overlay' });
    if (!response || !response.ok) {
      throw new Error(response?.error || 'No response from extension background process.');
    }

    const stateText = response.enabled ? 'enabled' : 'disabled';
    setStatus(`Overlay ${stateText} (${response.gridCount} grids).`, false);
  } catch (error) {
    setStatus(error.message || 'Failed to toggle overlay.', true);
  } finally {
    toggleButton.disabled = false;
  }
}

toggleButton.addEventListener('click', () => {
  void toggleOverlay();
});

function setAutoContinueStatus(text, isError = false) {
  autoContinueStatus.textContent = text;
  autoContinueStatus.style.color = isError ? '#dc2626' : '';
}

function updateAutoContinueButton(enabled) {
  autoContinueButton.textContent = enabled
    ? 'Disable auto-continue'
    : 'Enable auto-continue';
  autoContinueButton.setAttribute('aria-pressed', String(enabled));
}

async function getAutoContinueEnabled() {
  const stored = await browserApi.storage.local.get(AUTO_CONTINUE_STORAGE_KEY);
  return stored[AUTO_CONTINUE_STORAGE_KEY] !== false;
}

async function setAutoContinueEnabled(enabled) {
  await browserApi.storage.local.set({ [AUTO_CONTINUE_STORAGE_KEY]: enabled });

  const [activeTab] = await browserApi.tabs.query({ active: true, currentWindow: true });
  if (typeof activeTab?.id === 'number' && activeTab.url?.startsWith('https://music.youtube.com/')) {
    try {
      await browserApi.tabs.sendMessage(activeTab.id, {
        type: 'set-youtube-music-auto-continue',
        enabled
      });
    } catch (_error) {
      // The setting is persisted and will be picked up when YouTube Music loads.
    }
  }
}

async function initializeAutoContinue() {
  try {
    const enabled = await getAutoContinueEnabled();
    updateAutoContinueButton(enabled);
    setAutoContinueStatus(enabled ? 'Enabled by default.' : 'Disabled.');
  } catch (error) {
    updateAutoContinueButton(true);
    setAutoContinueStatus(error.message || 'Unable to read setting.', true);
  }
}

async function toggleAutoContinue() {
  autoContinueButton.disabled = true;

  try {
    const enabled = !(await getAutoContinueEnabled());
    await setAutoContinueEnabled(enabled);
    updateAutoContinueButton(enabled);
    setAutoContinueStatus(enabled ? 'Enabled.' : 'Disabled.');
  } catch (error) {
    setAutoContinueStatus(error.message || 'Unable to update setting.', true);
  } finally {
    autoContinueButton.disabled = false;
  }
}

autoContinueButton.addEventListener('click', () => {
  void toggleAutoContinue();
});

void initializeAutoContinue();
