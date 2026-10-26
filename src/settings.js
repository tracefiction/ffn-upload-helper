(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    separatorStyle: 'hr',
    convertFiles: true,
    maxTries: 60,
  });

  const ext = root.chrome || root.browser;

  function load() {
    return new Promise((resolve) => {
      try {
        ext.storage.sync.get(DEFAULTS, (items) => resolve(Object.assign({}, DEFAULTS, items || {})));
      } catch (err) {
        resolve(Object.assign({}, DEFAULTS));
      }
    });
  }

  function save(changes) {
    return new Promise((resolve) => ext.storage.sync.set(changes, () => resolve()));
  }

  root.FFNUH = Object.assign(root.FFNUH || {}, { settings: { DEFAULTS, load, save } });
})(globalThis);
