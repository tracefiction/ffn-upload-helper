const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createDocument } = require('../src/uploader.js');

const { DOMParser } = new JSDOM('').window;
const savedPage = fs.readFileSync(path.join(__dirname, 'fixtures', 'docs-saved.html'), 'utf8');

const ERROR = '<b>Processing Error:</b> ray id: php-master';
const ERROR_S2M = '<b>Processing Error:</b> ray id: S2-M';
const DUP = 'Duplicate Document: label: Chapter 1 draft ray id: php-master';

function fakeServer(responses) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    const [status, body, headers] = typeof next === 'string' ? [200, next, {}] : next;
    return { status, text: async () => body, headers: { get: (k) => (headers || {})[k] ?? null } };
  };
  return { fetch, requests };
}

function run(responses, extra) {
  const server = fakeServer(responses);
  const sleeps = [];
  return createDocument(Object.assign({
    label: 'Chapter 1 draft',
    fetch: server.fetch,
    sleep: async (ms) => { sleeps.push(ms); },
    random: () => 0,
    buildBody: () => 'body',
    parseHtml: (html) => new DOMParser().parseFromString(html, 'text/html'),
  }, extra)).then((outcome) => ({ outcome, requests: server.requests, sleeps }));
}

test('retries until saved', async () => {
  const { outcome, requests, sleeps } = await run([ERROR_S2M, ERROR, savedPage]);
  assert.equal(outcome.kind, 'saved');
  assert.equal(outcome.tries, 3);
  assert.equal(outcome.docId, 10000081);
  assert.deepEqual(outcome.log.map((l) => l.backend), ['S2-M', 'php-master', 'php-master']);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, '/docs/docs.php');
  assert.equal(requests[0].init.method, 'POST');
  assert.deepEqual(sleeps, [2500, 2500]);
});

test('duplicate on first try', async () => {
  const { outcome } = await run([DUP]);
  assert.equal(outcome.kind, 'duplicate-label');
});

test('duplicate after failure counts as saved', async () => {
  const { outcome } = await run([ERROR, savedPage.replace('Document Saved', 'Duplicate Document')]);
  assert.equal(outcome.kind, 'saved');
  assert.equal(outcome.viaDuplicate, true);
  assert.equal(outcome.docId, 10000081);
});

test('max tries', async () => {
  const { outcome, requests, sleeps } = await run(Array(5).fill(ERROR), { maxTries: 5 });
  assert.equal(outcome.kind, 'gave-up');
  assert.equal(outcome.tries, 5);
  assert.equal(requests.length, 5);
  assert.equal(sleeps.length, 4);
});

test('429 with Retry-After', async () => {
  const { outcome, sleeps } = await run([[429, 'Too Many Requests', { 'Retry-After': '20' }], savedPage]);
  assert.equal(outcome.kind, 'saved');
  assert.deepEqual(sleeps, [20000]);
});

test('429 without Retry-After', async () => {
  const { sleeps } = await run([[429, 'Too Many Requests'], savedPage]);
  assert.deepEqual(sleeps, [60000]);
});

test('network error', async () => {
  const { outcome } = await run([new TypeError('Failed to fetch'), savedPage]);
  assert.equal(outcome.kind, 'saved');
  assert.equal(outcome.log[0].result, 'network-error');
});

test('stops on logout, challenge, unknown', async () => {
  assert.equal((await run([ERROR, 'Login Required'])).outcome.kind, 'signed-out');
  assert.equal((await run([[403, 'Just a moment...']])).outcome.kind, 'challenge');
  const { outcome } = await run(['<p>Error Type 1</p>']);
  assert.equal(outcome.kind, 'unexpected');
  assert.equal(outcome.snippet, 'Error Type 1');
  const titled = await run(['<title>502 Bad Gateway</title><p>Error Type 1</p>']);
  assert.equal(titled.outcome.log[0].message, '502 Bad Gateway');
});

test('cancel', async () => {
  const controller = new AbortController();
  const { outcome, requests } = await run([ERROR, ERROR, savedPage], {
    signal: controller.signal,
    sleep: async () => controller.abort(),
  });
  assert.equal(outcome.kind, 'cancelled');
  assert.equal(requests.length, 1);
});

test('progress', async () => {
  const seen = [];
  await run([ERROR, savedPage], { onProgress: (p) => seen.push(p) });
  assert.deepEqual(seen, [{ tries: 1, maxTries: 60, lastResult: 'processing-error', backend: 'php-master', waitingMs: 2500 }]);
});

test('records every try', async () => {
  const seen = [];
  const { outcome } = await run([new TypeError('Failed to fetch'), ERROR_S2M, [429, 'Too Many Requests'], savedPage],
    { onAttempt: (entry) => seen.push(entry) });
  assert.deepEqual(seen, outcome.log);
  assert.deepEqual(seen.map(({ result, backend, status, message }) => ({ result, backend, status, message })), [
    { result: 'network-error', backend: null, status: null, message: 'Failed to fetch' },
    { result: 'processing-error', backend: 'S2-M', status: 200, message: 'Processing Error:' },
    { result: 'rate-limited', backend: null, status: 429, message: null },
    { result: 'saved', backend: 'php-master', status: 200, message: null },
  ]);
});
