const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { textToStoryHtml, htmlFileToStoryHtml } = require('../src/text.js');

const { DOMParser } = new JSDOM('').window;

test('txt lines to paragraphs', () => {
  const double = textToStoryHtml('First paragraph.\n\nSecond one.\r\n\r\nThird.\n', 'hr', DOMParser);
  const single = textToStoryHtml('First paragraph.\nSecond one.\nThird.', 'hr', DOMParser);
  const expected = '<p>First paragraph.</p><p>Second one.</p><p>Third.</p>';
  assert.equal(double.html, expected);
  assert.equal(single.html, expected);
});

test('txt scene breaks and escaping', () => {
  const { html, sceneBreaks } = textToStoryHtml('﻿A <b> & B.\n\n* * *\n\nAfter.', 'hr', DOMParser);
  assert.equal(sceneBreaks, 1);
  assert.equal(html, '<p>A &lt;b&gt; &amp; B.</p><hr><p>After.</p>');
});

test('html body only', () => {
  const { html, sceneBreaks } = htmlFileToStoryHtml(
    '<html><head><style>p{}</style></head><body><p><i>Hi</i></p><script>x()</script><p>~~~</p><p><img src=a.png>Bye</p></body></html>',
    'asterism', DOMParser);
  assert.equal(sceneBreaks, 1);
  assert.equal(html, '<p><i>Hi</i></p><p style="text-align:center;">⁂</p><p>Bye</p>');
});
