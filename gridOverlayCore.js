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

  function parsePixelValue(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseResolvedTrackSizes(value) {
    if (!value || value === 'none' || value === 'subgrid') {
      return [];
    }

    const tokens = [];
    let token = '';
    let bracketDepth = 0;
    let parenthesisDepth = 0;

    for (const character of value.trim()) {
      if (character === '[') {
        bracketDepth += 1;
      } else if (character === ']') {
        bracketDepth = Math.max(0, bracketDepth - 1);
      } else if (character === '(') {
        parenthesisDepth += 1;
      } else if (character === ')') {
        parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      }

      if (/\s/.test(character) && bracketDepth === 0 && parenthesisDepth === 0) {
        if (token) {
          tokens.push(token);
          token = '';
        }
      } else {
        token += character;
      }
    }

    if (token) {
      tokens.push(token);
    }

    return tokens
      .filter((current) => /^-?(?:\d+|\d*\.\d+)px$/i.test(current))
      .map((current) => Math.max(0, Number.parseFloat(current)));
  }

  function normalizeAlignment(value) {
    const parts = String(value || 'start')
      .trim()
      .split(/\s+/)
      .filter((part) => part !== 'safe' && part !== 'unsafe');
    const alignment = parts.at(-1) || 'start';
    return alignment === 'normal' || alignment === 'stretch' ? 'start' : alignment;
  }

  function computeTrackSegments(trackSizes, gap, availableSize, alignment) {
    if (trackSizes.length === 0) {
      return [];
    }

    const normalizedGap = Math.max(0, gap);
    const tracksSize = trackSizes.reduce((sum, size) => sum + size, 0);
    const baseGapsSize = normalizedGap * Math.max(0, trackSizes.length - 1);
    const freeSpace = Math.max(0, availableSize - tracksSize - baseGapsSize);
    const normalizedAlignment = normalizeAlignment(alignment);
    let offset = 0;
    let distributedGap = 0;

    if (normalizedAlignment === 'center') {
      offset = freeSpace / 2;
    } else if (normalizedAlignment === 'end' || normalizedAlignment === 'flex-end') {
      offset = freeSpace;
    } else if (normalizedAlignment === 'space-between' && trackSizes.length > 1) {
      distributedGap = freeSpace / (trackSizes.length - 1);
    } else if (normalizedAlignment === 'space-around') {
      distributedGap = freeSpace / trackSizes.length;
      offset = distributedGap / 2;
    } else if (normalizedAlignment === 'space-evenly') {
      distributedGap = freeSpace / (trackSizes.length + 1);
      offset = distributedGap;
    }

    let position = offset;
    return trackSizes.map((size) => {
      const segment = { start: position, end: position + size, size };
      position = segment.end + normalizedGap + distributedGap;
      return segment;
    });
  }

  function getGridTrackGeometry(element, style, rect) {
    const borderLeft = parsePixelValue(style.borderLeftWidth);
    const borderRight = parsePixelValue(style.borderRightWidth);
    const borderTop = parsePixelValue(style.borderTopWidth);
    const borderBottom = parsePixelValue(style.borderBottomWidth);
    const paddingLeft = parsePixelValue(style.paddingLeft);
    const paddingRight = parsePixelValue(style.paddingRight);
    const paddingTop = parsePixelValue(style.paddingTop);
    const paddingBottom = parsePixelValue(style.paddingBottom);
    const layoutWidth = Number(element.offsetWidth) || rect.width;
    const layoutHeight = Number(element.offsetHeight) || rect.height;
    const scaleX = layoutWidth > 0 ? rect.width / layoutWidth : 1;
    const scaleY = layoutHeight > 0 ? rect.height / layoutHeight : 1;
    const contentWidth = Math.max(
      0,
      (Number(element.clientWidth) || layoutWidth - borderLeft - borderRight) - paddingLeft - paddingRight
    );
    const contentHeight = Math.max(
      0,
      (Number(element.clientHeight) || layoutHeight - borderTop - borderBottom) - paddingTop - paddingBottom
    );
    const columnSizes = parseResolvedTrackSizes(style.gridTemplateColumns);
    const rowSizes = parseResolvedTrackSizes(style.gridTemplateRows);

    return {
      content: {
        left: (borderLeft + paddingLeft) * scaleX,
        top: (borderTop + paddingTop) * scaleY,
        width: contentWidth * scaleX,
        height: contentHeight * scaleY
      },
      columns: computeTrackSegments(
        columnSizes,
        parsePixelValue(style.columnGap),
        contentWidth,
        style.justifyContent
      ).map((segment) => ({
        start: segment.start * scaleX,
        end: segment.end * scaleX,
        size: segment.size * scaleX
      })),
      rows: computeTrackSegments(
        rowSizes,
        parsePixelValue(style.rowGap),
        contentHeight,
        style.alignContent
      ).map((segment) => ({
        start: segment.start * scaleY,
        end: segment.end * scaleY,
        size: segment.size * scaleY
      }))
    };
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

  function createTrackLine(documentRef, axis, position, crossStart, crossSize, edge) {
    const line = documentRef.createElement('div');
    line.setAttribute('data-tsuga-grid-overlay', 'true');
    line.setAttribute('data-tsuga-grid-axis', axis);
    line.setAttribute('data-tsuga-grid-edge', edge);

    Object.assign(line.style, {
      position: 'absolute',
      pointerEvents: 'none',
      background: 'rgba(234, 88, 12, 0.95)'
    });

    if (axis === 'column') {
      Object.assign(line.style, {
        left: `${position}px`,
        top: `${crossStart}px`,
        width: '1px',
        height: `${crossSize}px`
      });
    } else {
      Object.assign(line.style, {
        left: `${crossStart}px`,
        top: `${position}px`,
        width: `${crossSize}px`,
        height: '1px'
      });
    }

    return line;
  }

  function appendTrackLines(documentRef, outline, geometry) {
    for (const segment of geometry.columns) {
      outline.appendChild(
        createTrackLine(
          documentRef,
          'column',
          geometry.content.left + segment.start,
          geometry.content.top,
          geometry.content.height,
          'start'
        )
      );
      outline.appendChild(
        createTrackLine(
          documentRef,
          'column',
          geometry.content.left + segment.end,
          geometry.content.top,
          geometry.content.height,
          'end'
        )
      );
    }

    for (const segment of geometry.rows) {
      outline.appendChild(
        createTrackLine(
          documentRef,
          'row',
          geometry.content.top + segment.start,
          geometry.content.left,
          geometry.content.width,
          'start'
        )
      );
      outline.appendChild(
        createTrackLine(
          documentRef,
          'row',
          geometry.content.top + segment.end,
          geometry.content.left,
          geometry.content.width,
          'end'
        )
      );
    }
  }

  function createGridOutline(documentRef, rect, index, geometry) {
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
      background: 'rgba(37, 99, 235, 0.04)',
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
    appendTrackLines(documentRef, outline, geometry);
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
        const style = getComputedStyleRef(grid);
        const geometry = getGridTrackGeometry(grid, style, rect);
        overlayRoot.appendChild(createGridOutline(documentRef, rect, index, geometry));
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
    parseResolvedTrackSizes,
    computeTrackSegments,
    getGridTrackGeometry,
    createInspector
  };

  globalScope.TsugaGridOverlayCore = exportsObject;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObject;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
