(function (globalScope) {
  'use strict';

  const OVERLAY_ROOT_ID = 'tsuga-grid-overlay-root';
  const OVERLAY_BADGE_ID = 'tsuga-grid-overlay-badge';

  function isGridDisplay(displayValue) {
    return displayValue === 'grid' || displayValue === 'inline-grid';
  }

  function shouldSkipElement(element) {
    if (!element || typeof element.getAttribute !== 'function') {
      return true;
    }
    return (
      element.id === OVERLAY_ROOT_ID ||
      element.id === OVERLAY_BADGE_ID ||
      element.getAttribute('data-tsuga-grid-overlay') === 'true'
    );
  }

  function forEachElementDeep(rootNode, callback) {
    const stack = [rootNode];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || !current.children) {
        continue;
      }

      for (const child of current.children) {
        callback(child);
        if (child.shadowRoot && child.shadowRoot.mode === 'open') {
          stack.push(child.shadowRoot);
        }
        stack.push(child);
      }
    }
  }

  function findGridContainers(documentRef, getComputedStyleRef) {
    const grids = [];

    forEachElementDeep(documentRef, (element) => {
      if (shouldSkipElement(element)) {
        return;
      }
      const style = getComputedStyleRef(element);
      if (style && isGridDisplay(style.display)) {
        grids.push(element);
      }
    });

    return grids;
  }

  function createOverlayRoot(documentRef) {
    const overlayRoot = documentRef.createElement('div');
    overlayRoot.id = OVERLAY_ROOT_ID;
    overlayRoot.setAttribute('data-tsuga-grid-overlay', 'true');

    Object.assign(overlayRoot.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '2147483647',
      overflow: 'hidden',
      boxSizing: 'border-box'
    });

    return overlayRoot;
  }

  function createOverlayBadge(documentRef) {
    const badge = documentRef.createElement('div');
    badge.id = OVERLAY_BADGE_ID;
    badge.setAttribute('data-tsuga-grid-overlay', 'true');

    Object.assign(badge.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      padding: '6px 10px',
      borderRadius: '999px',
      background: 'rgba(17, 24, 39, 0.9)',
      color: '#f9fafb',
      fontSize: '12px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontWeight: '600',
      pointerEvents: 'none',
      zIndex: '2147483647'
    });

    return badge;
  }

  function createGridOutline(documentRef, rect, index) {
    const outline = documentRef.createElement('div');
    outline.setAttribute('data-tsuga-grid-overlay', 'true');

    Object.assign(outline.style, {
      position: 'absolute',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      boxSizing: 'border-box',
      border: '2px solid rgba(37, 99, 235, 0.95)',
      background: 'rgba(37, 99, 235, 0.08)',
      pointerEvents: 'none'
    });

    const label = documentRef.createElement('div');
    label.textContent = `grid ${index + 1}`;
    label.setAttribute('data-tsuga-grid-overlay', 'true');

    Object.assign(label.style, {
      position: 'absolute',
      left: '0',
      top: '-18px',
      padding: '1px 6px',
      borderRadius: '4px',
      background: 'rgba(37, 99, 235, 0.95)',
      color: '#ffffff',
      fontSize: '11px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      whiteSpace: 'nowrap'
    });

    outline.appendChild(label);
    return outline;
  }

  function createInspector(environment) {
    const documentRef = environment.document;
    const windowRef = environment.window;
    const getComputedStyleRef = environment.getComputedStyle;
    const MutationObserverRef = environment.MutationObserver;

    let enabled = false;
    let overlayRoot = null;
    let overlayBadge = null;
    let observer = null;
    let queuedRefreshHandle = null;
    let hasQueuedRefresh = false;
    let shouldRescanShadowRoots = false;
    const rootObservers = [];
    const requestFrame =
      typeof windowRef.requestAnimationFrame === 'function'
        ? (callback) => windowRef.requestAnimationFrame(callback)
        : (callback) => setTimeout(callback, 16);
    const cancelFrame =
      typeof windowRef.cancelAnimationFrame === 'function'
        ? (handle) => windowRef.cancelAnimationFrame(handle)
        : (handle) => clearTimeout(handle);

    function cleanupRootObservers() {
      while (rootObservers.length > 0) {
        const currentObserver = rootObservers.pop();
        currentObserver.disconnect();
      }
    }

    function updateStateMarker() {
      if (documentRef.documentElement && documentRef.documentElement.dataset) {
        documentRef.documentElement.dataset.tsugaGridOverlayState = enabled ? 'enabled' : 'disabled';
      }
    }

    function collectOpenShadowRoots() {
      const roots = [];
      forEachElementDeep(documentRef, (element) => {
        if (element.shadowRoot && element.shadowRoot.mode === 'open') {
          roots.push(element.shadowRoot);
        }
      });
      return roots;
    }

    function isOverlayNode(node) {
      if (!node) {
        return false;
      }
      if (node === overlayRoot || node === overlayBadge) {
        return true;
      }
      return typeof node.getAttribute === 'function' && node.getAttribute('data-tsuga-grid-overlay') === 'true';
    }

    function isInsideOverlay(node) {
      let current = node;
      while (current) {
        if (isOverlayNode(current)) {
          return true;
        }
        current = current.parentNode || current.host || null;
      }
      return false;
    }

    function hasNodeOutsideOverlay(nodes) {
      if (!nodes) {
        return false;
      }
      for (const node of nodes) {
        if (!isInsideOverlay(node)) {
          return true;
        }
      }
      return false;
    }

    function hasRelevantMutations(mutations) {
      if (!Array.isArray(mutations) || mutations.length === 0) {
        return true;
      }

      for (const mutation of mutations) {
        if (!mutation || !mutation.type) {
          return true;
        }

        if (mutation.type === 'attributes') {
          if (!isInsideOverlay(mutation.target)) {
            return true;
          }
          continue;
        }

        if (mutation.type === 'childList') {
          if (hasNodeOutsideOverlay(mutation.addedNodes) || hasNodeOutsideOverlay(mutation.removedNodes)) {
            return true;
          }
          if (!isInsideOverlay(mutation.target) && !isOverlayNode(mutation.target)) {
            return true;
          }
          continue;
        }

        return true;
      }

      return false;
    }

    function cancelQueuedRefresh() {
      if (!hasQueuedRefresh || queuedRefreshHandle === null) {
        return;
      }
      cancelFrame(queuedRefreshHandle);
      hasQueuedRefresh = false;
      queuedRefreshHandle = null;
      shouldRescanShadowRoots = false;
    }

    function flushQueuedRefresh() {
      hasQueuedRefresh = false;
      queuedRefreshHandle = null;
      const needsShadowRescan = shouldRescanShadowRoots;
      shouldRescanShadowRoots = false;

      if (!enabled) {
        return;
      }

      refresh();
      if (needsShadowRescan) {
        observeOpenShadowRoots();
      }
    }

    function queueRefresh(options = {}) {
      if (!enabled) {
        return;
      }
      if (options.rescanShadowRoots) {
        shouldRescanShadowRoots = true;
      }
      if (hasQueuedRefresh) {
        return;
      }
      hasQueuedRefresh = true;
      queuedRefreshHandle = requestFrame(flushQueuedRefresh);
    }

    function refresh() {
      if (!enabled || !overlayRoot || !overlayBadge) {
        return 0;
      }

      overlayRoot.textContent = '';

      const grids = findGridContainers(documentRef, getComputedStyleRef);
      grids.forEach((grid, index) => {
        const rect = grid.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          return;
        }
        overlayRoot.appendChild(createGridOutline(documentRef, rect, index));
      });

      overlayBadge.textContent = `Grid overlay enabled (${grids.length})`;
      return grids.length;
    }

    function onMutation(mutations) {
      if (!hasRelevantMutations(mutations)) {
        return;
      }
      queueRefresh();
    }

    function onRootMutation(mutations) {
      if (!hasRelevantMutations(mutations)) {
        return;
      }
      queueRefresh({ rescanShadowRoots: true });
    }

    function onViewportChange() {
      queueRefresh();
    }

    function observeOpenShadowRoots() {
      if (!observer) {
        return;
      }
      cleanupRootObservers();
      const roots = collectOpenShadowRoots();
      for (const root of roots) {
        const shadowObserver = new MutationObserverRef(onRootMutation);
        shadowObserver.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style']
        });
        rootObservers.push(shadowObserver);
      }
    }

    function startObservers() {
      if (!MutationObserverRef || !documentRef.documentElement) {
        return;
      }

      observer = new MutationObserverRef((mutations) => {
        onRootMutation(mutations);
      });

      observer.observe(documentRef.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });

      observeOpenShadowRoots();
      windowRef.addEventListener('resize', onViewportChange, true);
      windowRef.addEventListener('scroll', onViewportChange, true);
    }

    function stopObservers() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      cancelQueuedRefresh();
      cleanupRootObservers();
      windowRef.removeEventListener('resize', onViewportChange, true);
      windowRef.removeEventListener('scroll', onViewportChange, true);
    }

    function ensureOverlayNodes() {
      if (!overlayRoot) {
        overlayRoot = createOverlayRoot(documentRef);
        documentRef.documentElement.appendChild(overlayRoot);
      }
      if (!overlayBadge) {
        overlayBadge = createOverlayBadge(documentRef);
        documentRef.documentElement.appendChild(overlayBadge);
      }
    }

    function removeOverlayNodes() {
      if (overlayRoot && overlayRoot.parentNode) {
        overlayRoot.parentNode.removeChild(overlayRoot);
      }
      if (overlayBadge && overlayBadge.parentNode) {
        overlayBadge.parentNode.removeChild(overlayBadge);
      }
      overlayRoot = null;
      overlayBadge = null;
    }

    function enable() {
      if (enabled) {
        return { enabled: true, gridCount: refresh() };
      }

      enabled = true;
      ensureOverlayNodes();
      const gridCount = refresh();
      startObservers();
      updateStateMarker();
      return { enabled: true, gridCount };
    }

    function disable() {
      if (!enabled) {
        updateStateMarker();
        return { enabled: false, gridCount: 0 };
      }

      enabled = false;
      stopObservers();
      removeOverlayNodes();
      updateStateMarker();
      return { enabled: false, gridCount: 0 };
    }

    function toggle() {
      return enabled ? disable() : enable();
    }

    function status() {
      return { enabled, gridCount: enabled ? findGridContainers(documentRef, getComputedStyleRef).length : 0 };
    }

    updateStateMarker();

    return {
      enable,
      disable,
      toggle,
      refresh,
      status
    };
  }

  const exportsObject = {
    OVERLAY_ROOT_ID,
    OVERLAY_BADGE_ID,
    isGridDisplay,
    findGridContainers,
    createInspector
  };

  globalScope.TsugaGridOverlayCore = exportsObject;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
