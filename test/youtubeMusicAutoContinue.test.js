'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../youtubeMusicAutoContinue');
const utility = globalThis.TsugaYoutubeMusicAutoContinue;

test('recognizes YouTube Music continue prompts', () => {
  assert.equal(utility.isContinuePromptText('Video paused. Continue watching?'), true);
  assert.equal(utility.isContinuePromptText('Playback paused — are you still watching?'), true);
  assert.equal(utility.isContinuePromptText('Are you still listening?'), true);
  assert.equal(utility.isContinuePromptText('Continue watching this playlist'), false);
  assert.equal(utility.isContinuePromptText('Video paused'), false);
});

test('recognizes affirmative prompt buttons without selecting dismissive buttons', () => {
  assert.equal(utility.isAffirmativeButtonText('Yes'), true);
  assert.equal(utility.isAffirmativeButtonText('Continue watching'), true);
  assert.equal(utility.isAffirmativeButtonText('Resume playback'), true);
  assert.equal(utility.isAffirmativeButtonText('No, thanks'), false);
  assert.equal(utility.isAffirmativeButtonText('Cancel'), false);
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
    textContent: 'Video paused. Continue watching?',
    getAttribute() {
      return null;
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
