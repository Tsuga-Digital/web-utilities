'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../gridOverlayCore');

class FakeMutationObserver {
  static observers = new Set();
  static callbackCount = 0;
  static maxCallbackCount = 200;

  static reset() {
    FakeMutationObserver.observers.clear();
    FakeMutationObserver.callbackCount = 0;
  }

  static isObservedNode(target, candidate, includeSubtree) {
    if (target === candidate) {
      return true;
    }
    if (!includeSubtree) {
      return false;
    }
    let current = candidate;
    while (current) {
      if (current === target) {
        return true;
      }
      current = current.parentNode || current.host || null;
    }
    return false;
  }

  static notify(record) {
    for (const observer of FakeMutationObserver.observers) {
      if (observer.disconnected) {
        continue;
      }

      for (const observed of observer.observed) {
        const options = observed.options || {};
        const isMatchingNode = FakeMutationObserver.isObservedNode(observed.target, record.target, options.subtree);
        if (!isMatchingNode) {
          continue;
        }

        if (record.type === 'childList' && !options.childList) {
          continue;
        }
        if (record.type === 'attributes') {
          if (!options.attributes) {
            continue;
          }
          if (options.attributeFilter && !options.attributeFilter.includes(record.attributeName)) {
            continue;
          }
        }

        FakeMutationObserver.callbackCount += 1;
        if (FakeMutationObserver.callbackCount > FakeMutationObserver.maxCallbackCount) {
          throw new Error('MutationObserver callback limit exceeded.');
        }

        observer.callback([record]);
        break;
      }
    }
  }

  constructor(callback) {
    this.callback = callback;
    this.observed = [];
    this.disconnected = false;
    FakeMutationObserver.observers.add(this);
  }

  observe(target, options) {
    this.observed.push({ target, options });
  }

  disconnect() {
    this.disconnected = true;
  }
}

function createElement(tagName) {
  let textContentValue = '';

  const element = {
    tagName,
    id: '',
    parentNode: null,
    children: [],
    style: {},
    dataset: {},
    attributes: {},
    shadowRoot: null,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      FakeMutationObserver.notify({
        type: 'childList',
        target: this,
        addedNodes: [child],
        removedNodes: []
      });
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
        child.parentNode = null;
        FakeMutationObserver.notify({
          type: 'childList',
          target: this,
          addedNodes: [],
          removedNodes: [child]
        });
      }
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      FakeMutationObserver.notify({
        type: 'attributes',
        target: this,
        attributeName: name
      });
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    getBoundingClientRect() {
      return this._rect || { left: 0, top: 0, width: 100, height: 100 };
    }
  };

  Object.defineProperty(element, 'textContent', {
    get() {
      return textContentValue;
    },
    set(value) {
      textContentValue = String(value);
      if (element.children.length > 0) {
        const removedNodes = [...element.children];
        element.children.length = 0;
        for (const child of removedNodes) {
          child.parentNode = null;
        }
        FakeMutationObserver.notify({
          type: 'childList',
          target: element,
          addedNodes: [],
          removedNodes
        });
      }
    }
  });

  return element;
}

function createShadowRoot(host) {
  return {
    mode: 'open',
    host,
    parentNode: host,
    children: [],
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      FakeMutationObserver.notify({
        type: 'childList',
        target: this,
        addedNodes: [child],
        removedNodes: []
      });
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
        child.parentNode = null;
        FakeMutationObserver.notify({
          type: 'childList',
          target: this,
          addedNodes: [],
          removedNodes: [child]
        });
      }
      return child;
    }
  };
}

function findById(root, id) {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children || []) {
    const match = findById(child, id);
    if (match) {
      return match;
    }
  }
  return null;
}

