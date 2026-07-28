'use strict';

const browserApi = globalThis.browser ?? globalThis.chrome;

const toggleButton = document.getElementById('toggleButton');
const statusText = document.getElementById('statusText');

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
