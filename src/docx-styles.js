(function (root) {
  'use strict';

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const TOGGLES = ['b', 'i', 'strike'];
  const OFF_VALUES = ['0', 'false', 'off', 'none'];

  function readProps(rPr, pPr) {
    const props = {};
    if (rPr) {
      for (const name of TOGGLES) {
        const el = child(rPr, name);
        if (el) props[name] = !OFF_VALUES.includes(val(el));
      }
      const u = child(rPr, 'u');
      if (u) props.u = !OFF_VALUES.includes(val(u) || 'single');
    }
    if (pPr) {
      const jc = child(pPr, 'jc');
      if (jc) props.jc = val(jc);
    }
    return props;
  }

  function readStyles(stylesDoc) {
    const styles = new Map();
    let defaultParagraph = null;
    let defaults = {};
    if (!stylesDoc) return { resolve: () => ({}), defaultParagraph };

    const docDefaults = stylesDoc.getElementsByTagNameNS(W, 'docDefaults')[0];
    if (docDefaults) {
      const rPr = docDefaults.getElementsByTagNameNS(W, 'rPr')[0];
      const pPr = docDefaults.getElementsByTagNameNS(W, 'pPr')[0];
      defaults = readProps(rPr, pPr);
    }
    for (const style of stylesDoc.getElementsByTagNameNS(W, 'style')) {
      const id = style.getAttributeNS(W, 'styleId');
      if (!id || styles.has(id)) continue;
      const basedOn = child(style, 'basedOn');
      styles.set(id, {
        basedOn: basedOn ? val(basedOn) : null,
        props: readProps(child(style, 'rPr'), child(style, 'pPr')),
      });
      const isDefault = ['1', 'true', 'on'].includes(style.getAttributeNS(W, 'default'));
      if (isDefault && style.getAttributeNS(W, 'type') === 'paragraph') defaultParagraph = id;
    }

    const cache = new Map();
    function resolve(id, seen) {
      if (!id || !styles.has(id)) return {};
      if (cache.has(id)) return cache.get(id);
      seen = seen || new Set();
      if (seen.has(id)) return {};
      seen.add(id);
      const style = styles.get(id);
      const result = Object.assign({}, resolve(style.basedOn, seen), style.props);
      cache.set(id, result);
      return result;
    }
    return { resolve, defaultParagraph, defaults };
  }

  function bakeStyles(documentDoc, stylesDoc) {
    const styles = readStyles(stylesDoc);
    let changed = 0;

    for (const p of [...documentDoc.getElementsByTagNameNS(W, 'p')]) {
      let pPr = child(p, 'pPr');
      const pStyle = pPr && child(pPr, 'pStyle');
      const paragraphStyle = Object.assign({}, styles.defaults || {},
        styles.resolve(pStyle ? val(pStyle) : styles.defaultParagraph));

      if (paragraphStyle.jc && !(pPr && child(pPr, 'jc'))) {
        if (!pPr) { pPr = el(documentDoc, 'pPr'); p.insertBefore(pPr, p.firstChild); }
        const jc = el(documentDoc, 'jc');
        jc.setAttributeNS(W, 'w:val', paragraphStyle.jc);
        pPr.appendChild(jc);
        changed++;
      }

      for (const r of directRuns(p)) {
        let rPr = child(r, 'rPr');
        const rStyle = rPr && child(rPr, 'rStyle');
        const inherited = Object.assign({}, paragraphStyle, styles.resolve(rStyle ? val(rStyle) : null));
        let runChanged = false;

        for (const name of TOGGLES.concat('u')) {
          const existing = rPr && child(rPr, name);
          if (existing) {
            const v = val(existing);
            if (v && OFF_VALUES.includes(v) && v !== '0' && name !== 'u') {
              existing.setAttributeNS(W, 'w:val', '0');
              runChanged = true;
            }
            continue;
          }
          if (inherited[name]) {
            if (!rPr) { rPr = el(documentDoc, 'rPr'); r.insertBefore(rPr, r.firstChild); }
            const prop = el(documentDoc, name);
            if (name === 'u') prop.setAttributeNS(W, 'w:val', 'single');
            rPr.appendChild(prop);
            runChanged = true;
          }
        }
        if (runChanged) changed++;
      }
    }
    return changed;
  }

  function directRuns(p) {
    return [...p.getElementsByTagNameNS(W, 'r')].filter((r) => closestParagraph(r) === p);
  }

  function closestParagraph(node) {
    for (let n = node.parentNode; n; n = n.parentNode) {
      if (n.namespaceURI === W && n.localName === 'p') return n;
    }
    return null;
  }

  function child(parent, localName) {
    for (const c of parent.childNodes) {
      if (c.nodeType === 1 && c.namespaceURI === W && c.localName === localName) return c;
    }
    return null;
  }

  function val(node) {
    return node.getAttributeNS(W, 'val') || node.getAttribute('w:val');
  }

  function el(doc, localName) {
    return doc.createElementNS(W, 'w:' + localName);
  }

  async function bakeDocxStyles(arrayBuffer, deps) {
    const JSZip = (deps && deps.JSZip) || root.JSZip;
    const Parser = (deps && deps.DOMParser) || root.DOMParser;
    const Serializer = (deps && deps.XMLSerializer) || root.XMLSerializer;
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentFile = zip.file('word/document.xml');
    if (!documentFile) throw new Error('Not a Word document');
    const stylesFile = zip.file('word/styles.xml');
    const parse = (xml) => new Parser().parseFromString(xml, 'application/xml');
    const documentDoc = parse(await documentFile.async('string'));
    const stylesDoc = stylesFile ? parse(await stylesFile.async('string')) : null;
    if (bakeStyles(documentDoc, stylesDoc) === 0) return arrayBuffer;
    zip.file('word/document.xml', new Serializer().serializeToString(documentDoc));
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  const api = { bakeDocxStyles, bakeStyles };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFNUH = Object.assign(root.FFNUH || {}, api);
})(globalThis);
