(function (root) {
  'use strict';

  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.FFNUH;

  function textToStoryHtml(text, separatorStyle, DOMParserImpl) {
    const paragraphs = String(text).replace(/^\ufeff/, '').split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => '<p>' + escapeHtml(line) + '</p>');
    const result = core.protectSceneBreaks(paragraphs.join(''), separatorStyle, DOMParserImpl);
    return { html: result.html, sceneBreaks: result.replaced };
  }

  function htmlFileToStoryHtml(html, separatorStyle, DOMParserImpl) {
    const Parser = DOMParserImpl || root.DOMParser;
    const doc = new Parser().parseFromString(String(html), 'text/html');
    for (const el of doc.querySelectorAll('script, style, link, meta, img, iframe, object, embed')) el.remove();
    const result = core.protectSceneBreaks(doc.body.innerHTML.trim(), separatorStyle, Parser);
    return { html: result.html, sceneBreaks: result.replaced };
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const api = { textToStoryHtml, htmlFileToStoryHtml };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFNUH = Object.assign(root.FFNUH || {}, api);
})(globalThis);
