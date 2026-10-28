(function (root) {
  'use strict';

  function classifyCreateResponse(status, body) {
    if (status === 429 || /Too Many Requests/i.test(body)) return 'rate-limited';
    if (/Login Required/i.test(body)) return 'signed-out';
    if (/Processing Error/i.test(body)) return 'processing-error';
    if (/Duplicate Document|already have a document/i.test(body)) return 'duplicate';
    if (/Empty Document/i.test(body)) return 'empty';
    if (/Document Saved/i.test(body)) return 'saved';
    if (/Just a moment|cf-chl|challenge-platform/i.test(body)) return 'challenge';
    return 'unknown';
  }

  function backendOf(body) {
    const m = /ray id:\s*([\w-]+)/i.exec(body);
    return m ? m[1] : null;
  }

  function findCty(html) {
    const m = /name=['"]?cty['"]?\s+value=['"]?([0-9a-f]+)/i.exec(html);
    return m ? m[1] : null;
  }

  function findDocIdByLabel(doc, label) {
    const want = normaliseLabel(label);
    for (const row of doc.querySelectorAll('tr')) {
      if (row.querySelector('tr')) continue;
      const link = row.querySelector('a[href*="docid="]');
      if (!link) continue;
      const cells = [...row.querySelectorAll('td')].map((td) => normaliseLabel(td.textContent));
      if (!cells.includes(want)) continue;
      const m = /docid=(\d+)/.exec(link.getAttribute('href'));
      if (m) return Number(m[1]);
    }
    return null;
  }

  function normaliseLabel(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  const SEPARATOR_CHARS = '*\\-~∗_=•·–—+';
  const SEPARATOR_RE = new RegExp('^[' + SEPARATOR_CHARS + ']+$');

  function isSeparatorText(text) {
    const compact = String(text || '').replace(/[\s ​]+/g, '');
    return compact.length > 0 && SEPARATOR_RE.test(compact);
  }

  const SEPARATOR_STYLES = {
    hr: (doc) => doc.createElement('hr'),
    asterism: (doc) => {
      const p = doc.createElement('p');
      p.setAttribute('style', 'text-align:center;');
      p.textContent = '⁂';
      return p;
    },
  };

  function protectSceneBreaks(html, style, DOMParserImpl) {
    const make = SEPARATOR_STYLES[style] || SEPARATOR_STYLES.hr;
    const Parser = DOMParserImpl || root.DOMParser;
    const doc = new Parser().parseFromString('<!doctype html><body>' + html, 'text/html');
    let replaced = 0;
    for (const el of [...doc.body.querySelectorAll('p, center, div, h1, h2, h3, h4, h5, h6')]) {
      if (el.querySelector('p, div, center, hr, img, h1, h2, h3, h4, h5, h6')) continue;
      if (isSeparatorText(el.textContent)) {
        el.replaceWith(make(doc));
        replaced++;
        continue;
      }
      replaced += splitAtSeparatorLines(el, make, doc);
    }
    return { html: replaced ? doc.body.innerHTML : html, replaced };
  }

  // A paragraph made of lines joined with <br>, where one line is a separator:
  // split it into paragraphs around the separator.
  function splitAtSeparatorLines(el, make, doc) {
    if (!el.querySelector(':scope > br')) return 0;
    const lines = [[]];
    for (const node of [...el.childNodes]) {
      if (node.nodeName === 'BR') lines.push([]);
      else lines[lines.length - 1].push(node);
    }
    const isSep = (line) => isSeparatorText(line.map((n) => n.textContent).join(''));
    if (!lines.some(isSep)) return 0;
    const out = [];
    let current = [];
    let count = 0;
    const flush = () => {
      while (current.length && current[current.length - 1].nodeName === 'BR') current.pop();
      if (current.some((n) => n.textContent.trim())) {
        const block = el.cloneNode(false);
        current.forEach((n) => block.appendChild(n));
        out.push(block);
      }
      current = [];
    };
    lines.forEach((line, i) => {
      if (isSep(line)) {
        flush();
        out.push(make(doc));
        count++;
      } else {
        if (current.length) current.push(doc.createElement('br'));
        current.push(...line);
      }
    });
    flush();
    el.replaceWith(...out);
    return count;
  }

  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  const SUPPORTED_EXTENSIONS = ['doc', 'docx', 'wp', 'wpd', 'wps', 'rtf', 'txt', 'htm', 'html', 'sxw', 'odt', 'pdf', 'epub'];

  function extensionOf(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function checkFile(file) {
    if (!file) return 'Choose a file.';
    if (file.size === 0) return 'File is empty.';
    if (file.size > MAX_UPLOAD_BYTES) return 'File is over 5 MB.';
    if (!SUPPORTED_EXTENSIONS.includes(extensionOf(file.name))) {
      return 'Unsupported file type: .' + (extensionOf(file.name) || '?');
    }
    return null;
  }

  function retryDelayMs(random) {
    return 2500 + Math.floor((random || Math.random)() * 1000);
  }

  const api = {
    classifyCreateResponse,
    backendOf,
    findCty,
    findDocIdByLabel,
    normaliseLabel,
    isSeparatorText,
    protectSceneBreaks,
    SEPARATOR_STYLES,
    MAX_UPLOAD_BYTES,
    SUPPORTED_EXTENSIONS,
    extensionOf,
    checkFile,
    retryDelayMs,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFNUH = Object.assign(root.FFNUH || {}, api);
})(globalThis);