function createFakeDom() {
  FakeMutationObserver.reset();

  const documentElement = createElement('html');
  const body = createElement('body');
  documentElement.appendChild(body);

  const documentRef = {
    children: [documentElement],
    documentElement,
    body,
    createElement,
    createElementNS(_namespace, tagName) {
      return createElement(tagName);
    },
    getElementById(id) {
      return findById(documentElement, id);
    }
  };

  const windowRef = {
    listeners: [],
    rafCallbacks: [],
    nextRafId: 1,
    addEventListener(type) {
      this.listeners.push(type);
    },
    removeEventListener(type) {
      this.listeners = this.listeners.filter((name) => name !== type);
    },
    requestAnimationFrame(callback) {
      const id = this.nextRafId;
      this.nextRafId += 1;
      this.rafCallbacks.push({ id, callback });
      return id;
    },
    cancelAnimationFrame(id) {
      this.rafCallbacks = this.rafCallbacks.filter((item) => item.id !== id);
    },
    flushAnimationFrames() {
      const callbacks = this.rafCallbacks;
      this.rafCallbacks = [];
      for (const entry of callbacks) {
        entry.callback();
      }
    }
  };

  const getComputedStyle = (element) => ({
    display: element._display || 'block',
    gridTemplateColumns: element._gridTemplateColumns || 'none',
    gridTemplateRows: element._gridTemplateRows || 'none',
    columnGap: element._columnGap || '0px',
    rowGap: element._rowGap || '0px',
    justifyContent: element._justifyContent || 'normal',
    alignContent: element._alignContent || 'normal',
    borderLeftWidth: element._borderLeftWidth || '0px',
    borderRightWidth: element._borderRightWidth || '0px',
    borderTopWidth: element._borderTopWidth || '0px',
    borderBottomWidth: element._borderBottomWidth || '0px',
    paddingLeft: element._paddingLeft || '0px',
    paddingRight: element._paddingRight || '0px',
    paddingTop: element._paddingTop || '0px',
    paddingBottom: element._paddingBottom || '0px',
    direction: element._direction || 'ltr',
    writingMode: element._writingMode || 'horizontal-tb',
    transform: element._transform || 'none',
    rotate: element._rotate || 'none',
    scale: element._scale || 'none'
  });

  return { documentRef, windowRef, getComputedStyle };
}

function addGrid(
  parent,
  {
    display = 'grid',
    rect,
    position,
    columns = 'none',
    rows = 'none',
    columnGap = '0px',
    rowGap = '0px',
    direction = 'ltr',
    writingMode = 'horizontal-tb'
  } = {}
) {
  const el = createElement('div');
  el._display = display;
  el._rect = rect || { left: 10, top: 10, width: 120, height: 80 };
  el._gridTemplateColumns = columns;
  el._gridTemplateRows = rows;
  el._columnGap = columnGap;
  el._rowGap = rowGap;
  el._direction = direction;
  el._writingMode = writingMode;
  if (position) {
    el.style.position = position;
  }
  parent.appendChild(el);
  return el;
}

test('findGridContainers detects grid and inline-grid in open shadow roots', () => {
  const { documentRef, getComputedStyle } = createFakeDom();

  addGrid(documentRef.body, { display: 'grid' });
  addGrid(documentRef.body, { display: 'inline-grid' });

  const host = createElement('div');
  host.shadowRoot = createShadowRoot(host);
  documentRef.body.appendChild(host);

  addGrid(host.shadowRoot, { display: 'grid' });
  addGrid(documentRef.body, { display: 'flex' });

  const grids = core.findGridContainers(documentRef, getComputedStyle);
  assert.equal(grids.length, 3);
});

test('parseResolvedTrackSizes extracts resolved pixel tracks and ignores line names', () => {
  assert.deepEqual(core.parseResolvedTrackSizes('[start] 120px [middle] 80.5px [end]'), [120, 80.5]);
  assert.deepEqual(core.parseResolvedTrackSizes('none'), []);
  assert.deepEqual(core.parseResolvedTrackSizes('subgrid [a] [b]'), []);
});

test('resolveCssLength handles pixels, percentages, and simple calc expressions', () => {
  assert.equal(core.resolveCssLength('20px', 500), 20);
  assert.equal(core.resolveCssLength('10%', 500), 50);
  assert.equal(core.resolveCssLength('calc(10% + 5px)', 500), 55);
  assert.equal(core.resolveCssLength('normal', 500), 0);
});

test('computeTrackSegments preserves gaps, alignment, and overflow behavior', () => {
  assert.deepEqual(core.computeTrackSegments([100, 200], 20, 320, 'start'), [
    { start: 0, end: 100, size: 100 },
    { start: 120, end: 320, size: 200 }
  ]);
  assert.deepEqual(core.computeTrackSegments([50, 50], 10, 150, 'center'), [
    { start: 20, end: 70, size: 50 },
    { start: 80, end: 130, size: 50 }
  ]);
  assert.deepEqual(core.computeTrackSegments([150, 150], 0, 200, 'center'), [
    { start: -50, end: 100, size: 150 },
    { start: 100, end: 250, size: 150 }
  ]);
  assert.deepEqual(core.computeTrackSegments([150, 150], 0, 200, 'safe center'), [
    { start: 0, end: 150, size: 150 },
    { start: 150, end: 300, size: 150 }
  ]);
});

