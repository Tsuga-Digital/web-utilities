(function () {
  'use strict';

  const NAMESPACE = '__TSUGA_GRID_OVERLAY__';

  if (!globalThis.TsugaGridOverlayCore) {
    throw new Error('Grid overlay core is unavailable.');
  }

  if (!globalThis[NAMESPACE]) {
    const inspector = globalThis.TsugaGridOverlayCore.createInspector({
      document,
      window,
      getComputedStyle,
      MutationObserver
    });

    globalThis[NAMESPACE] = {
      toggle: () => inspector.toggle(),
      enable: () => inspector.enable(),
      disable: () => inspector.disable(),
      status: () => inspector.status()
    };
  }
})();
