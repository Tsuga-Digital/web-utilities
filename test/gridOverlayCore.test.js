'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../gridOverlayCore');

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = [];
    this.disconnected = false;
  }

  observe(target, options) {
    this.observed.push({ target, options });
  }

  disconnect() {
    this.disconnected = true;
  }
}

function createElement(tagName) {
  return {
    tagName,
    id: '',
    parentNode: null,
    children: [],
    style: {},
    dataset: {},
    attributes: {},
    shadowRoot: null,
    textContent: '',
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
        child.parentNode = null;
      }
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    getBoundingClientRect() {
      return this._rect || { left: 0, top: 0, width: 100, height: 100 };
    }
  };
}

function createShadowRoot() {
  return {
    mode: 'open',
    children: [],
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
        child.parentNode = null;
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
  const documentElement = createElement('html');
  const body = createElement('body');
  documentElement.appendChild(body);

  const documentRef = {
    children: [documentElement],
    documentElement,
    body,
    createElement,
    getElementById(id) {
      return findById(documentElement, id);
    }
  };

  const windowRef = {
    listeners: [],
    addEventListener(type) {
      this.listeners.push(type);
    },
    removeEventListener(type) {
      this.listeners = this.listeners.filter((name) => name !== type);
    }
  };

  const getComputedStyle = (element) => ({
    display: element._display || 'block'
  });

  return { documentRef, windowRef, getComputedStyle };
}

function addGrid(parent, { display = 'grid', rect, position } = {}) {
  const el = createElement('div');
  el._display = display;
  el._rect = rect || { left: 10, top: 10, width: 120, height: 80 };
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
  host.shadowRoot = createShadowRoot();
  documentRef.body.appendChild(host);

  addGrid(host.shadowRoot, { display: 'grid' });
  addGrid(documentRef.body, { display: 'flex' });

  const grids = core.findGridContainers(documentRef, getComputedStyle);
  assert.equal(grids.length, 3);
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
