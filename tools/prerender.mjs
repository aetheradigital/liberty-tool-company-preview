// Prerender the release home page (run by tools/publish_release.sh after make_release.py).
//
// The site is a client-side template: without JavaScript, crawlers and AI assistants see an
// empty <div id="root"> and raw {{placeholders}}. This script:
//   1. renders public/index.html in headless Chrome with a clean browser (no saved cart or state),
//   2. writes the rendered markup into <div id="root">, so the page is readable without JavaScript
//      (runtime.js hydrates over it: it morphs the existing nodes and wires up the handlers),
//   3. moves the template out of the visible HTML into a <script type="text/template"> block and
//      rebuilds the <template id="tpl"> element from it at runtime, so no {{...}} text is left in the page,
//   4. adds FAQPage and Product (ItemList) JSON-LD built from the page's own FAQS and TOOLS data.
//
// Needs Playwright with Chrome or Chromium. Set CHROME_PATH to use a specific browser.
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  console.error('prerender: Playwright is not installed (npm i -g playwright). The release would ship without crawlable HTML, so stopping.');
  process.exit(1);
}
const { chromium } = loadPlaywright();

const SITE_URL = 'https://libertytoolcompany.com';
const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const file = path.join(pub, 'index.html');
let html = fs.readFileSync(file, 'utf8');
if (html.includes('id="tpl-src"')) { console.log('prerender: already done'); process.exit(0); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.css': 'text/css' };
const exe = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
// Serve public/ locally; block everything else (analytics, APIs, fonts) so nothing real is called.
await page.route('**/*', r => {
  const u = new URL(r.request().url());
  if (u.host !== 'prerender.test') return r.abort();
  let f = path.join(pub, decodeURIComponent(u.pathname));
  if (f.endsWith(path.sep) || f.endsWith('/')) f = path.join(f, 'index.html');
  if (!f.startsWith(pub) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
  r.fulfill({ status: 200, contentType: types[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
});
await page.goto('http://prerender.test/', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('root') && document.getElementById('root').children.length > 0);
await page.waitForTimeout(500);
const out = await page.evaluate(() => {
  const root = document.getElementById('root');
  const money = n => (Math.round(n * 100) / 100).toFixed(2);
  return {
    root: root.innerHTML,
    faqs: (typeof FAQS !== 'undefined' ? FAQS : []).map(f => ({ q: f.q, a: f.a })),
    tools: (typeof TOOLS !== 'undefined' ? TOOLS : []).filter(t => !t.hidden && t.price != null && !t.soon)
      .map(t => ({ name: t.name, sku: t.sku || '', price: money(t.price), img: t.img || '', body: t.body || '', group: t.group })),
  };
});
await browser.close();

if (/\{\{[^}]+\}\}/.test(out.root)) throw new Error('prerender: rendered markup still has {{placeholders}}');
if (out.root.length < 20000) throw new Error('prerender: rendered markup looks too small (' + out.root.length + ' bytes)');

// 2. rendered markup into #root
if (!html.includes('<div id="root"></div>')) throw new Error('prerender: <div id="root"></div> not found');
html = html.replace('<div id="root"></div>', () => '<div id="root">' + out.root + '</div>');

// 3. template out of the visible HTML
const m = html.match(/<template id="tpl">([\s\S]*?)<\/template>/);
if (!m) throw new Error('prerender: <template id="tpl"> not found');
const tplBody = m[1].replace(/<!--[\s\S]*?-->/g, '');
if (/<\/?script/i.test(tplBody)) throw new Error('prerender: template contains a script tag; cannot move it into a script block');
const loader = '<script>(function(){var s=document.getElementById("tpl-src"),t=document.createElement("template");t.id="tpl";t.innerHTML=s.textContent;s.parentNode.insertBefore(t,s);})();</script>';
html = html.replace(m[0], () => '<script type="text/template" id="tpl-src">' + tplBody + '</script>');
html = html.replace('<script src="/runtime.js"></script>', () => loader + '\n<script src="/runtime.js"></script>');

// 4. FAQPage + Product JSON-LD
const abs = u => (u && u.startsWith('/') ? SITE_URL + u : u);
const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'FAQPage', '@id': SITE_URL + '/#faq', mainEntity: out.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    { '@type': 'ItemList', '@id': SITE_URL + '/#tools', name: 'Liberty Tool Company Jobsite Tools',
      itemListElement: out.tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, item: Object.assign(
        { '@type': 'Product', name: t.name, description: t.body, brand: { '@type': 'Brand', name: t.group === 'trowel' ? 'Liberty Tool Company' : 'The Tape Caddy' },
          manufacturer: { '@id': SITE_URL + '/#org' }, countryOfOrigin: 'US',
          offers: { '@type': 'Offer', price: t.price, priceCurrency: 'USD', url: SITE_URL + '/#tools', seller: { '@id': SITE_URL + '/#org' } } },
        t.sku ? { sku: t.sku } : {}, t.img && !t.img.startsWith('data:') ? { image: abs(t.img) } : {}) })) },
  ],
};
const ldTag = '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>\n';
html = html.replace('</head>', () => ldTag + '</head>');

fs.writeFileSync(file, html);
console.log('prerender: home page', html.length, 'bytes;', out.faqs.length, 'FAQs,', out.tools.length, 'products in JSON-LD');
