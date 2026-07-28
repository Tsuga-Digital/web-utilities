const extensionApi = globalThis.browser ?? globalThis.chrome;

async function toggleGridHighlighter() {
  const statusEl = document.getElementById("status");

  try {
    const tabs = await extensionApi.tabs.query({ active: true, currentWindow: true });
    const [activeTab] = tabs;

    if (!activeTab?.id) {
      statusEl.textContent = "No active tab available.";
      return;
    }

    const response = await extensionApi.tabs.sendMessage(activeTab.id, {
      action: "toggle-grid-highlighter"
    });

    if (!response) {
      statusEl.textContent = "No response from content script.";
      return;
    }

    statusEl.textContent = response.enabled
      ? `Grid highlighter enabled (${response.count} containers).`
      : "Grid highlighter disabled.";
  } catch (error) {
    statusEl.textContent = "Unable to run on this page.";
  }
}

document.getElementById("toggle-grid").addEventListener("click", () => {
  void toggleGridHighlighter();
});
