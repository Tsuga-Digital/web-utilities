'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../youtubeMusicAutoContinue');
const utility = globalThis.TsugaYoutubeMusicAutoContinue;

test('recognizes YouTube Music continue prompts', () => {
  assert.equal(utility.isContinuePromptText('Video paused. Continue watching?'), true);
  assert.equal(utility.isContinuePromptText('Playback paused — are you still watching?'), true);
  assert.equal(utility.isContinuePromptText('Are you still listening?'), true);
  assert.equal(utility.isContinuePromptText('Resume playback?'), true);
  assert.equal(utility.isContinuePromptText('Continue listening?'), true);
  assert.equal(utility.isContinuePromptText('Continue watching this playlist'), false);
  assert.equal(utility.isContinuePromptText('Video paused'), false);
});

test('recognizes affirmative prompt buttons without selecting dismissive buttons', () => {
  assert.equal(utility.isAffirmativeButtonText('Yes'), true);
  assert.equal(utility.isAffirmativeButtonText('Continue watching'), true);
  assert.equal(utility.isAffirmativeButtonText('Resume playback'), true);
  assert.equal(utility.isAffirmativeButtonText('No, thanks'), false);
  assert.equal(utility.isAffirmativeButtonText('Cancel'), false);
  assert.equal(utility.isAffirmativeButtonText('Yes, continue watching'), true);
  assert.equal(utility.isAffirmativeButtonText('Continue listening'), true);
  assert.equal(utility.isAffirmativeButtonText('Yes.'), true);
});

test('clicks a prompt once and attempts to resume paused media', () => {
  let clickCount = 0;
  let playCount = 0;

  const button = {
    disabled: false,
    getAttribute() {
      return null;
    },
    get textContent() {
      return 'Yes';
    },
    click() {
      clickCount += 1;
    }
  };

  const dialog = {
    hidden: false,
    style: {},
    textContent: 'Yes',
    getAttribute(name) {
      return name === 'dialog-title' ? 'Video paused. Continue watching?' : null;
    },
    querySelectorAll(selector) {
      return selector.includes('button') || selector.includes('role="button"') ? [button] : [];
    }
  };

  const media = {
    paused: true,
    play() {
      playCount += 1;
      this.paused = false;
      return Promise.resolve();
    }
  };

  const documentRef = {
    documentElement: {},
    querySelectorAll(selector) {
      if (selector === 'video, audio') {
        return [media];
      }
      return selector.includes('dialog') || selector.includes('paper-dialog') || selector.includes('confirm-dialog') || selector.includes('ytmusic-')
        ? [dialog]
        : [];
    }
  };

  class MutationObserverRef {
    observe() {}
    disconnect() {}
  }

  const controller = utility.createController({
    documentRef,
    windowRef: { setTimeout: (callback) => callback() },
    MutationObserverRef,
    storageArea: null
  });

  controller.start();
  controller.scan();

  assert.equal(clickCount, 1);
  assert.equal(playCount, 1);
});

test('polling catches a prompt that appears without a useful mutation', () => {
  let clickCount = 0;
  let intervalCallback = null;

  const button = {
    disabled: false,
    getAttribute() {
      return null;
    },
    textContent: 'Yes',
    click() {
      clickCount += 1;
    }
  };

  const dialog = {
    hidden: true,
    style: {},
    textContent: 'Yes',
    getAttribute(name) {
      return name === 'dialog-title' ? 'Video paused. Continue watching?' : null;
    },
    querySelectorAll(selector) {
      return selector.includes('button') || selector.includes('role="button"') ? [button] : [];
    }
  };

  const documentRef = {
    documentElement: {},
    querySelectorAll(selector) {
      return selector.includes('dialog') || selector.includes('paper-dialog') || selector.includes('confirm-dialog') || selector.includes('ytmusic-') || selector.includes('popup-container')
        ? [dialog]
        : [];
    }
  };

  const controller = utility.createController({
    documentRef,
    windowRef: {
      setInterval(callback) {
        intervalCallback = callback;
        return 1;
      },
      clearInterval() {},
      setTimeout(callback) {
        callback();
      }
    },
    MutationObserverRef: null,
    storageArea: null
  });

  controller.start();
  dialog.hidden = false;
  intervalCallback();

  assert.equal(clickCount, 1);
});

test('handles the YouTube Music you-there renderer with a structural button', () => {
  let clickCount = 0;

  const innerButton = {
    tagName: 'BUTTON',
    disabled: false,
    textContent: 'Ja',
    getAttribute() {
      return null;
    },
    click() {
      clickCount += 1;
    }
  };

  const buttonWrapper = {
    tagName: 'YT-BUTTON-SHAPE',
    getAttribute() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === 'button' ? [innerButton] : [];
    }
  };

  const dialog = {
    tagName: 'YTMUSIC-YOU-THERE-RENDERER',
    hidden: false,
    style: {},
    textContent: 'Ja',
    getAttribute(name) {
      return name === 'class' ? 'ytmusic-you-there-renderer' : null;
    },
    querySelectorAll(selector) {
      if (selector === '#button') {
        return [buttonWrapper];
      }
      return [];
    }
  };

  const documentRef = {
    documentElement: {},
    querySelectorAll(selector) {
      return selector.includes('you-there-renderer') ? [dialog] : [];
    }
  };

  const controller = utility.createController({
    documentRef,
    windowRef: { setTimeout: (callback) => callback() },
    MutationObserverRef: null,
    storageArea: null
  });

  controller.start();

  assert.equal(clickCount, 1);
});

test('finds the prompt inside an open application shadow root', () => {
  let clickCount = 0;

  const button = {
    tagName: 'BUTTON',
    disabled: false,
    textContent: 'Yes',
    getAttribute() {
      return null;
    },
    click() {
      clickCount += 1;
    }
  };

  const dialog = {
    tagName: 'YTMUSIC-YOU-THERE-RENDERER',
    hidden: false,
    style: {},
    textContent: 'Video paused. Continue watching?',
    getAttribute(name) {
      return name === 'class' ? 'ytmusic-you-there-renderer' : null;
    },
    querySelectorAll(selector) {
      return selector === '#button' ? [button] : [];
    }
  };

  const shadowRoot = {
    mode: 'open',
    querySelectorAll(selector) {
      return selector.includes('you-there-renderer') ? [dialog] : [];
    }
  };

  const app = {
    shadowRoot
  };

  const documentRef = {
    documentElement: {},
    querySelectorAll(selector) {
      return selector === 'ytmusic-app' ? [app] : [];
    }
  };

  const controller = utility.createController({
    documentRef,
    windowRef: { setTimeout: (callback) => callback() },
    MutationObserverRef: null,
    storageArea: null
  });

  controller.start();

  assert.equal(clickCount, 1);
});
