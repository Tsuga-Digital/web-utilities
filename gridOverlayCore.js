(function (globalScope) {
  'use strict';

  const OVERLAY_ROOT_ID = 'tsuga-grid-overlay-root';
  const OVERLAY_BADGE_ID = 'tsuga-grid-overlay-badge';
  const MAX_TRACK_EDGES_PER_AXIS = 1000;

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

  function resolveCssLength(value, referenceSize = 0) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized === 'normal') {
      return 0;
    }

    const resolveTerm = (term) => {
      const match = /^([+-]?(?:\d+|\d*\.\d+))(px|%)$/.exec(term);
      if (!match) {
        return null;
      }
      const amount = Number.parseFloat(match[1]);
      return match[2] === '%' ? (amount / 100) * referenceSize : amount;
    };

    const directValue = resolveTerm(normalized);
    if (directValue !== null) {
      return directValue;
    }

    if (normalized.startsWith('calc(') && normalized.endsWith(')')) {
      const expression = normalized.slice(5, -1).replace(/\s+/g, '');
      const terms = expression.match(/[+-]?(?:\d+|\d*\.\d+)(?:px|%)/g);
      if (terms && terms.join('') === expression) {
        const resolvedTerms = terms.map(resolveTerm);
        if (resolvedTerms.every((term) => term !== null)) {
          return resolvedTerms.reduce((sum, term) => sum + term, 0);
        }
      }
    }

    return 0;
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

  function parseAlignment(value) {
    const parts = String(value || 'start')
      .trim()
      .split(/\s+/);
    const safety = parts.find((part) => part === 'safe' || part === 'unsafe') || null;
    const rawKeyword = parts.find((part) => part !== 'safe' && part !== 'unsafe') || 'start';
    const keyword = rawKeyword === 'normal' || rawKeyword === 'stretch' || rawKeyword === 'flex-start'
      ? 'start'
      : rawKeyword === 'flex-end'
        ? 'end'
        : rawKeyword;
    return { keyword, safety };
  }

  function mapPhysicalAlignment(value, physicalAxis, reverse) {
    const { keyword, safety } = parseAlignment(value);
    let mappedKeyword = keyword;

    if (keyword === 'left' || keyword === 'right') {
      if (physicalAxis !== 'horizontal') {
        mappedKeyword = 'start';
      } else if (keyword === 'left') {
        mappedKeyword = reverse ? 'end' : 'start';
      } else {
        mappedKeyword = reverse ? 'start' : 'end';
      }
    }

    return safety ? `${safety} ${mappedKeyword}` : mappedKeyword;
  }

  function collapseAutoFitTracks(trackSizes, shouldCollapse) {
    if (!shouldCollapse || !trackSizes.some((size) => size === 0)) {
      return trackSizes;
    }

    const nonZeroTracks = trackSizes.filter((size) => size > 0);
    return nonZeroTracks;
  }

  function computeTrackSegments(trackSizes, gap, availableSize, alignment, options = {}) {
    if (trackSizes.length === 0) {
      return [];
    }

    const normalizedGap = Math.max(0, gap);
    const activeTrackSizes = collapseAutoFitTracks(
      trackSizes,
      options.collapseZeroTracks === true
    );
    const tracksSize = activeTrackSizes.reduce((sum, size) => sum + size, 0);
    const baseGapsSize = normalizedGap * Math.max(0, activeTrackSizes.length - 1);
    const freeSpace = availableSize - tracksSize - baseGapsSize;
    const { keyword, safety } = parseAlignment(alignment);
    const distributableSpace = Math.max(0, freeSpace);
    let offset = 0;
    let distributedGap = 0;

    if (keyword === 'center' && (freeSpace >= 0 || safety !== 'safe')) {
      offset = freeSpace / 2;
    } else if (keyword === 'end' && (freeSpace >= 0 || safety !== 'safe')) {
      offset = freeSpace;
    } else if (keyword === 'space-between' && activeTrackSizes.length > 1) {
      distributedGap = distributableSpace / (activeTrackSizes.length - 1);
    } else if (keyword === 'space-around') {
      distributedGap = distributableSpace / activeTrackSizes.length;
      offset = distributedGap / 2;
    } else if (keyword === 'space-evenly') {
      distributedGap = distributableSpace / (activeTrackSizes.length + 1);
      offset = distributedGap;
    }

    let position = offset;
    return activeTrackSizes.map((size) => {
      const segment = { start: position, end: position + size, size };
      position = segment.end + normalizedGap + distributedGap;
      return segment;
    });
  }

  function projectSegments(segments, extent, reverse) {
    const projected = segments.map((segment) =>
      reverse
        ? { start: extent - segment.end, end: extent - segment.start, size: segment.size }
        : { ...segment }
    );
    return projected.sort((a, b) => a.start - b.start);
  }

  function getUniqueEdges(segments, offset, scale) {
    const edges = [];
    const seen = new Set();
    for (const segment of segments) {
      for (const edge of [segment.start, segment.end]) {
        const position = offset + edge * scale;
        if (!Number.isFinite(position)) {
          continue;
        }
        const key = position.toFixed(3);
        if (!seen.has(key)) {
          seen.add(key);
          edges.push(position);
        }
      }
    }
    return edges.sort((a, b) => a - b);
  }

  function isNonAxisAlignedTransform(style) {
    const rotate = String(style.rotate || 'none').trim();
    if (rotate !== 'none' && rotate !== '0deg' && rotate !== '0') {
      return true;
    }

    const scale = String(style.scale || 'none').trim();
    if (scale !== 'none') {
      const scaleValues = scale.split(/\s+/).map(Number);
      if (scaleValues.some((value) => Number.isFinite(value) && value < 0)) {
        return true;
      }
    }

    const transform = String(style.transform || 'none').trim();
    if (transform === 'none') {
      return false;
    }

    const matrix = /^matrix\(([^)]+)\)$/.exec(transform);
    if (matrix) {
      const values = matrix[1].split(',').map(Number);
      return values.length !== 6 || values.some((value) => !Number.isFinite(value)) ||
        values[0] <= 0 || values[3] <= 0 || Math.abs(values[1]) > 0.0001 || Math.abs(values[2]) > 0.0001;
    }

    return true;
  }

  function isAutoFitTemplate(element, propertyName, resolvedTrackSizes, gap, availableSize) {
    const inlineValue = element.style && String(element.style[propertyName] || '');
    if (inlineValue.includes('auto-fit')) {
      return true;
    }

    if (typeof element.computedStyleMap === 'function') {
      try {
        const cssName = propertyName === 'gridTemplateColumns' ? 'grid-template-columns' : 'grid-template-rows';
        return String(element.computedStyleMap().get(cssName) || '').includes('auto-fit');
      } catch (_error) {
        // Fall through to the size-based compatibility heuristic.
      }
    }

    const fullSize =
      resolvedTrackSizes.reduce((sum, size) => sum + size, 0) + gap * Math.max(0, resolvedTrackSizes.length - 1);
    return resolvedTrackSizes.some((size) => size === 0) && fullSize > availableSize + 0.5;
  }

  function getGridTrackGeometry(element, style, rect, getComputedStyleRef) {
    const borderLeft = resolveCssLength(style.borderLeftWidth, rect.width);
    const borderRight = resolveCssLength(style.borderRightWidth, rect.width);
    const borderTop = resolveCssLength(style.borderTopWidth, rect.height);
    const borderBottom = resolveCssLength(style.borderBottomWidth, rect.height);
    const paddingLeft = resolveCssLength(style.paddingLeft, rect.width);
    const paddingRight = resolveCssLength(style.paddingRight, rect.width);
    const paddingTop = resolveCssLength(style.paddingTop, rect.width);
    const paddingBottom = resolveCssLength(style.paddingBottom, rect.width);
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
    const writingMode = String(style.writingMode || 'horizontal-tb').toLowerCase();
    const direction = String(style.direction || 'ltr').toLowerCase();
    const isVertical = writingMode.startsWith('vertical-');
    const isSideways = writingMode.startsWith('sideways-');
    const inlineReverse = direction === 'rtl';
    const blockReverse = writingMode === 'vertical-rl';
    let current = element;
    let nonAxisAlignedTransform = isNonAxisAlignedTransform(style);

    while (!nonAxisAlignedTransform && getComputedStyleRef && current) {
      current = current.parentElement || current.parentNode || current.host || null;
      if (current && typeof current.getAttribute === 'function') {
        nonAxisAlignedTransform = isNonAxisAlignedTransform(getComputedStyleRef(current));
      }
    }

    const content = {
      left: (borderLeft + paddingLeft) * scaleX,
      top: (borderTop + paddingTop) * scaleY,
      width: contentWidth * scaleX,
      height: contentHeight * scaleY
    };

    if (isSideways || nonAxisAlignedTransform) {
      return {
        content,
        verticalEdges: [],
        horizontalEdges: [],
        unsupportedReason: isSideways ? 'sideways-writing-mode' : 'non-axis-aligned-transform',
        truncated: false
      };
    }

    const inlineSize = isVertical ? contentHeight : contentWidth;
    const blockSize = isVertical ? contentWidth : contentHeight;
    const columnGap = resolveCssLength(style.columnGap, inlineSize);
    const rowGap = resolveCssLength(style.rowGap, blockSize);
    const collapseColumns = isAutoFitTemplate(
      element,
      'gridTemplateColumns',
      columnSizes,
      columnGap,
      inlineSize
    );
    const collapseRows = isAutoFitTemplate(element, 'gridTemplateRows', rowSizes, rowGap, blockSize);
    const columnAxis = isVertical ? 'vertical' : 'horizontal';
    const rowAxis = isVertical ? 'horizontal' : 'vertical';
    const columns = projectSegments(
      computeTrackSegments(
        columnSizes,
        columnGap,
        inlineSize,
        mapPhysicalAlignment(style.justifyContent, columnAxis, inlineReverse),
        { collapseZeroTracks: collapseColumns }
      ),
      inlineSize,
      inlineReverse
    );
    const rows = projectSegments(
      computeTrackSegments(
        rowSizes,
        rowGap,
        blockSize,
        mapPhysicalAlignment(style.alignContent, rowAxis, blockReverse),
        { collapseZeroTracks: collapseRows }
      ),
      blockSize,
      blockReverse
    );

    const verticalSegments = isVertical ? rows : columns;
    const horizontalSegments = isVertical ? columns : rows;
    const verticalEdges = getUniqueEdges(verticalSegments, content.left, scaleX);
    const horizontalEdges = getUniqueEdges(horizontalSegments, content.top, scaleY);
    const truncated =
      verticalEdges.length > MAX_TRACK_EDGES_PER_AXIS || horizontalEdges.length > MAX_TRACK_EDGES_PER_AXIS;

    return {
      content,
      verticalEdges: verticalEdges.slice(0, MAX_TRACK_EDGES_PER_AXIS),
      horizontalEdges: horizontalEdges.slice(0, MAX_TRACK_EDGES_PER_AXIS),
      unsupportedReason: null,
      truncated
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

  function formatSvgCoordinate(value) {
    return Number(value.toFixed(3));
  }

  function appendTrackGraphic(documentRef, outline, rect, geometry) {
    if (geometry.verticalEdges.length === 0 && geometry.horizontalEdges.length === 0) {
      return;
    }

    const svgNamespace = 'http://www.w3.org/2000/svg';
    const svg = documentRef.createElementNS(svgNamespace, 'svg');
    const path = documentRef.createElementNS(svgNamespace, 'path');
    svg.setAttribute('data-tsuga-grid-overlay', 'true');
    svg.setAttribute('data-tsuga-grid-tracks', 'true');
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    svg.setAttribute('width', String(rect.width));
    svg.setAttribute('height', String(rect.height));

    Object.assign(svg.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      overflow: 'visible',
      pointerEvents: 'none'
    });

    const contentTop = formatSvgCoordinate(geometry.content.top);
    const contentBottom = formatSvgCoordinate(geometry.content.top + geometry.content.height);
    const contentLeft = formatSvgCoordinate(geometry.content.left);
    const contentRight = formatSvgCoordinate(geometry.content.left + geometry.content.width);
    const commands = [
      ...geometry.verticalEdges.map(
        (position) => `M ${formatSvgCoordinate(position)} ${contentTop} V ${contentBottom}`
      ),
      ...geometry.horizontalEdges.map(
        (position) => `M ${contentLeft} ${formatSvgCoordinate(position)} H ${contentRight}`
      )
    ];

    path.setAttribute('data-tsuga-grid-overlay', 'true');
    path.setAttribute('d', commands.join(' '));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(234, 88, 12, 0.95)');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(path);
    outline.appendChild(svg);
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
      border: '0',
      outline: '2px solid rgba(37, 99, 235, 0.95)',
      background: 'rgba(37, 99, 235, 0.04)',
      pointerEvents: 'none'
    });

    const label = documentRef.createElement('div');
    const status = geometry.unsupportedReason
      ? ` · ${geometry.unsupportedReason.replaceAll('-', ' ')}`
      : geometry.truncated
        ? ' · track limit reached'
        : '';
    label.textContent = `grid ${index + 1}${status}`;
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
    appendTrackGraphic(documentRef, outline, rect, geometry);
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
        const geometry = getGridTrackGeometry(grid, style, rect, getComputedStyleRef);
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
    resolveCssLength,
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
