(function () {
  'use strict';

  const F = globalThis.FFNUH;
  const FLASH_KEY = 'ffnuh.flash';

  const form = document.querySelector('form#upload');
  if (!form) return;

  let running = null;
  let bypassOnce = false;

  const panel = buildPanel();
  form.parentNode.insertBefore(panel.root, form);
  showFlash();

  window.addEventListener('submit', (event) => {
    if (event.target !== form) return;
    if (bypassOnce) { bypassOnce = false; return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (running) return;
    submit().catch((err) => {
      running = null;
      panel.show('error', 'Something went wrong: ' + err.message, { offerBypass: true });
    });
  }, true);

  window.addEventListener('beforeunload', (event) => {
    if (running) { event.preventDefault(); event.returnValue = ''; }
  });

  async function submit() {
    const settings = await F.settings.load();
    const label = F.normaliseLabel(field('title') && field('title').value);
    const method = checkedValue('method') || 'file';
    const format = checkedValue('format') || '0';
    const isStory = format === '0';
    const cty = field('cty') && field('cty').value;

    if (!label) return panel.show('error', 'Label is required.');
    if (!cty) return panel.show('error', 'Missing form token, reload the page.');

    let payload;
    const notes = [];

    if (method === 'web') {
      let html = readEditorHtml();
      if (!html.replace(/<[^>]*>|&nbsp;|\s/g, '')) return panel.show('error', 'Nothing to upload.');
      if (isStory && settings.separatorStyle !== 'off') {
        const result = F.protectSceneBreaks(html, settings.separatorStyle);
        html = result.html;
        if (result.replaced) notes.push(sceneBreakNote(result.replaced));
      }
      payload = { method: 'web', html };
    } else {
      const file = field('doc') && field('doc').files && field('doc').files[0];
      const problem = F.checkFile(file);
      if (problem) return panel.show('error', problem);
      const kind = convertibleKind(file.name);
      if (isStory && settings.convertFiles && kind) {
        panel.show('working', 'Converting ' + file.name + '...');
        try {
          const converted = await convertFile(file, kind, settings.separatorStyle === 'off' ? 'hr' : settings.separatorStyle);
          if (!converted.html.replace(/<[^>]*>|&nbsp;|\s/g, '')) {
            return panel.show('error', 'File is empty.');
          }
          payload = { method: 'web', html: converted.html };
          notes.push('Converted ' + file.name + ' locally.');
          if (converted.sceneBreaks) notes.push(sceneBreakNote(converted.sceneBreaks));
        } catch (err) {
          payload = { method: 'file', file };
          notes.push('Could not convert ' + file.name + ', uploading as is.');
        }
      } else {
        payload = { method: 'file', file };
      }
    }

    running = new AbortController();
    panel.show('working', 'Uploading "' + label + '"...', { notes, onCancel: () => running && running.abort() });

    const outcome = await F.createDocument({
      label,
      maxTries: settings.maxTries,
      signal: running.signal,
      buildBody: () => buildBody(label, payload, format, cty),
      onProgress: (p) => panel.progress(p),
    });
    running = null;
    report(outcome, label, notes);
  }

  function convertibleKind(name) {
    const ext = F.extensionOf(name);
    if (ext === 'docx') return 'docx';
    if (ext === 'txt') return 'text';
    if (ext === 'htm' || ext === 'html') return 'html';
    return null;
  }

  async function convertFile(file, kind, separatorStyle) {
    const buffer = await file.arrayBuffer();
    if (kind === 'docx') return F.convertDocx(buffer, separatorStyle);
    const text = decodeText(buffer);
    return kind === 'html' ? F.htmlFileToStoryHtml(text, separatorStyle) : F.textToStoryHtml(text, separatorStyle);
  }

  function decodeText(buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (err) {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  function buildBody(label, payload, format, cty) {
    const fd = new FormData();
    fd.append('title', label);
    fd.append('method', payload.method);
    if (payload.method === 'file') fd.append('doc', payload.file, payload.file.name);
    else fd.append('doc', new Blob([]), '');
    fd.append('webcontent', payload.method === 'web' ? payload.html : '');
    fd.append('format', format);
    fd.append('action', 'upload');
    fd.append('cty', cty);
    return fd;
  }

  function report(outcome, label, notes) {
    const tries = outcome.tries === 1 ? '1 try' : outcome.tries + ' tries';
    switch (outcome.kind) {
      case 'saved': {
        const message = 'Saved "' + label + '" after ' + tries + '.';
        try {
          sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, notes, docId: outcome.docId || null }));
        } catch (err) {}
        location.assign('/docs/docs.php');
        return;
      }
      case 'duplicate-label':
        return panel.show('error', 'A document named "' + label + '" already exists.');
      case 'empty':
        return panel.show('error', 'FanFiction.net says the document is empty.');
      case 'signed-out':
        return panel.show('error', 'You were logged out. Log in again in another tab and resubmit.');
      case 'challenge':
        return panel.show('error', 'Blocked by the Cloudflare check. Reload the page and resubmit.');
      case 'cancelled':
        return panel.show('info', 'Stopped after ' + tries + '.');
      case 'gave-up':
        return panel.show('error', 'Gave up after ' + tries + '. FanFiction.net may be having issues, try again later.', { notes });
      default:
        return panel.show('error', 'Unexpected response (HTTP ' + outcome.status + '): ' + outcome.snippet, { offerBypass: true });
    }
  }

  function showFlash() {
    let flash = null;
    try {
      flash = JSON.parse(sessionStorage.getItem(FLASH_KEY) || 'null');
      sessionStorage.removeItem(FLASH_KEY);
    } catch (err) { return; }
    if (!flash) return;
    const list = document.getElementById('gui_table1');
    const anchor = list ? (list.closest('.table-bordered') || list) : form;
    const top = buildPanel();
    anchor.parentNode.insertBefore(top.root, anchor);
    top.show('success', flash.message, { notes: flash.notes });
    top.root.scrollIntoView({ block: 'nearest' });
    if (flash.docId && list) {
      const link = list.querySelector('a[href*="docid=' + flash.docId + '"]');
      const row = link && link.closest('tr');
      if (row) row.classList.add('ffnuh-new-row');
    }
  }

  function field(name) { return form.elements.namedItem(name); }

  function checkedValue(name) {
    const el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function readEditorHtml() {
    document.dispatchEvent(new CustomEvent('ffnuh:save-editors'));
    const textarea = field('webcontent');
    if (textarea && textarea.value.trim()) return textarea.value;
    const frame = document.getElementById('webcontent_ifr');
    const body = frame && frame.contentDocument && frame.contentDocument.body;
    return body ? body.innerHTML : '';
  }

  function sceneBreakNote(count) {
    return 'Kept ' + count + ' scene break' + (count === 1 ? '' : 's') + '.';
  }

  function buildPanel() {
    const root = el('div', 'ffnuh-panel');
    root.hidden = true;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    const title = el('div', 'ffnuh-title');
    const detail = el('div', 'ffnuh-detail');
    const list = el('ul', 'ffnuh-notes');
    const actions = el('div', 'ffnuh-actions');
    root.append(title, detail, list, actions);
    let countdown = null;

    function stopCountdown() {
      if (countdown) clearInterval(countdown);
      countdown = null;
    }

    function show(kind, message, opts) {
      opts = opts || {};
      stopCountdown();
      root.hidden = false;
      root.dataset.kind = kind;
      title.textContent = message;
      detail.textContent = '';
      list.replaceChildren(...(opts.notes || []).map((n) => el('li', null, n)));
      actions.replaceChildren();
      if (opts.onCancel) actions.append(button('Stop', opts.onCancel));
      if (opts.offerBypass) {
        actions.append(button('Upload normally', () => {
          bypassOnce = true;
          form.requestSubmit ? form.requestSubmit() : form.submit();
        }));
      }
    }

    function progress(p) {
      const why = p.lastResult === 'rate-limited' ? 'rate limited'
        : p.lastResult === 'network-error' ? 'network error' : 'Processing Error';
      const base = 'Attempt ' + p.tries + '/' + p.maxTries + ' failed (' + why + ').';
      stopCountdown();
      if (!p.waitingMs) { detail.textContent = base; return; }
      const until = Date.now() + p.waitingMs;
      const tick = () => {
        const seconds = Math.ceil((until - Date.now()) / 1000);
        detail.textContent = base + (seconds > 0 ? ' Retrying in ' + seconds + 's' : ' Retrying...');
        if (seconds <= 0) stopCountdown();
      };
      tick();
      countdown = setInterval(tick, 250);
    }

    return { root, show, progress };
  }

  function button(text, onClick) {
    const b = el('button', 'ffnuh-button', text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
})();
