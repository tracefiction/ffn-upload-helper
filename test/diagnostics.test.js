const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport, networkFromTrace } = require('../src/diagnostics.js');

const T0 = Date.UTC(2026, 9, 31, 14, 2, 0);
const INFO = { version: '0.1.2', userAgent: 'TestBrowser/1.0', now: Date.UTC(2026, 9, 31, 14, 30, 0) };
const ERROR_TEXT = 'Processing Error: The document is not in a supported format, over 5MB, or password-protected.';

function tries(list) {
  return list.map(([backend, result, status, ms], i) => ({
    at: T0 + i * 4000, backend, result, status, ms, message: result === 'processing-error' ? ERROR_TEXT : null,
  }));
}

test('trace fields', () => {
  const trace = 'fl=736f263\nh=www.fanfiction.net\nip=1.2.3.4\nts=1793465649.000\ncolo=LHR\nhttp=http/2\nloc=GB\ntls=TLSv1.3\nwarp=off\n';
  assert.deepEqual(networkFromTrace(trace), { colo: 'LHR', http: 'http/2', loc: 'GB', tls: 'TLSv1.3', warp: 'off' });
  assert.equal(networkFromTrace('<html>Just a moment...</html>'), null);
});

test('empty report', () => {
  assert.equal(buildReport([], INFO), [
    'FFN Upload Helper debug report',
    'Version: 0.1.2',
    'Made: 2026-10-31 14:30 UTC',
    'Browser: TestBrowser/1.0',
    '',
    'No uploads recorded on this device yet.',
    '',
  ].join('\n'));
});

test('report', () => {
  const gaveUp = {
    startedAt: T0,
    finishedAt: T0 + 19000,
    upload: { source: 'paste', format: '0', bytes: 12698 },
    docsInList: 51,
    maxTries: 5,
    network: { colo: 'LHR', loc: 'GB', http: 'http/2', tls: 'TLSv1.3', warp: 'off' },
    outcome: { kind: 'gave-up' },
    tries: tries([
      ['php-master', 'processing-error', 200, 1700],
      ['php-master', 'processing-error', 200, 2300],
      ['S2-M', 'processing-error', 200, 1900],
      [null, 'network-error', null, 30000],
      ['php-master', 'processing-error', 200, 1800],
    ]),
  };
  gaveUp.tries[3].message = 'Failed to fetch';
  const saved = {
    startedAt: T0 - 3600 * 1000,
    finishedAt: T0 - 3600 * 1000 + 8000,
    upload: { source: 'converted', ext: 'docx', format: '0', bytes: 512 },
    docsInList: 50,
    maxTries: 60,
    network: {},
    outcome: { kind: 'saved' },
    tries: tries([['S2-M', 'processing-error', 200, 1500], ['php-master', 'saved', 200, 2500]]),
  };
  const unfinished = {
    startedAt: T0 - 7200 * 1000,
    upload: { source: 'file', ext: 'odt', format: '0', bytes: 3 * 1024 * 1024 },
    network: null,
    outcome: null,
    tries: [],
  };

  assert.equal(buildReport([gaveUp, saved, unfinished], INFO), [
    'FFN Upload Helper debug report',
    'Version: 0.1.2',
    'Made: 2026-10-31 14:30 UTC',
    'Browser: TestBrowser/1.0',
    '',
    '3 uploads recorded on this device, newest first.',
    '',
    '1. 2026-10-31 14:02 UTC: gave up after 5 tries in 19s',
    '   Sent: pasted text, 12.4 KB, Story format, up to 5 tries',
    '   Docs in list: 51',
    '   Network: Cloudflare LHR, GB, http/2, TLSv1.3, WARP off',
    '   Servers: php-master 0 of 3 saved, S2-M 0 of 1 saved, no server name 0 of 1 saved',
    '   Messages:',
    '     4x ' + ERROR_TEXT,
    '     1x Failed to fetch',
    '   Tries:',
    '     1-2  php-master  processing-error  HTTP 200  1.7-2.3s',
    '     3    S2-M        processing-error  HTTP 200  1.9s',
    '     4    -           network-error     -         30.0s',
    '     5    php-master  processing-error  HTTP 200  1.8s',
    '',
    '2. 2026-10-31 13:02 UTC: saved after 2 tries in 8s',
    '   Sent: .docx converted in the browser, 512 bytes, Story format, up to 60 tries',
    '   Docs in list: 50',
    '   Network: unavailable',
    '   Servers: S2-M 0 of 1 saved, php-master 1 of 1 saved',
    '   Messages:',
    '     1x ' + ERROR_TEXT,
    '   Tries:',
    '     1  S2-M        processing-error  HTTP 200  1.5s',
    '     2  php-master  saved             HTTP 200  2.5s',
    '',
    '3. 2026-10-31 12:02 UTC: did not finish, 0 tries so far (page closed or still uploading)',
    '   Sent: .odt file as is, 3.0 MB, Story format',
    '   Network: not checked',
    '',
  ].join('\n'));
});

test('keeps 10 runs', async () => {
  const items = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: (keys, cb) => cb({ ...items }),
        set: (changes, cb) => { Object.assign(items, changes); cb(); },
        remove: (keys, cb) => { for (const k of keys) delete items[k]; cb(); },
      },
    },
  };
  try {
    delete require.cache[require.resolve('../src/diagnostics.js')];
    const { newRun, startRun, loadRuns } = require('../src/diagnostics.js');
    for (let i = 0; i < 12; i++) await startRun(newRun({ id: 'r' + i, startedAt: T0 + i }));
    const runs = await loadRuns();
    assert.deepEqual(runs.map((r) => r.id), ['r11', 'r10', 'r9', 'r8', 'r7', 'r6', 'r5', 'r4', 'r3', 'r2']);
  } finally {
    delete globalThis.chrome;
  }
});
