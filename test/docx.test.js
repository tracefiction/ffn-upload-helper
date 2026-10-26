const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const { convertDocx, toStoryHtml } = require('../src/docx.js');

const { DOMParser, XMLSerializer } = new JSDOM('').window;
const nodeMammoth = Object.assign({}, mammoth, {
  convertToHtml: (input, options) => mammoth.convertToHtml({ buffer: Buffer.from(input.arrayBuffer) }, options),
});
const deps = { mammoth: nodeMammoth, JSZip, DOMParser, XMLSerializer };

async function convertFixture() {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures', 'formatting.docx'));
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return convertDocx(arrayBuffer, 'hr', deps);
}

test('centred bold title', async () => {
  const { html } = await convertFixture();
  assert.match(html, /<p style="text-align:center;"><strong>\[T1\] Chapter Title Centered Bold<\/strong><\/p>/);
});

test('heading 1', async () => {
  const { html } = await convertFixture();
  assert.match(html, /<p style="text-align:center;"><strong>\[T2\] Heading1 style title<\/strong><\/p>/);
  assert.doesNotMatch(html, /<h1/);
});

test('docx scene breaks', async () => {
  const { html, sceneBreaks } = await convertFixture();
  assert.equal(sceneBreaks, 1);
  assert.match(html, /<hr>/);
  assert.doesNotMatch(html, /\* \* \*/);
});

test('off toggles', async () => {
  const { html } = await convertFixture();
  assert.match(html, /<p>\[T4\] explicit off val=0: should be plain end\.<\/p>/);
  assert.match(html, /<p>\[T5\] explicit off val=false: should be plain end\.<\/p>/);
  assert.match(html, /<p>\[T6\] explicit off val=off: should be plain end\.<\/p>/);
  assert.match(html, /\[T3\] plain then <em>italic<\/em> then plain\./);
  assert.match(html, /\[T8\] explicit on val=1: <strong>bold<\/strong> end\./);
});

test('paragraph style italic', async () => {
  const { html } = await convertFixture();
  assert.match(html, /<p><em>\[T9\] italic paragraph style off-toggle <\/em>upright<em> back<\/em><\/p>/);
});

test('underline', async () => {
  const { html } = await convertFixture();
  assert.match(html, /<u>under<\/u>/);
});

test('toStoryHtml', () => {
  const out = toStoryHtml('<p class="ffnuh-center">Title</p><p><img src="">Text</p>', 'hr', DOMParser);
  assert.equal(out.html, '<p style="text-align:center;">Title</p><p>Text</p>');
});

test('textutil chapter', async () => {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures', 'chapter.docx'));
  const { html, sceneBreaks } = await convertDocx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'hr', deps);
  assert.equal(sceneBreaks, 2);
  assert.equal(html,
    '<p style="text-align:center;"><strong>Chapter 3: The Long Way Round</strong></p>' +
    '<p style="text-align:center;"><em>Author\'s note: thanks for reading!</em></p>' +
    '<p>She <strong>didn\'t</strong> look back. The <u>letter</u> was still in her pocket, and it said <em>everything</em>.</p>' +
    '<hr><p>Morning came slowly.</p><hr><p>...</p><p>The end.</p>');
});
