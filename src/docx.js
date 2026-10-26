(function (root) {
  'use strict';

  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.FFNUH;

  const CENTER_STYLE = 'FFNUH Center';
  const HEADING_STYLES = /^(title|subtitle|heading [1-6])$/i;

  function mammothOptions(mammoth) {
    return {
      styleMap: [
        "p[style-name='" + CENTER_STYLE + "'] => p.ffnuh-center:fresh",
        'u => u',
      ],
      convertImage: mammoth.images.imgElement(() => ({ src: '' })),
      transformDocument: mammoth.transforms.paragraph((p) => {
        const style = p.styleName || '';
        const heading = HEADING_STYLES.test(style);
        const centred = p.alignment === 'center';
        if (!heading && !centred) return p;
        return Object.assign({}, p, {
          styleName: centred ? CENTER_STYLE : null,
          children: heading ? p.children.map(boldRuns) : p.children,
        });
      }),
    };
  }

  function boldRuns(el) {
    if (el.type === 'run') return Object.assign({}, el, { isBold: true });
    if (el.children) return Object.assign({}, el, { children: el.children.map(boldRuns) });
    return el;
  }

  function toStoryHtml(html, separatorStyle, DOMParserImpl) {
    const Parser = DOMParserImpl || root.DOMParser;
    const doc = new Parser().parseFromString('<!doctype html><body>' + html, 'text/html');
    for (const el of doc.body.querySelectorAll('.ffnuh-center')) {
      el.removeAttribute('class');
      el.setAttribute('style', 'text-align:center;');
    }
    for (const img of doc.body.querySelectorAll('img')) img.remove();
    const protectedResult = core.protectSceneBreaks(doc.body.innerHTML, separatorStyle, Parser);
    return { html: protectedResult.html, sceneBreaks: protectedResult.replaced };
  }

  async function convertDocx(arrayBuffer, separatorStyle, deps) {
    const mammoth = (deps && deps.mammoth) || root.mammoth;
    const styles = typeof module === 'object' && module.exports ? require('./docx-styles.js') : root.FFNUH;
    let baked = arrayBuffer;
    try {
      baked = await styles.bakeDocxStyles(arrayBuffer, deps);
    } catch (err) {
    }
    const result = await mammoth.convertToHtml({ arrayBuffer: baked }, mammothOptions(mammoth));
    const story = toStoryHtml(result.value, separatorStyle, deps && deps.DOMParser);
    return {
      html: story.html,
      sceneBreaks: story.sceneBreaks,
      warnings: result.messages.filter((m) => m.type === 'warning').map((m) => m.message),
    };
  }

  const api = { convertDocx, toStoryHtml };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFNUH = Object.assign(root.FFNUH || {}, api);
})(globalThis);
