(function () {
  'use strict';

  const F = globalThis.FFNUH;
  const FLASH_KEY = 'ffnuh.editFlash';

  const form = document.querySelector('form[name="docform"]');
  if (!form) return;
  const textarea = form.elements.namedItem('bio');
  if (!textarea) return;

  showFlash();
  let settings = F.settings.DEFAULTS;
  F.settings.load().then((s) => { settings = s; });

  window.addEventListener('submit', (event) => {
    if (event.target !== form || settings.separatorStyle === 'off') return;
    document.dispatchEvent(new CustomEvent('ffnuh:save-editors'));
    const html = textarea.value || editorHtml();
    const result = F.protectSceneBreaks(html, settings.separatorStyle);
    if (!result.replaced) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    textarea.value = result.html;
    try {
      sessionStorage.setItem(FLASH_KEY, String(result.replaced));
    } catch (err) {}
    HTMLFormElement.prototype.submit.call(form);
  }, true);

  function editorHtml() {
    const frame = form.querySelector('iframe');
    const body = frame && frame.contentDocument && frame.contentDocument.body;
    return body ? body.innerHTML : '';
  }

  function showFlash() {
    let count = null;
    try {
      count = sessionStorage.getItem(FLASH_KEY);
      sessionStorage.removeItem(FLASH_KEY);
    } catch (err) { return; }
    if (!count) return;
    const note = document.createElement('div');
    note.className = 'ffnuh-panel';
    note.dataset.kind = 'success';
    note.setAttribute('role', 'status');
    note.textContent = 'Saved. Kept ' + count + ' scene break' + (count === '1' ? '' : 's') + '.';
    form.parentNode.insertBefore(note, form);
  }
})();
