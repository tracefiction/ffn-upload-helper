const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { TOKEN, docsPage, editPage } = require('./pages.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CHROME = process.env.CHROME_PATH || path.join(os.homedir(),
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

function fields(request) {
  const body = request.postDataBuffer().toString('latin1');
  const boundary = /boundary=(.+)$/.exec(request.headers()['content-type'])[1];
  const out = {};
  for (const part of body.split('--' + boundary)) {
    const m = /name="([^"]+)"(?:; filename="([^"]*)")?[\s\S]*?\r\n\r\n([\s\S]*)\r\n$/.exec(part);
    if (m) out[m[1]] = m[2] !== undefined ? { filename: m[2], content: m[3] } : Buffer.from(m[3], 'latin1').toString('utf8');
  }
  return out;
}

async function withSite(script, run) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffnuh-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: CHROME,
    headless: true,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  });
  const site = { docs: [{ id: 10000081, label: 'Existing doc', words: 120 }], creates: [], edits: [], nextId: 10000200 };
  await context.route('https://www.fanfiction.net/docs/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/docs/docs.php' && request.method() === 'GET') {
      return route.fulfill({ contentType: 'text/html', body: docsPage(site.docs) });
    }
    if (url.pathname === '/docs/docs.php' && request.method() === 'POST') {
      const f = fields(request);
      site.creates.push(f);
      const reply = script(f, site.creates.length, site);
      if (reply === 'saved') {
        site.docs.push({ id: site.nextId++, label: f.title, words: 10 });
        return route.fulfill({ contentType: 'text/html', body: docsPage(site.docs, 'Document Saved') });
      }
      return route.fulfill(typeof reply === 'object' ? reply : { contentType: 'text/html', body: reply });
    }
    if (url.pathname === '/docs/edit.php') {
      const id = Number(url.searchParams.get('docid'));
      const doc = site.docs.find((d) => d.id === id) || { id, label: 'Doc', html: '' };
      if (request.method() === 'POST') {
        const bio = new URLSearchParams(request.postData()).get('bio');
        site.edits.push({ bio, referer: request.headers().referer });
        doc.html = bio;
        return route.fulfill({ contentType: 'text/html', body: editPage(doc, true) });
      }
      return route.fulfill({ contentType: 'text/html', body: editPage(doc, false) });
    }
    return route.fulfill({ status: 404, body: 'not found' });
  });
  try {
    const page = await context.newPage();
    await run(page, site);
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

const ERROR = '<b>Processing Error:</b> The document is not in a supported format, over 5MB, or password-protected. ray id: S2-M';

test('paste, retry, save', { timeout: 60000 }, async () => {
  await withSite((f, n) => (n < 3 ? ERROR : 'saved'), async (page, site) => {
    await page.goto('https://www.fanfiction.net/docs/docs.php');
    await page.fill('input[name=title]', 'Chapter 4');
    await page.check('#input_method_web');
    await page.waitForFunction(() => window.tinymce && tinymce.activeEditor && tinymce.activeEditor.initialized);
    await page.evaluate(() => tinymce.activeEditor.setContent('<p>Before.</p><p style="text-align:center;">* * *</p><p>After.</p>'));
    await page.click('button[type=submit]');
    await page.waitForSelector('.ffnuh-detail:has-text("Attempt 1/60")');
    const first = await page.textContent('.ffnuh-detail');
    await page.waitForTimeout(1100);
    const later = await page.textContent('.ffnuh-detail');
    const secondsLeft = (text) => (/in (\d)s/.exec(text) || [0, 0])[1] * 1;
    assert.match(first, /Retrying in [34]s/);
    assert.ok(secondsLeft(later) < secondsLeft(first));
    await page.waitForURL('**/docs/docs.php');
    await page.waitForSelector('.ffnuh-panel[data-kind=success]');
    const panel = await page.textContent('.ffnuh-panel');
    assert.match(panel, /Saved "Chapter 4" after 3 tries\./);
    assert.match(panel, /Kept 1 scene break\./);
    assert.equal(await page.evaluate(() => {
      const panel = document.querySelector('.ffnuh-panel[data-kind=success]');
      return Boolean(panel.compareDocumentPosition(document.getElementById('gui_table1')) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), true);
    assert.match(await page.textContent('tr.ffnuh-new-row'), /Chapter 4/);
    assert.equal(await page.$('.ffnuh-panel[data-kind=success] a'), null);

    assert.equal(site.creates.length, 3);
    for (const f of site.creates) {
      assert.equal(f.cty, TOKEN);
      assert.equal(f.method, 'web');
      assert.equal(f.format, '0');
      assert.equal(f.action, 'upload');
    }
    assert.match(site.creates[0].webcontent, /<p>Before\.<\/p>\s*<hr( \/)?>\s*<p>After\.<\/p>/);
    assert.equal(await page.evaluate(() => window.__nativeSubmit || 0), 0);
  });
});

test('docx upload', { timeout: 60000 }, async () => {
  await withSite(() => 'saved', async (page, site) => {
    await page.goto('https://www.fanfiction.net/docs/docs.php');
    await page.fill('input[name=title]', 'Chapter 3');
    await page.setInputFiles('#doc_file', path.join(ROOT, 'test/fixtures/chapter.docx'));
    await page.click('button[type=submit]');
    await page.waitForSelector('.ffnuh-panel[data-kind=success]');
    const f = site.creates[0];
    assert.equal(f.method, 'web');
    assert.match(f.webcontent, /^<p style="text-align:center;"><strong>Chapter 3: The Long Way Round<\/strong><\/p>/);
    assert.equal((f.webcontent.match(/<hr>/g) || []).length, 2);
    assert.match(await page.textContent('.ffnuh-panel'), /after 1 try\./);
  });
});

test('txt upload', { timeout: 60000 }, async () => {
  await withSite(() => 'saved', async (page, site) => {
    await page.goto('https://www.fanfiction.net/docs/docs.php');
    await page.fill('input[name=title]', 'Notes');
    const text = Buffer.concat([Buffer.from('It'), Buffer.from([0x92]), Buffer.from('s here.\r\n\r\n* * *\r\n\r\nWorld')]);
    await page.setInputFiles('#doc_file', { name: 'notes.txt', mimeType: 'text/plain', buffer: text });
    await page.click('button[type=submit]');
    await page.waitForSelector('.ffnuh-panel[data-kind=success]');
    assert.equal(site.creates[0].method, 'web');
    assert.equal(site.creates[0].webcontent, '<p>It\u2019s here.</p><hr><p>World</p>');
    assert.match(await page.textContent('.ffnuh-panel'), /Converted notes\.txt locally\./);
  });
});

test('rtf upload as is', { timeout: 60000 }, async () => {
  await withSite((f, n) => (n < 2 ? ERROR : 'saved'), async (page, site) => {
    await page.goto('https://www.fanfiction.net/docs/docs.php');
    await page.fill('input[name=title]', 'Notes');
    await page.setInputFiles('#doc_file', { name: 'notes.rtf', mimeType: 'application/rtf', buffer: Buffer.from('{\\rtf1 Hello}') });
    await page.click('button[type=submit]');
    await page.waitForSelector('.ffnuh-panel[data-kind=success]');
    assert.equal(site.creates.length, 2);
    assert.equal(site.creates[1].method, 'file');
    assert.deepEqual(site.creates[1].doc, { filename: 'notes.rtf', content: '{\\rtf1 Hello}' });
  });
});

test('duplicate label', { timeout: 60000 }, async () => {
  await withSite(() => 'Duplicate Document: You already have a document with label: Existing doc', async (page, site) => {
    await page.goto('https://www.fanfiction.net/docs/docs.php');
    await page.fill('input[name=title]', 'Existing doc');
    await page.setInputFiles('#doc_file', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
    await page.click('button[type=submit]');
    await page.waitForSelector('.ffnuh-panel[data-kind=error]');
    assert.match(await page.textContent('.ffnuh-panel'), /A document named "Existing doc" already exists\./);
    assert.equal(site.creates.length, 1);
  });
});

test('unsupported file', { timeout: 60000 }, async () => {
  await withSite(() => 'saved', async (page, site) => {
    await page.goto('https://www.fanfiction.net/docs/docs.php');
    await page.fill('input[name=title]', 'Pages file');
    await page.setInputFiles('#doc_file', { name: 'chapter.pages', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
    await page.click('button[type=submit]');
    await page.waitForSelector('.ffnuh-panel[data-kind=error]');
    assert.match(await page.textContent('.ffnuh-panel'), /Unsupported file type: \.pages/);
    assert.equal(site.creates.length, 0);
  });
});

test('stop', { timeout: 60000 }, async () => {
  await withSite(() => ERROR, async (page, site) => {
    await page.goto('https://www.fanfiction.net/docs/docs.php');
    await page.fill('input[name=title]', 'Stopped');
    await page.setInputFiles('#doc_file', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
    await page.click('button[type=submit]');
    await page.waitForSelector('.ffnuh-detail:has-text("Attempt 1/60")');
    await page.click('.ffnuh-button:has-text("Stop")');
    await page.waitForSelector('.ffnuh-panel[data-kind=info]');
    assert.match(await page.textContent('.ffnuh-panel'), /Stopped after 1 try\./);
    await page.waitForTimeout(4000);
    assert.equal(site.creates.length, 1);
  });
});

test('editor scene breaks', { timeout: 60000 }, async () => {
  await withSite(() => 'saved', async (page, site) => {
    site.docs.push({ id: 10000150, label: 'Draft', words: 3, html: '<p>One.</p><p>~~~</p><p>Two.</p>' });
    await page.goto('https://www.fanfiction.net/docs/edit.php?docid=10000150');
    await page.waitForFunction(() => window.tinymce && tinymce.activeEditor && tinymce.activeEditor.initialized);
    await page.click('button[type=submit]');
    await page.waitForSelector('.ffnuh-panel[data-kind=success]');
    assert.equal(site.edits.length, 1);
    assert.match(site.edits[0].bio, /<p>One\.<\/p>\s*<hr( \/)?>\s*<p>Two\.<\/p>/);
    assert.match(site.edits[0].referer, /\/docs\/edit\.php\?docid=10000150$/);
    assert.match(await page.textContent('.ffnuh-panel'), /Kept 1 scene break\./);
  });
});

test('editor no-op', { timeout: 60000 }, async () => {
  await withSite(() => 'saved', async (page, site) => {
    site.docs.push({ id: 10000151, label: 'Plain', words: 2, html: '<p>Just text.</p>' });
    await page.goto('https://www.fanfiction.net/docs/edit.php?docid=10000151');
    await page.waitForFunction(() => window.tinymce && tinymce.activeEditor && tinymce.activeEditor.initialized);
    await page.evaluate(() => tinymce.activeEditor.setContent('<p>Just text, edited.</p>'));
    await page.click('button[type=submit]');
    await page.waitForSelector('text=Document Saved');
    assert.match(site.edits[0].bio, /Just text, edited\./);
    assert.equal(await page.$('.ffnuh-panel'), null);
  });
});
