'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

const chromeBinary = findChromeBinary();

test('renders browser-resolved grid tracks for physical and logical layouts', { skip: !chromeBinary }, () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'grid-overlay-browser-'));
  const fixturePath = path.join(temporaryDirectory, 'grid-layouts.html');
  const coreUrl = pathToFileURL(path.resolve(__dirname, '..', 'gridOverlayCore.js')).href;
  const fixtureUrl = pathToFileURL(fixturePath).href;

  try {
    fs.writeFileSync(
      fixturePath,
      `<!doctype html>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; }
        .grid { display: grid; }
        #basic { width: 320px; height: 190px; grid-template-columns: 100px 200px; grid-template-rows: 80px 100px; gap: 10px 20px; }
        #rtl { direction: rtl; width: 320px; height: 100px; grid-template-columns: 100px 200px; gap: 20px; }
        #vertical { writing-mode: vertical-rl; width: 320px; height: 190px; grid-template-columns: 80px 100px; grid-template-rows: 100px 200px; column-gap: 10px; row-gap: 20px; }
        #autofit { width: 500px; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; }
        #autofit > div { height: 20px; }
      </style>
      <div id="basic" class="grid"></div>
      <div id="rtl" class="grid"></div>
      <div id="vertical" class="grid"></div>
      <div id="autofit" class="grid"><div></div><div></div></div>
      <script src="${coreUrl}"></script>
      <script>
        const inspector = TsugaGridOverlayCore.createInspector({
          document,
          window,
          getComputedStyle,
          MutationObserver: null
        });
        inspector.enable();
        document.title = JSON.stringify(
          [...document.querySelectorAll('[data-tsuga-grid-tracks] path')].map((current) => current.getAttribute('d'))
        );
      </script>`,
      'utf8'
    );

    const result = spawnSync(
      chromeBinary,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-sandbox',
        '--allow-file-access-from-files',
        '--dump-dom',
        fixtureUrl
      ],
      { encoding: 'utf8', timeout: 30000 }
    );

    assert.equal(result.status, 0, result.stderr);
    const titleMatch = /<title>(.*?)<\/title>/.exec(result.stdout);
    assert.ok(titleMatch, 'Expected the browser fixture to report SVG paths in the document title.');
    assert.deepEqual(JSON.parse(titleMatch[1]), [
      'M 0 0 V 190 M 100 0 V 190 M 120 0 V 190 M 320 0 V 190 M 0 0 H 320 M 0 80 H 320 M 0 90 H 320 M 0 190 H 320',
      'M 0 0 V 100 M 200 0 V 100 M 220 0 V 100 M 320 0 V 100',
      'M 0 0 V 190 M 200 0 V 190 M 220 0 V 190 M 320 0 V 190 M 0 0 H 320 M 0 80 H 320 M 0 90 H 320 M 0 190 H 320',
      'M 0 0 V 20 M 245 0 V 20 M 255 0 V 20 M 500 0 V 20 M 0 0 H 500 M 0 20 H 500'
    ]);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
