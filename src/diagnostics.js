(function (root) {
  'use strict';

  const MAX_RUNS = 10;
  const KEY_PREFIX = 'ffnuh.run.';
  const TRACE_FIELDS = ['colo', 'loc', 'http', 'tls', 'warp'];

  function newRun(fields) {
    return Object.assign({
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      startedAt: Date.now(),
      finishedAt: null,
      outcome: null,
      network: null,
      tries: [],
    }, fields);
  }

  function networkFromTrace(text) {
    const out = {};
    for (const line of String(text).split('\n')) {
      const m = /^(\w+)=(.*)$/.exec(line.trim());
      if (m && TRACE_FIELDS.includes(m[1])) out[m[1]] = m[2];
    }
    return out.colo ? out : null;
  }

  function buildReport(runs, info) {
    const lines = [
      'FFN Upload Helper debug report',
      'Version: ' + info.version,
      'Made: ' + formatTime(info.now),
      'Browser: ' + info.userAgent,
      '',
    ];
    if (!runs.length) {
      lines.push('No uploads recorded on this device yet.');
    } else {
      lines.push(plural(runs.length, 'upload') + ' recorded on this device, newest first.');
      runs.forEach((run, i) => {
        lines.push('', (i + 1) + '. ' + formatTime(run.startedAt) + ': ' + describeOutcome(run));
        for (const line of runDetails(run)) lines.push('   ' + line);
      });
    }
    return lines.join('\n') + '\n';
  }

  function runDetails(run) {
    const out = [];
    if (run.upload) out.push('Sent: ' + describeUpload(run.upload, run.maxTries));
    if (run.docsInList != null) out.push('Docs in list: ' + run.docsInList);
    out.push('Network: ' + describeNetwork(run.network));
    if (run.tries.length) {
      out.push('Servers: ' + describeServers(run.tries));
      const messages = countMessages(run.tries);
      if (messages.length) out.push('Messages:', ...messages.map(([text, n]) => '  ' + n + 'x ' + text));
      out.push('Tries:', ...tryLines(run.tries).map((line) => '  ' + line));
    }
    return out;
  }

  function describeOutcome(run) {
    const tries = plural(run.tries.length, 'try', 'tries');
    const took = run.finishedAt ? ' in ' + formatDuration(run.finishedAt - run.startedAt) : '';
    const o = run.outcome || {};
    switch (o.kind) {
      case 'saved': return 'saved after ' + tries + took + (o.viaDuplicate ? ' (an earlier try had saved it)' : '');
      case 'gave-up': return 'gave up after ' + tries + took;
      case 'cancelled': return 'stopped after ' + tries + took;
      case 'duplicate-label': return 'label already used';
      case 'empty': return 'FanFiction.net said the document was empty';
      case 'signed-out': return 'logged out after ' + tries;
      case 'challenge': return 'blocked by the Cloudflare check after ' + tries;
      case 'unexpected': return 'unexpected response (HTTP ' + o.status + ') after ' + tries;
      case 'error': return 'extension error after ' + tries + ': ' + o.message;
      default: return 'did not finish, ' + tries + ' so far (page closed or still uploading)';
    }
  }

  function describeUpload(upload, maxTries) {
    const what = upload.source === 'paste' ? 'pasted text'
      : upload.source === 'converted' ? '.' + upload.ext + ' converted in the browser'
      : upload.source === 'convert-failed' ? '.' + upload.ext + ' file as is (conversion failed)'
      : '.' + upload.ext + ' file as is';
    const format = upload.format === '0' ? 'Story format'
      : upload.format === '1' ? 'DocX format' : 'format ' + upload.format;
    return [what, formatBytes(upload.bytes), format, maxTries && 'up to ' + maxTries + ' tries']
      .filter(Boolean).join(', ');
  }

  function describeNetwork(network) {
    if (!network) return 'not checked';
    if (!network.colo) return 'unavailable';
    return ['Cloudflare ' + network.colo, network.loc, network.http, network.tls, network.warp && 'WARP ' + network.warp]
      .filter(Boolean).join(', ');
  }

  function describeServers(tries) {
    const servers = new Map();
    for (const t of tries) {
      const name = t.backend || 'no server name';
      const s = servers.get(name) || { tries: 0, saved: 0 };
      s.tries++;
      if (t.result === 'saved') s.saved++;
      servers.set(name, s);
    }
    return [...servers].sort((a, b) => b[1].tries - a[1].tries)
      .map(([name, s]) => name + ' ' + s.saved + ' of ' + s.tries + ' saved').join(', ');
  }

  function countMessages(tries) {
    const counts = new Map();
    for (const t of tries) if (t.message) counts.set(t.message, (counts.get(t.message) || 0) + 1);
    return [...counts];
  }

  function tryLines(tries) {
    const groups = [];
    tries.forEach((t, i) => {
      const g = groups[groups.length - 1];
      if (g && g.backend === t.backend && g.result === t.result && g.status === t.status) {
        g.to = i + 1;
        g.ms.push(t.ms);
      } else {
        groups.push({ from: i + 1, to: i + 1, backend: t.backend, result: t.result, status: t.status, ms: [t.ms] });
      }
    });
    const rows = groups.map((g) => {
      const fast = seconds(Math.min(...g.ms));
      const slow = seconds(Math.max(...g.ms));
      return [
        g.from === g.to ? String(g.from) : g.from + '-' + g.to,
        g.backend || '-',
        g.result,
        g.status == null ? '-' : 'HTTP ' + g.status,
        (fast === slow ? fast : fast + '-' + slow) + 's',
      ];
    });
    const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
    return rows.map((r) => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c]))).join('  '));
  }

  function seconds(ms) {
    return (ms / 1000).toFixed(1);
  }

  function formatTime(ms) {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }

  function formatDuration(ms) {
    const s = Math.round(ms / 1000);
    return s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's';
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' bytes';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many || one + 's');
  }

  const ext = root.chrome || root.browser;

  function saveRun(run) {
    return new Promise((resolve) => {
      try {
        ext.storage.local.set({ [KEY_PREFIX + run.id]: run }, () => resolve());
      } catch (err) {
        resolve();
      }
    });
  }

  function loadRuns() {
    return new Promise((resolve) => {
      try {
        ext.storage.local.get(null, (items) => {
          const runs = Object.keys(items || {}).filter((k) => k.startsWith(KEY_PREFIX)).map((k) => items[k]);
          resolve(runs.sort((a, b) => b.startedAt - a.startedAt));
        });
      } catch (err) {
        resolve([]);
      }
    });
  }

  async function startRun(run) {
    const old = (await loadRuns()).slice(MAX_RUNS - 1);
    if (old.length) await new Promise((resolve) => ext.storage.local.remove(old.map((r) => KEY_PREFIX + r.id), resolve));
    await saveRun(run);
  }

  async function checkNetwork() {
    try {
      const res = await fetch('/cdn-cgi/trace', { credentials: 'omit', cache: 'no-store' });
      return networkFromTrace(await res.text()) || {};
    } catch (err) {
      return {};
    }
  }

  async function currentReport() {
    return buildReport(await loadRuns(), {
      version: ext.runtime.getManifest().version,
      userAgent: navigator.userAgent,
      now: Date.now(),
    });
  }

  const api = { newRun, networkFromTrace, buildReport, saveRun, loadRuns, startRun, checkNetwork, currentReport };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFNUH = Object.assign(root.FFNUH || {}, { diagnostics: api });
})(globalThis);
