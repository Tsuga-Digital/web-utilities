(function (globalScope) {
  'use strict';

  if (globalScope.TsugaYoutubeMusicAutoContinue?.controller) {
    return;
  }

  const STORAGE_KEY = 'youtubeMusicAutoContinueEnabled';
  const DEFAULT_ENABLED = true;
  const POLL_INTERVAL_MS = 1000;
  const CLICK_COOLDOWN_MS = 1500;
  const PROMPT_SELECTORS = [
    '[role="dialog"]',
    'tp-yt-paper-dialog',
    'paper-dialog',
    'yt-confirm-dialog-renderer',
    'ytmusic-dialog-renderer',
    'ytmusic-popup-container',
    'ytd-popup-container'
  ];
  const BUTTON_SELECTORS = [
    '#confirm-button',
    'button',
    '[role="button"]',
    'tp-yt-paper-button',
    'yt-button-renderer',
    'ytmusic-button-renderer'
  ];
  const AFFIRMATIVE_LABELS = new Set([
    'yes',
    'ok',
    'okay',
    'continue',
    'continue watching',
    'resume',
    'resume playback',
    "i'm still watching"
  ]);

  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isContinuePromptText(value) {
    const text = normalizeText(value);
    if (!text) {
      return false;
    }

    const asksToContinue = /continue watching|resume playback|still watching|still listening/.test(text);
    const indicatesPause = /video paused|playback paused|paused/.test(text);
    const directContinueQuestion = /are you still watching|are you still listening/.test(text);
    return (asksToContinue && indicatesPause) || directContinueQuestion;
  }

  function isAffirmativeButtonText(value) {
    const text = normalizeText(value);
    if (!text || /\b(no|cancel|close|dismiss|not now)\b/.test(text)) {
      return false;
    }

    return AFFIRMATIVE_LABELS.has(text);
  }

  function queryAll(root, selector) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return [];
    }

    try {
      return [...root.querySelectorAll(selector)];
    } catch (_error) {
      return [];
    }
  }

  function getElementText(element) {
    return normalizeText(
      element?.getAttribute?.('aria-label') ||
      element?.innerText ||
      element?.textContent ||
      ''
    );
  }

  function getPromptText(element) {
    return normalizeText([
      element?.getAttribute?.('dialog-title'),
      element?.getAttribute?.('aria-label'),
      element?.getAttribute?.('title'),
      element?.innerText,
      element?.textContent
    ].filter(Boolean).join(' '));
  }

  function isHidden(element) {
    if (!element) {
      return true;
    }
    if (element.hidden || element.getAttribute?.('aria-hidden') === 'true') {
      return true;
    }

    const style = element.style;
    return style?.display === 'none' || style?.visibility === 'hidden';
  }

  function findPromptDialogs(documentRef) {
    const dialogs = [];
    const seen = new Set();

    for (const selector of PROMPT_SELECTORS) {
      for (const dialog of queryAll(documentRef, selector)) {
        if (seen.has(dialog) || isHidden(dialog)) {
          continue;
        }

        seen.add(dialog);
        if (isContinuePromptText(getPromptText(dialog))) {
          dialogs.push(dialog);
        }
      }
    }

    return dialogs;
  }

  function findAffirmativeButton(dialog) {
    const candidates = [];
    const seen = new Set();

    for (const selector of BUTTON_SELECTORS) {
      for (const button of queryAll(dialog, selector)) {
        if (seen.has(button) || button.disabled || button.getAttribute?.('aria-disabled') === 'true') {
          continue;
        }

        seen.add(button);
        if (isAffirmativeButtonText(getElementText(button))) {
          candidates.push(button);
        }
      }
    }

    return candidates[0] || null;
  }

  function resumePlayback(documentRef, windowRef) {
    const resume = () => {
      for (const media of queryAll(documentRef, 'video, audio')) {
        if (!media.paused || typeof media.play !== 'function') {
          continue;
        }

        try {
          const result = media.play();
          result?.catch?.(() => {
            // The browser may reject playback if the user has not interacted yet.
          });
        } catch (_error) {
          // Ignore individual media elements that cannot be resumed.
        }
      }
    };

    if (typeof windowRef?.setTimeout === 'function') {
      windowRef.setTimeout(resume, 100);
    } else {
      resume();
    }
  }

  function createController({
    documentRef,
    windowRef,
    MutationObserverRef,
    storageArea
  }) {
    let enabled = DEFAULT_ENABLED;
    let observer = null;
    let scanTimer = null;
    let pollTimer = null;
    let lastHandled = new WeakMap();

    function scan() {
      if (!enabled || !documentRef) {
        return false;
      }

      let handled = false;
      for (const dialog of findPromptDialogs(documentRef)) {
        const promptText = getPromptText(dialog);
        const previous = lastHandled.get(dialog);
        if (
          previous?.text === promptText &&
          Date.now() - previous.timestamp < CLICK_COOLDOWN_MS
        ) {
          continue;
        }

        const button = findAffirmativeButton(dialog);
        if (!button || typeof button.click !== 'function') {
          continue;
        }

        lastHandled.set(dialog, { text: promptText, timestamp: Date.now() });
        button.click();
        resumePlayback(documentRef, windowRef);
        handled = true;
      }

      return handled;
    }

    function queueScan() {
      if (!enabled || scanTimer !== null) {
        return;
      }

      const run = () => {
        scanTimer = null;
        scan();
      };

      if (typeof windowRef?.requestAnimationFrame === 'function') {
        scanTimer = windowRef.requestAnimationFrame(run);
      } else if (typeof windowRef?.setTimeout === 'function') {
        scanTimer = windowRef.setTimeout(run, 50);
      } else {
        run();
      }
    }

    function start() {
      if (!enabled || !documentRef) {
        return;
      }

      if (!observer && typeof MutationObserverRef === 'function') {
        observer = new MutationObserverRef(queueScan);
        observer.observe(documentRef.documentElement || documentRef, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['aria-hidden', 'class', 'hidden', 'style']
        });
      }

      if (pollTimer === null && typeof windowRef?.setInterval === 'function') {
        pollTimer = windowRef.setInterval(scan, POLL_INTERVAL_MS);
      }

      scan();
    }

    function stop() {
      observer?.disconnect?.();
      observer = null;

      if (pollTimer !== null && typeof windowRef?.clearInterval === 'function') {
        windowRef.clearInterval(pollTimer);
      }
      pollTimer = null;

      if (scanTimer !== null) {
        if (typeof windowRef?.cancelAnimationFrame === 'function') {
          windowRef.cancelAnimationFrame(scanTimer);
        } else if (typeof windowRef?.clearTimeout === 'function') {
          windowRef.clearTimeout(scanTimer);
        }
        scanTimer = null;
      }

      lastHandled = new WeakMap();
    }

    async function setEnabled(nextEnabled) {
      enabled = Boolean(nextEnabled);
      if (enabled) {
        start();
      } else {
        stop();
      }

      await storageArea?.set?.({ [STORAGE_KEY]: enabled });
      return enabled;
    }

    async function init() {
      try {
        const stored = await storageArea?.get?.(STORAGE_KEY);
        if (stored && typeof stored[STORAGE_KEY] === 'boolean') {
          enabled = stored[STORAGE_KEY];
        }
      } catch (_error) {
        enabled = DEFAULT_ENABLED;
      }

      if (enabled) {
        start();
      }
    }

    return {
      init,
      scan,
      setEnabled,
      start,
      stop,
      isEnabled: () => enabled
    };
  }

  const browserApi = globalScope.browser ?? globalScope.chrome ?? null;
  const controller = createController({
    documentRef: globalScope.document,
    windowRef: globalScope,
    MutationObserverRef: globalScope.MutationObserver,
    storageArea: browserApi?.storage?.local
  });

  globalScope.TsugaYoutubeMusicAutoContinue = {
    createController,
    isContinuePromptText,
    isAffirmativeButtonText,
    controller
  };

  browserApi?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'set-youtube-music-auto-continue') {
      return false;
    }

    controller
      .setEnabled(message.enabled)
      .then((enabled) => sendResponse({ ok: true, enabled }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  });

  void controller.init();
})(globalThis);
