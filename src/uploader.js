(function (root) {
  'use strict';

  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.FFNUH;

  const DEFAULT_MAX_TRIES = 60;
  const RATE_LIMIT_PAUSE_MS = 60 * 1000;

  async function createDocument(opts) {
    const fetchImpl = opts.fetch || root.fetch.bind(root);
    const sleep = opts.sleep || defaultSleep;
    const maxTries = opts.maxTries || DEFAULT_MAX_TRIES;
    const parse = opts.parseHtml || ((html) => new root.DOMParser().parseFromString(html, 'text/html'));
    const progress = opts.onProgress || (() => {});
    const onAttempt = opts.onAttempt || (() => {});
    const log = [];
    const record = (entry) => { log.push(entry); onAttempt(entry); };
    let tries = 0;

    while (tries < maxTries) {
      if (opts.signal && opts.signal.aborted) return { kind: 'cancelled', tries, log };
      tries++;
      const started = Date.now();
      let res, body;
      try {
        res = await fetchImpl('/docs/docs.php', { method: 'POST', body: opts.buildBody(), credentials: 'same-origin' });
        body = await res.text();
      } catch (err) {
        record({ at: started, result: 'network-error', backend: null, status: null, ms: Date.now() - started, message: err.message });
        progress({ tries, maxTries, lastResult: 'network-error', backend: null });
        if (!(await wait(sleep, core.retryDelayMs(opts.random), opts.signal))) return { kind: 'cancelled', tries, log };
        continue;
      }
      const result = core.classifyCreateResponse(res.status, body);
      const backend = core.backendOf(body);
      const message = result === 'processing-error' ? core.processingErrorText(parse(body))
        : result === 'unknown' ? parse(body).title.slice(0, 100) || null : null;
      record({ at: started, result, backend, status: res.status, ms: Date.now() - started, message });

      if (result === 'saved') {
        return { kind: 'saved', tries, log, docId: core.findDocIdByLabel(parse(body), opts.label) };
      }
      if (result === 'duplicate') {
        if (tries === 1) return { kind: 'duplicate-label', tries, log };
        return { kind: 'saved', tries, log, docId: core.findDocIdByLabel(parse(body), opts.label), viaDuplicate: true };
      }
      if (result === 'empty') return { kind: 'empty', tries, log };
      if (result === 'signed-out') return { kind: 'signed-out', tries, log };
      if (result === 'challenge') return { kind: 'challenge', tries, log };
      if (result === 'unknown') return { kind: 'unexpected', tries, log, status: res.status, snippet: textSnippet(body) };

      let delay = core.retryDelayMs(opts.random);
      if (result === 'rate-limited') {
        const retryAfter = Number(res.headers && res.headers.get && res.headers.get('Retry-After'));
        delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_PAUSE_MS;
      }
      progress({ tries, maxTries, lastResult: result, backend, waitingMs: delay });
      if (tries >= maxTries) break;
      if (!(await wait(sleep, delay, opts.signal))) return { kind: 'cancelled', tries, log };
    }
    return { kind: 'gave-up', tries, log };
  }

  async function wait(sleep, ms, signal) {
    if (signal && signal.aborted) return false;
    await sleep(ms, signal);
    return !(signal && signal.aborted);
  }

  function defaultSleep(ms, signal) {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
    });
  }

  function textSnippet(html) {
    return String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  const api = { createDocument, DEFAULT_MAX_TRIES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFNUH = Object.assign(root.FFNUH || {}, api);
})(globalThis);
