const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const core = require('../src/core.js');

const { DOMParser } = new JSDOM('').window;
const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('classify', () => {
  const c = core.classifyCreateResponse;
  assert.equal(c(200, '<b>Processing Error:</b> not in a supported format'), 'processing-error');
  assert.equal(c(200, 'Document Saved'), 'saved');
  assert.equal(c(200, 'Duplicate Document: You already have a document with label: X'), 'duplicate');
  assert.equal(c(200, 'You already have a document named X'), 'duplicate');
  assert.equal(c(200, 'Empty Document'), 'empty');
  assert.equal(c(200, 'FanFiction.Net Login Required'), 'signed-out');
  assert.equal(c(429, ''), 'rate-limited');
  assert.equal(c(200, '429 Too Many Requests'), 'rate-limited');
  assert.equal(c(403, '<title>Just a moment...</title>'), 'challenge');
  assert.equal(c(200, 'Error Type 1'), 'unknown');
});

test('classify saved page', () => {
  assert.equal(core.classifyCreateResponse(200, fixture('docs-saved.html')), 'saved');
});

test('backend', () => {
  assert.equal(core.backendOf('ray id: S2-M'), 'S2-M');
  assert.equal(core.backendOf('ray id: php-master'), 'php-master');
  assert.equal(core.backendOf('nothing'), null);
});

test('cty', () => {
  const hex = 'abcdef0123456789';
  assert.equal(core.findCty(`<input type=hidden name='cty' value='${hex}'>`), hex);
  assert.equal(core.findCty(`<input type="hidden" name="cty" value="${hex}">`), hex);
  assert.equal(core.findCty(`<input type=hidden name=cty value=${hex}>`), hex);
  assert.equal(core.findCty('<input name=title>'), null);
});

test('doc id by label', () => {
  const doc = parse(fixture('docs-saved.html'));
  assert.equal(core.findDocIdByLabel(doc, 'Chapter 1 draft'), 10000081);
  assert.equal(core.findDocIdByLabel(doc, 'Chapter 12 draft'), 10000190);
  assert.equal(core.findDocIdByLabel(doc, 'missing'), null);
});

test('separator detection', () => {
  for (const s of ['* * *', '***', '- - -', '~~~', '∗ ∗ ∗', '_ _ _', '=====', '——', '* * *']) {
    assert.equal(core.isSeparatorText(s), true, s);
  }
  for (const s of ['', '   ', '#', '⁂', 'o0o0o', '...', '* end *', 'Part 2', '2']) {
    assert.equal(core.isSeparatorText(s), false, s);
  }
});

test('separators to hr', () => {
  const html = '<p>Before.</p><p style="text-align:center;"><strong>* * *</strong></p><center>~~~</center><p>&nbsp;</p><p>After.</p>';
  const { html: out, replaced } = core.protectSceneBreaks(html, 'hr', DOMParser);
  assert.equal(replaced, 2);
  assert.equal(out, '<p>Before.</p><hr><hr><p>&nbsp;</p><p>After.</p>');
});

test('asterism style', () => {
  const { html, replaced } = core.protectSceneBreaks('<p>***</p>', 'asterism', DOMParser);
  assert.equal(replaced, 1);
  assert.equal(html, '<p style="text-align:center;">⁂</p>');
});

test('no-op', () => {
  const input = '<p>One &amp; two</p><div><p>* in a wrapper is handled per paragraph</p></div>';
  assert.deepEqual(core.protectSceneBreaks(input, 'hr', DOMParser), { html: input, replaced: 0 });
});

test('leaf blocks only', () => {
  const { html } = core.protectSceneBreaks('<div><p>* * *</p><p>Text</p></div>', 'hr', DOMParser);
  assert.equal(html, '<div><hr><p>Text</p></div>');
});

test('checkFile', () => {
  assert.match(core.checkFile(null), /Choose a file/);
  assert.match(core.checkFile({ name: 'a.docx', size: 0 }), /empty/);
  assert.match(core.checkFile({ name: 'a.docx', size: 6 * 1024 * 1024 }), /5 MB/);
  assert.match(core.checkFile({ name: 'a.pages', size: 10 }), /Unsupported file type: \.pages/);
  assert.equal(core.checkFile({ name: 'Chapter.DOCX', size: 10 }), null);
});

test('retry delay', () => {
  assert.equal(core.retryDelayMs(() => 0), 2500);
  assert.equal(core.retryDelayMs(() => 0.999), 3499);
});

test('separators on br lines', () => {
  const { html, replaced } = core.protectSceneBreaks('<p>A/N: hello<br>***<br>So...<br>Next line</p>', 'hr', DOMParser);
  assert.equal(replaced, 1);
  assert.equal(html, '<p>A/N: hello</p><hr><p>So...<br>Next line</p>');
});

test('br lines without separators are left alone', () => {
  const input = '<p>One<br>Two</p>';
  assert.deepEqual(core.protectSceneBreaks(input, 'hr', DOMParser), { html: input, replaced: 0 });
});

test('separator on the first br line', () => {
  const { html } = core.protectSceneBreaks('<p style="text-align:center;">* * *<br>Text</p>', 'asterism', DOMParser);
  assert.equal(html, '<p style="text-align:center;">\u2042</p><p style="text-align:center;">Text</p>');
});

test('processing error text', () => {
  const page = parse('<div class=alert><b>Processing Error:</b> The document is not in a supported format, over 5MB, or password-protected.</div>' +
    '<form><input name=title></form><div class=footer>ray id: php-master</div>');
  assert.equal(core.processingErrorText(page),
    'Processing Error: The document is not in a supported format, over 5MB, or password-protected.');
  assert.equal(core.processingErrorText(parse('<b>Processing Error:</b> Not supported. ray id: S2-M')),
    'Processing Error: Not supported.');
  assert.equal(core.processingErrorText(parse('<p>Document Saved</p>')), null);
  const listPage = fixture('docs-saved.html').replace("<div class='alert alert-success'>Document Saved</div>",
    'Document Manager<b>Processing Error:</b> Bad format.');
  assert.equal(core.processingErrorText(parse(listPage)), 'Processing Error: Bad format.');
});