test('computeTrackSegments collapses phantom auto-fit gutters', () => {
  assert.deepEqual(
    core.computeTrackSegments([245, 245, 0, 0], 10, 500, 'start', { collapseZeroTracks: true }),
    [
      { start: 0, end: 245, size: 245 },
      { start: 255, end: 500, size: 245 }
    ]
  );
  assert.deepEqual(
    core.computeTrackSegments([100, 100, 0, 0], 10, 500, 'start', { collapseZeroTracks: true }),
    [
      { start: 0, end: 100, size: 100 },
      { start: 110, end: 210, size: 100 }
    ]
  );
  assert.equal(core.computeTrackSegments([40, 0, 40], 10, 90, 'start').length, 3);
});

test('getGridTrackGeometry accounts for padding, borders, and axis-aligned scaling', () => {
  const { documentRef, getComputedStyle } = createFakeDom();
  const grid = addGrid(documentRef.body, {
    rect: { left: 5, top: 10, width: 440, height: 240 },
    columns: '100px 100px',
    rows: '100px',
    columnGap: '10px'
  });
  grid.offsetWidth = 220;
  grid.offsetHeight = 120;
  grid.clientWidth = 216;
  grid.clientHeight = 116;
  grid._borderLeftWidth = '2px';
  grid._borderRightWidth = '2px';
  grid._borderTopWidth = '2px';
  grid._borderBottomWidth = '2px';
  grid._paddingLeft = '3px';
  grid._paddingRight = '3px';
  grid._paddingTop = '8px';
  grid._paddingBottom = '8px';

  const geometry = core.getGridTrackGeometry(grid, getComputedStyle(grid), grid._rect);

  assert.deepEqual(geometry.content, {
    left: 10,
    top: 20,
    width: 420,
    height: 200
  });
  assert.deepEqual(geometry.verticalEdges, [10, 210, 230, 430]);
  assert.deepEqual(geometry.horizontalEdges, [20, 220]);
});

test('getGridTrackGeometry resolves percentage gaps and RTL columns', () => {
  const { documentRef, getComputedStyle } = createFakeDom();
  const grid = addGrid(documentRef.body, {
    rect: { left: 0, top: 0, width: 500, height: 100 },
    columns: '200px 250px',
    rows: '100px',
    columnGap: '10%',
    direction: 'rtl'
  });
  grid.offsetWidth = 500;
  grid.offsetHeight = 100;
  grid.clientWidth = 500;
  grid.clientHeight = 100;

  const geometry = core.getGridTrackGeometry(grid, getComputedStyle(grid), grid._rect);

  assert.deepEqual(geometry.verticalEdges, [0, 250, 300, 500]);
  assert.deepEqual(geometry.horizontalEdges, [0, 100]);
});

test('getGridTrackGeometry projects vertical-rl tracks onto physical axes', () => {
  const { documentRef, getComputedStyle } = createFakeDom();
  const grid = addGrid(documentRef.body, {
    rect: { left: 0, top: 0, width: 320, height: 190 },
    columns: '80px 100px',
    rows: '100px 200px',
    columnGap: '10px',
    rowGap: '20px',
    writingMode: 'vertical-rl'
  });
  grid.offsetWidth = 320;
  grid.offsetHeight = 190;
  grid.clientWidth = 320;
  grid.clientHeight = 190;

  const geometry = core.getGridTrackGeometry(grid, getComputedStyle(grid), grid._rect);

  assert.deepEqual(geometry.verticalEdges, [0, 200, 220, 320]);
  assert.deepEqual(geometry.horizontalEdges, [0, 80, 90, 190]);
});

test('getGridTrackGeometry suppresses misleading lines for rotated grids', () => {
  const { documentRef, getComputedStyle } = createFakeDom();
  const grid = addGrid(documentRef.body, { columns: '50px 50px', rows: '100px' });
  grid.offsetWidth = 100;
  grid.offsetHeight = 100;
  grid.clientWidth = 100;
  grid.clientHeight = 100;
  grid._transform = 'matrix(0, 1, -1, 0, 0, 0)';

  const geometry = core.getGridTrackGeometry(grid, getComputedStyle(grid), grid._rect);

  assert.deepEqual(geometry.verticalEdges, []);
  assert.deepEqual(geometry.horizontalEdges, []);
  assert.equal(geometry.unsupportedReason, 'non-axis-aligned-transform');
});

