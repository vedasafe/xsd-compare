import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';

// Optional local runtime override; normal usage: npm install, npm test.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.XSD_PLAYWRIGHT_PATH || 'playwright');
let server, browser, page, base;
const errors = [];
before(async () => {
  const root = resolve('web');
  server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!path.startsWith(root + '/') && !path.startsWith(root + '\\')) throw new Error('Invalid path');
      const data = await readFile(path);
      res.setHeader('Content-Type', {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'}[extname(path)] || 'application/octet-stream');
      res.end(data);
    } catch { res.writeHead(404).end('Not found'); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  base = process.env.XSD_TEST_URL || `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true, ...(process.env.XSD_BROWSER_CHANNEL ? {channel:process.env.XSD_BROWSER_CHANNEL} : {})});
  page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    const text = message.text();
    // Chromium adds these two inline styles to its detached XML parsererror
    // document. CSP correctly blocks them; no parser markup enters the UI.
    const parserDiagnostic = text.startsWith('Applying inline style violates')
      && ['sha256-ICa0DhwZQJsOd/Rn0N8H6FdQ71GfNL+op2zhAQ+Y4mM=',
          'sha256-ZD0chCyBaNHl+4UwQHJIHGoYhKwMeyCXGgJTKW5/67E='].some(hash => text.includes(hash));
    if (['error','warning'].includes(message.type()) && !parserDiagnostic) errors.push(text);
  });
  await page.goto(base);
});
after(async () => { await browser?.close(); await new Promise(done => server ? server.close(done) : done()); });

async function compare(a, b) {
  return page.evaluate(async ([a,b]) => (await import('./compare.js')).compareXml(a,b), [a,b]);
}
const file = (name, text) => ({name, mimeType:'application/xml', buffer:Buffer.from(text)});

test('ignores layout, comments, processing instructions and attribute order', async () => {
  assert.deepEqual(await compare('<a x="1" y="2"><b/></a>', '<a y="2" x="1">\n\n<!--note--><?pi value?><b />\n</a>'), []);
});
test('reports changed attributes at their paths', async () => {
  assert.deepEqual(await compare('<a><b name="old"/></a>', '<a><b name="new"/></a>'),
    [{path:'/a[1]/b[1]/@name',kind:'Attribute',first:'old',second:'new'}]);
});
test('preserves meaningful text and tail spaces', async () => {
  assert.equal((await compare('<a> a <b/> x </a>', '<a>a<b/>x</a>')).length, 2);
});
test('ignores comments inside meaningful text', async () => {
  assert.deepEqual(await compare('<a>ab<!--comment-->cd</a>', '<a>abcd</a>'), []);
});
test('compares namespace URIs but QName attribute values literally', async () => {
  assert.deepEqual(await compare('<x:a xmlns:x="urn:a" x:id="1"/>', '<y:a xmlns:y="urn:a" y:id="1"/>'), []);
  assert.equal((await compare('<a xmlns="urn:a"/>', '<a xmlns="urn:b"/>')).length, 1);
  assert.equal((await compare('<a type="x:string"/>', '<a type="y:string"/>')).length, 1);
});
test('detects child order, additions, removals and empty attributes', async () => {
  assert.equal((await compare('<a><b/><c/></a>', '<a><c/><b/></a>')).length, 2);
  assert.equal((await compare('<a/>', '<a><b/></a>'))[0].kind, 'Added');
  assert.equal((await compare('<a><b/></a>', '<a/>'))[0].kind, 'Removed');
  assert.equal((await compare('<a/>', '<a x=""/>'))[0].first, null);
});
test('rejects invalid XML', async () => {
  await assert.rejects(compare('<a>', '<a/>'), /First file.*XML/s);
});
test('legitimate parsererror element does not imply parse failure', async () => {
  assert.deepEqual(await compare('<parsererror/>', '<parsererror/>'), []);
});
test('decodes UTF-16 schemas', async () => {
  const same = await page.evaluate(async () => {
    const {readSchemaFile} = await import('./compare.js');
    const text = '<?xml version="1.0" encoding="UTF-16"?><a/>';
    const bytes = new Uint8Array(2 + text.length * 2); bytes[0]=255; bytes[1]=254;
    for (let i=0;i<text.length;i++) bytes[2+i*2]=text.charCodeAt(i);
    return await readSchemaFile(new File([bytes], 'test.xsd'));
  });
  assert.match(same, /<a\/>/);
});
test('GUI selects two files, compares, clears stale output and reports errors safely', async () => {
  await page.goto(base);
  await page.waitForLoadState('networkidle');
  const requests = [];
  const record = request => requests.push(request.url());
  page.on('request', record);
  assert.equal(await page.title(), 'XSD Compare');
  assert.equal(await page.getByRole('button',{name:'Compare files',exact:true}).isDisabled(), true);
  await page.locator('#first-file').setInputFiles(file('first.xsd', '<a/>'));
  await page.locator('#second-file').setInputFiles(file('second.xsd', '<a>\n</a>'));
  await page.getByRole('button',{name:'Compare files',exact:true}).click();
  await page.getByRole('heading',{name:'Same',exact:true}).waitFor();
  await page.locator('#second-file').setInputFiles(file('second.xsd','<a x="&lt;script&gt;alert(1)&lt;/script&gt;"/>'));
  assert.equal(await page.getByRole('heading',{name:'Same',exact:true}).count(), 0);
  await page.getByRole('button',{name:'Compare files',exact:true}).click();
  await page.getByRole('heading',{name:'1 difference found',exact:true}).waitFor();
  assert.match(await page.locator('#results-body').innerText(), /<script>alert\(1\)<\/script>/);
  await page.locator('#second-file').setInputFiles(file('broken.xsd','<a>'));
  await page.getByRole('button',{name:'Compare files',exact:true}).click();
  await page.getByRole('heading',{name:'Could not compare',exact:true}).waitFor();
  await page.locator('#second-file').setInputFiles(file('wrong.txt','<a/>'));
  assert.equal(await page.getByRole('button',{name:'Compare files',exact:true}).isDisabled(), true);
  assert.match(await page.locator('#selection-status').innerText(), /\.xsd/);
  page.off('request', record);
  assert.deepEqual(requests, [], 'Selecting and comparing files must not make network requests');
  assert.deepEqual(errors, []);
});
test('desktop and mobile have no horizontal overflow', async () => {
  await page.goto(base);
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.XSD_SCREENSHOT_DIR) await page.screenshot({path:resolve(process.env.XSD_SCREENSHOT_DIR, `xsd-${width}.png`),fullPage:true});
  }
});
