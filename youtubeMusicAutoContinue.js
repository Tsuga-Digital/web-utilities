(function (globalScope) {
  'use strict';

  if (globalScope.TsugaYoutubeMusicAutoContinue?.controller) {
    return;
  }

  const STORAGE_KEY = 'youtubeMusicAutoContinueEnabled';
  const DEFAULT_ENABLED = true;
  const POLL_INTERVAL_MS = 1000;
  const CLICK_COOLDOWN_MS = 1500;
  const PLAYBACK_RETRY_DELAYS_MS = [100, 500, 1200];
  const PROMPT_SELECTORS = [
    '[role="dialog"]',
    'tp-yt-paper-dialog',
    'paper-dialog',
    'yt-confirm-dialog-renderer',
    'ytmusic-dialog-renderer',
    'ytmusic-popup-container',
    'ytmusic-you-there-renderer',
    '.ytmusic-you-there-renderer',
    'ytd-popup-container',
    'tp-yt-paper-toast',
    'yt-notification-action-renderer',
    'ytmusic-notification-action-renderer',
    'ytm-notification-action-renderer',
    'yt-toast',
    '[role="status"]',
    '[role="alert"]'
  ];
  const BUTTON_SELECTORS = [
    '#confirm-button',
    '#button',
    'button',
    '[role="button"]',
    'a#button',
    'yt-spec-button-shape-next',
    '.ytSpecButtonShapeNextHost button',
    'yt-button-shape button',
    'tp-yt-paper-button',
    'yt-button-renderer',
    'ytmusic-button-renderer',
    'a'
  ];
  const SHADOW_HOST_SELECTORS = [
    'ytd-app',
    'ytmusic-app',
    'ytd-popup-container',
    'ytmusic-popup-container',
    'yt-confirm-dialog-renderer',
    'ytmusic-you-there-renderer',
    'yt-button-renderer',
    'ytmusic-button-renderer',
    'yt-button-shape'
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

    const asksToContinue = /continue\s+(watching|listening)|resume\s+(playback|watching|listening)|still\s+(watching|listening)/.test(text);
    const indicatesPause = /video\s+paused|playback\s+paused|\bpaused\b|\bstopped\b|will\s+pause|pause\s+soon|about\s+to\s+pause|pausing\s+soon/.test(text);
    const directContinueQuestion = /are\s+you\s+still\s+(watching|listening)/.test(text);
    const genericContinueQuestion = /\?/.test(text) && /continue\s+(watching|listening)|resume\s+(playback|watching|listening)/.test(text);
    return (asksToContinue && indicatesPause) || directContinueQuestion || genericContinueQuestion;
  }

  function isAffirmativeButtonText(value) {
    const text = normalizeText(value).replace(/[.!?]+$/, '');
    if (!text || /\b(no|cancel|close|dismiss|not now)\b/.test(text)) {
      return false;
    }

    if (AFFIRMATIVE_LABELS.has(text)) {
      return true;
    }

    return /^(yes|ok|okay|continue(?: watching| listening)?|resume(?: playback| watching| listening)?)(?:\b|\s)/.test(text);
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
    return normalizeText([
      element?.getAttribute?.('aria-label'),
      element?.innerText,
      element?.textContent
    ].filter(Boolean).join(' '));
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

  function isKnownYouTubeMusicPrompt(element) {
    const tagName = String(element?.tagName || '').toLowerCase();
    const className = normalizeText(element?.getAttribute?.('class'));
    return tagName === 'ytmusic-you-there-renderer' || className.split(' ').includes('ytmusic-you-there-renderer');
  }

  function getSearchRoots(root) {
    const roots = [root];
    const seen = new Set(roots);

    const initialShadowRoot = root?.shadowRoot;
    if (initialShadowRoot && initialShadowRoot.mode !== 'closed') {
      seen.add(initialShadowRoot);
      roots.push(initialShadowRoot);
    }

    for (let index = 0; index < roots.length; index += 1) {
      const currentRoot = roots[index];
      for (const selector of SHADOW_HOST_SELECTORS) {
        for (const host of queryAll(currentRoot, selector)) {
          const shadowRoot = host.shadowRoot;
          if (shadowRoot && shadowRoot.mode !== 'closed' && !seen.has(shadowRoot)) {
            seen.add(shadowRoot);
            roots.push(shadowRoot);
          }
        }
      }
    }

    return roots;
  }

  function findPromptDialogs(documentRef) {
    const dialogs = [];
    const seen = new Set();

    for (const root of getSearchRoots(documentRef)) {
      for (const selector of PROMPT_SELECTORS) {
        for (const dialog of queryAll(root, selector)) {
          if (seen.has(dialog) || isHidden(dialog)) {
            continue;
          }

          seen.add(dialog);
          if (isKnownYouTubeMusicPrompt(dialog) || isContinuePromptText(getPromptText(dialog))) {
            dialogs.push(dialog);
          }
        }
      }
    }

    return dialogs;
  }

  function isClickableElement(element) {
    const tagName = String(element?.tagName || '').toLowerCase();
    return tagName === 'a' || tagName === 'button' || element?.getAttribute?.('role') === 'button';
  }

  function resolveClickable(element) {
    if (isClickableElement(element)) {
      return element;
    }

    for (const root of getSearchRoots(element)) {
      for (const selector of ['button', 'a', '[role="button"]']) {
        const clickable = queryAll(root, selector).find((candidate) => !isHidden(candidate));
        if (clickable) {
          return clickable;
        }
      }
    }

    return element;
  }

  function findAffirmativeButton(dialog) {
    const candidates = [];
    const seen = new Set();

    for (const root of getSearchRoots(dialog)) {
      for (const selector of BUTTON_SELECTORS) {
        for (const button of queryAll(root, selector)) {
          if (seen.has(button) || isHidden(button) || button.disabled || button.getAttribute?.('aria-disabled') === 'true') {
            continue;
          }

          seen.add(button);
          const isStructuralConfirmButton = selector === '#confirm-button' || selector === '#button';
          if (isStructuralConfirmButton || isAffirmativeButtonText(getElementText(button))) {
            const clickable = resolveClickable(button);
            if (clickable && typeof clickable.click === 'function') {
              candidates.push(clickable);
            }
          }
        }
      }
    }

    return candidates[0] || null;
  }

  function createEscapeEvent(windowRef, type) {
    const eventInit = {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
      composed: true
    };

    if (typeof windowRef?.KeyboardEvent === 'function') {
      try {
        return new windowRef.KeyboardEvent(type, eventInit);
      } catch (_error) {
        // Fall through to a plain event object for test doubles and unusual hosts.
      }
    }

    return { type, ...eventInit };
  }

  function dispatchEscape(prompt, documentRef, windowRef) {
    const target = prompt?.dispatchEvent
      ? prompt
      : documentRef?.activeElement?.dispatchEvent
        ? documentRef.activeElement
        : documentRef?.body?.dispatchEvent
          ? documentRef.body
          : documentRef?.dispatchEvent
            ? documentRef
            : null;

    if (!target) {
      return false;
    }

    try {
      target.dispatchEvent(createEscapeEvent(windowRef, 'keydown'));
      target.dispatchEvent(createEscapeEvent(windowRef, 'keyup'));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function isSafePromptRemovalTarget(prompt) {
    const tagName = String(prompt?.tagName || '').toLowerCase();
    return !['ytmusic-popup-container', 'ytd-popup-container'].includes(tagName);
  }

  function removePrompt(prompt) {
    if (!prompt || !isSafePromptRemovalTarget(prompt)) {
      return false;
    }

    try {
      if (typeof prompt.remove === 'function') {
        prompt.remove();
        return true;
      }

      if (prompt.parentNode && typeof prompt.parentNode.removeChild === 'function') {
        prompt.parentNode.removeChild(prompt);
        return true;
      }
    } catch (_error) {
      // Ignore prompt nodes that YouTube has already detached or replaced.
    }

    return false;
  }

  function dismissPrompt(prompt, documentRef, windowRef) {
    if (isHidden(prompt)) {
      return;
    }

    dispatchEscape(prompt, documentRef, windowRef);

    const removeIfStillVisible = () => {
      if (!isHidden(prompt)) {
        removePrompt(prompt);
      }
    };

    if (typeof windowRef?.setTimeout === 'function') {
      windowRef.setTimeout(removeIfStillVisible, 100);
    } else {
      removeIfStillVisible();
    }
  }

  function resumePlayback(documentRef, windowRef) {
    const attempts = new WeakMap();

    const resume = () => {
      for (const media of queryAll(documentRef, 'video, audio')) {
        if (media.ended || !media.paused || typeof media.play !== 'function') {
          continue;
        }

        const attemptCount = attempts.get(media) || 0;
        if (attemptCount >= PLAYBACK_RETRY_DELAYS_MS.length + 1) {
          continue;
        }

        attempts.set(media, attemptCount + 1);
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

    resume();

    if (typeof windowRef?.setTimeout === 'function') {
      for (const delay of PLAYBACK_RETRY_DELAYS_MS) {
        windowRef.setTimeout(resume, delay);
      }
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
    const observedMedia = new Map();

    function watchMedia() {
      for (const media of queryAll(documentRef, 'video, audio')) {
        if (observedMedia.has(media) || typeof media.addEventListener !== 'function') {
          continue;
        }

        const onPause = () => {
          if (enabled) {
            queueScan();
          }
        };

        media.addEventListener('pause', onPause);
        observedMedia.set(media, onPause);
      }
    }

    function unwatchMedia() {
      for (const [media, onPause] of observedMedia) {
        media.removeEventListener?.('pause', onPause);
      }
      observedMedia.clear();
    }

    function scan() {
      if (!enabled || !documentRef) {
        return false;
      }

      watchMedia();

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
        dismissPrompt(dialog, documentRef, windowRef);
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
      unwatchMedia();

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