test('grid overlay draws resolved column and row track edges', () => {
  const { documentRef, windowRef, getComputedStyle } = createFakeDom();
  const grid = addGrid(documentRef.body, {
    rect: { left: 10, top: 20, width: 320, height: 190 },
    columns: '100px 200px',
    rows: '80px 100px',
    columnGap: '20px',
    rowGap: '10px'
  });
  grid.offsetWidth = 320;
  grid.offsetHeight = 190;
  grid.clientWidth = 320;
  grid.clientHeight = 190;

  const inspector = core.createInspector({
    document: documentRef,
    window: windowRef,
    getComputedStyle,
    MutationObserver: FakeMutationObserver
  });

  inspector.enable();

  const overlay = documentRef.getElementById(core.OVERLAY_ROOT_ID);
  const outline = overlay.children[0];
  const svg = outline.children.find((child) => child.getAttribute('data-tsuga-grid-tracks') === 'true');
  const path = svg.children[0];

  assert.equal(outline.style.border, '0');
  assert.equal(outline.style.outline, '2px solid rgba(37, 99, 235, 0.95)');
  assert.equal(outline.children.length, 2);
  assert.equal(
    path.getAttribute('d'),
    'M 0 0 V 190 M 100 0 V 190 M 120 0 V 190 M 320 0 V 190 M 0 0 H 320 M 0 80 H 320 M 0 90 H 320 M 0 190 H 320'
  );
});

test('toggle works on zero-grid pages and updates state marker', () => {
  const { documentRef, windowRef, getComputedStyle } = createFakeDom();
  const inspector = core.createInspector({
    document: documentRef,
    window: windowRef,
    getComputedStyle,
    MutationObserver: FakeMutationObserver
  });

  const onResult = inspector.toggle();
  assert.equal(onResult.enabled, true);
  assert.equal(onResult.gridCount, 0);
  assert.equal(documentRef.documentElement.dataset.tsugaGridOverlayState, 'enabled');

  const offResult = inspector.toggle();
  assert.equal(offResult.enabled, false);
  assert.equal(documentRef.documentElement.dataset.tsugaGridOverlayState, 'disabled');
});

test('enabling overlay does not mutate existing grid positioning', () => {
  const { documentRef, windowRef, getComputedStyle } = createFakeDom();
  const fixedGrid = addGrid(documentRef.body, { position: 'fixed' });

  const inspector = core.createInspector({
    document: documentRef,
    window: windowRef,
    getComputedStyle,
    MutationObserver: FakeMutationObserver
  });

  inspector.enable();
  assert.equal(fixedGrid.style.position, 'fixed');
});

test('mutation callbacks do not cause overlay refresh feedback loop', () => {
  const { documentRef, windowRef, getComputedStyle } = createFakeDom();
  const grid = addGrid(documentRef.body);

  const inspector = core.createInspector({
    document: documentRef,
    window: windowRef,
    getComputedStyle,
    MutationObserver: FakeMutationObserver
  });

  inspector.enable();
  grid.setAttribute('class', 'updated');
  windowRef.flushAnimationFrames();

  assert.ok(FakeMutationObserver.callbackCount < 50);
  assert.ok(documentRef.getElementById(core.OVERLAY_ROOT_ID));
});

test('disable cleans up overlay nodes', () => {
  const { documentRef, windowRef, getComputedStyle } = createFakeDom();
  addGrid(documentRef.body);

  const inspector = core.createInspector({
    document: documentRef,
    window: windowRef,
    getComputedStyle,
    MutationObserver: FakeMutationObserver
  });

  inspector.enable();
  assert.ok(documentRef.getElementById(core.OVERLAY_ROOT_ID));
  assert.ok(documentRef.getElementById(core.OVERLAY_BADGE_ID));

  inspector.disable();
  assert.equal(documentRef.getElementById(core.OVERLAY_ROOT_ID), null);
  assert.equal(documentRef.getElementById(core.OVERLAY_BADGE_ID), null);
});
