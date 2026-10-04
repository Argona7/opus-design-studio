#!/usr/bin/env node
// shoot.mjs - the studio's eyes. Screenshots what you built so the model can look at it.
//   node shoot.mjs site/index.html               -> shots/iter-NN/: desktop + phone screens, warnings, src copy
//   node shoot.mjs logo.svg                      -> logo sheet: five sizes on white, warm and dark
//   node shoot.mjs cover.html --size 1500x600    -> exact-size 2x render + how it reads in a phone feed
//   node shoot.mjs https://example.com           -> refs/<host>/: reference screens of a real site
// flags: --out DIR   --hires (2x desktop / 3x phone PNG, for filming)   --slices N   --check
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VALUED = new Set(['out', 'size', 'slices']);
const o = { _: [] };
for (let a = process.argv.slice(2), i = 0; i < a.length; i++) {
  if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = VALUED.has(k) ? a[++i] : true; }
  else o._.push(a[i]);
}

async function launch() {
  try { return await chromium.launch(); }
  catch { return chromium.launch({ channel: 'chrome' }); } // no bundled Chromium: use installed Google Chrome
}

if (o.check) { const b = await launch(); console.log(`ok: browser ${b.version()}`); await b.close(); process.exit(0); }
const target = o._[0];
if (!target) {
  console.error('usage: node shoot.mjs <page.html | logo.svg | https://url> [--size WxH] [--out DIR] [--hires] [--slices N]');
  process.exit(1);
}
const isUrl = /^https?:\/\//.test(target);
if (!isUrl && !fs.existsSync(target)) { console.error(`not found: ${target}`); process.exit(1); }
const url = isUrl ? target : pathToFileURL(path.resolve(target)).href;
const mode = o.size ? 'asset' : isUrl ? 'ref' : target.endsWith('.svg') ? 'logo' : 'page';
const hires = !!o.hires;
const ext = hires || mode !== 'page' ? 'png' : 'jpg';

function nextIter(base) {
  fs.mkdirSync(base, { recursive: true });
  const nums = fs.readdirSync(base).map((d) => Number((/^iter-(\d+)$/.exec(d) || [])[1])).filter(Boolean);
  return path.join(base, `iter-${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`);
}
const out = path.resolve(o.out || (isUrl ? path.join('refs', new URL(target).hostname.replace(/^www\./, '')) : nextIter('shots')));
fs.mkdirSync(out, { recursive: true });

const files = [];
const found = new Map(); // warning -> where it was seen (desktop, phone, ...)
const warn = (where, msg) => found.set(msg, (found.get(msg) || new Set()).add(where));
const shot = async (page, name, extra = {}) => {
  const file = path.join(out, `${name}.${ext}`);
  await page.screenshot({ path: file, type: ext === 'jpg' ? 'jpeg' : 'png', ...(ext === 'jpg' ? { quality: 85 } : {}), ...extra });
  files.push(file);
  return file;
};

async function open(browser, device, label) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const w = (m) => warn(label, m);
  page.on('pageerror', (e) => w(`JS error: ${e.message.slice(0, 160)}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && w(`console error: ${m.text().slice(0, 160)}`));
  page.on('requestfailed', (r) => w(`failed to load: ${r.url().slice(0, 140)}`));
  page.on('response', (r) => r.status() >= 400 && w(`HTTP ${r.status()}: ${r.url().slice(0, 140)}`));
  await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch((e) => w(`load: ${e.message.split('\n')[0]}`));
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  if (isUrl) {
    await page.addStyleTag({
      content: '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="onetrust" i]{display:none!important}',
    }).catch(() => {});
  }
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  return { ctx, page };
}

// Runs inside the page: the things a screenshot hides from a quick look.
const AUDIT = () => {
  const found = [];
  const W = document.documentElement.clientWidth; // innerWidth grows with the overflow on phones
  const label = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : el.classList[0] ? `.${el.classList[0]}` : '');
  const over = document.documentElement.scrollWidth - W;
  if (over > 1) {
    const wide = [...document.body.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > W + 1);
    const culprits = wide.filter((el) => !wide.some((x) => x !== el && el.contains(x))).slice(0, 3);
    found.push(`horizontal scroll: page is ${over}px wider than the screen (${culprits.map(label).join(', ')})`);
  }
  const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src'));
  if (broken.length) found.push(`${broken.length} broken image(s): ${broken.slice(0, 2).map((i) => i.getAttribute('src').slice(0, 80)).join(', ')}`);

  const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const width = (font) => { c.font = `40px ${font}`; return c.measureText('mmmmmmmmmmlli1WQ@#').width; };
  const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|-apple-system|blinkmacsystemfont|inherit)$/i;
  const asked = new Set();
  for (const el of document.querySelectorAll('h1,h2,h3,p,a,button,li,label,td')) {
    if (!el.getClientRects().length) continue;
    const fam = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!fam || GENERIC.test(fam) || asked.has(fam)) continue;
    asked.add(fam);
    if (['monospace', 'serif'].every((g) => width(`"${fam}", ${g}`) === width(g))) found.push(`font "${fam}" is not loaded: text renders in a fallback`);
  }

  return found;
};

// Runs inside the page at every scroll position: contrast and tiny text for what is on screen now.
// The backdrop is whatever is painted under the text (elementsFromPoint), so text on positioned layers is judged right.
const SCREEN_AUDIT = () => {
  const seen = (window.__audited ||= new WeakSet());
  const c = (window.__px ||= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true }));
  const rgba = (css) => { c.clearRect(0, 0, 1, 1); c.fillStyle = '#000'; c.fillStyle = css; c.fillRect(0, 0, 1, 1); const d = c.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const low = [];
  let tiny = 0;
  const vh = window.visualViewport ? visualViewport.height : innerHeight;
  const vw = document.documentElement.clientWidth;
  for (const el of document.body.querySelectorAll('*')) {
    if (seen.has(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const x = r.left + Math.min(r.width / 2, 12);
    const y = r.top + r.height / 2;
    if (!r.width || !r.height || y < 0 || y >= vh || x < 0 || x >= vw || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
    seen.add(el);
    if (parseFloat(s.fontSize) < 11) tiny++;
    if (s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text') continue; // gradient text: leave it to the eyes
    const stack = document.elementsFromPoint(x, y);
    const at = stack.findIndex((p) => p === el || el.contains(p));
    if (at < 0) continue; // covered by something else
    let bg = [255, 255, 255, 1];
    for (const p of [el, ...stack.slice(at)]) {
      if (p !== el && el.contains(p)) continue;
      const ps = p === el ? s : getComputedStyle(p);
      if (ps.backgroundImage !== 'none' || /^(img|video|canvas|svg|picture|iframe)$/i.test(p.tagName)) { bg = null; break; } // text on an image: leave it to the eyes
      const b = rgba(ps.backgroundColor);
      if (b[3] > 0.5) { bg = b; break; }
    }
    if (!bg) continue;
    const f = rgba(s.color);
    const fg = [0, 1, 2].map((i) => f[i] * f[3] + bg[i] * (1 - f[3]));
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.6 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) low.push(`${ratio.toFixed(1)}:1 "${el.textContent.trim().slice(0, 40)}"`);
  }
  return { low, tiny };
};

async function capturePage(browser, name, device, maxScreens) {
  const { ctx, page } = await open(browser, device, name);
  const view = await page.evaluate(() => {
    // the element that really scrolls: the page itself, or an app shell's main panel
    let el = null;
    const vh = window.visualViewport ? visualViewport.height : innerHeight;
    if (document.scrollingElement.scrollHeight <= vh + 4) {
      let best = 4;
      for (const e of document.querySelectorAll('*')) {
        if (!/(auto|scroll)/.test(getComputedStyle(e).overflowY)) continue;
        const gain = e.scrollHeight - e.clientHeight;
        if (gain > best) { el = e; best = gain; }
      }
    }
    window.__scroller = el || document.scrollingElement;
    return el ? el.clientHeight : vh;
  });
  const scrollTo = (y) => page.evaluate((v) => { window.__scroller.scrollTop = v; }, y);
  const height = () => page.evaluate(() => window.__scroller.scrollHeight);
  // scroll through once so lazy images and reveal-on-scroll effects fire, like a real visitor
  for (let y = 0, h = await height(); y < h; y += Math.round(view * 0.7)) { await scrollTo(y); await page.waitForTimeout(120); }
  await scrollTo(0);
  await page.waitForTimeout(400);
  const total = Math.max(1, Math.ceil((await height()) / view));
  const n = Math.min(maxScreens, total);
  const shots = [];
  const low = [];
  let tiny = 0;
  for (let i = 0; i < n; i++) {
    await scrollTo(i === total - 1 ? 1e7 : i * view);
    await page.waitForTimeout(300);
    shots.push(await shot(page, `${name}-${i + 1}`, { animations: 'disabled' }));
    const a = await page.evaluate(SCREEN_AUDIT);
    low.push(...a.low.map((x) => `${x} (${name} ${i + 1})`));
    tiny += a.tiny;
  }
  await scrollTo(0);
  for (const m of await page.evaluate(AUDIT)) warn(name, m);
  if (low.length) warn(name, `${low.length} low-contrast text element(s), e.g. ${low.slice(0, 3).join('; ')}`);
  if (tiny) warn(name, `${tiny} text element(s) smaller than 11px`);
  if (total > n) warn(name, `page is ${total} screens tall, captured the first ${n} (use --slices ${total})`);
  await ctx.close();
  return shots;
}

// A throwaway HTML page next to the shots, so local images load from file://
async function sheet(browser, name, html, width) {
  const tmp = path.join(out, `.${name}.html`);
  fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px/1.3 system-ui,sans-serif">${html}</body>`);
  const ctx = await browser.newContext({ viewport: { width, height: 600 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  const file = await shot(page, name, { fullPage: true });
  await ctx.close();
  fs.rmSync(tmp);
  return file;
}
const src = (f) => pathToFileURL(f).href;

function snapshot(from, to) {
  const list = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || ['shots', 'refs', 'node_modules'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else list.push(p);
    }
  };
  walk(from);
  const bytes = list.reduce((s, f) => s + fs.statSync(f).size, 0);
  if (list.length > 150 || bytes > 25e6) return false; // a whole project, not a design folder: skip
  for (const f of list) {
    const dest = path.join(to, path.relative(from, f));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f, dest);
  }
  return true;
}

const browser = await launch();
try {
  if (mode === 'page' || mode === 'ref') {
    const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: hires ? 2 : 1 };
    const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: hires ? 3 : 2, isMobile: true, hasTouch: true };
    const max = Number(o.slices) || (mode === 'ref' ? 2 : 8);
    await capturePage(browser, 'desktop', desktop, max);
    const phones = await capturePage(browser, 'phone', phone, mode === 'ref' ? 1 : Math.max(max, 10));
    if (phones.length > 1) {
      const tiles = phones.map((f, i) => `<figure style="margin:0"><img src="${src(f)}" style="width:300px;display:block;border:1px solid #ddd"><figcaption>phone ${i + 1}</figcaption></figure>`);
      await sheet(browser, 'phone-sheet', `<div style="display:flex;flex-wrap:wrap;gap:16px;padding:16px;background:#fff">${tiles.join('')}</div>`, 5 * 316 + 16);
    }
  } else if (mode === 'asset') {
    const [w, h] = o.size.split('x').map(Number);
    const { ctx, page } = await open(browser, { viewport: { width: w, height: h }, deviceScaleFactor: 2 }, 'asset');
    for (const m of await page.evaluate(AUDIT)) warn('asset', m);
    const a = await page.evaluate(SCREEN_AUDIT);
    if (a.low.length) warn('asset', `${a.low.length} low-contrast text element(s), e.g. ${a.low.slice(0, 3).join('; ')}`);
    if (a.tiny) warn('asset', `${a.tiny} text element(s) smaller than 11px`);
    const big = await shot(page, 'asset');
    await ctx.close();
    const fig = (px, cap) => `<figure style="margin:0"><img src="${src(big)}" style="width:${px}px;display:block;border-radius:12px"><figcaption style="color:#8b98a5;margin-top:6px">${cap}</figcaption></figure>`;
    await sheet(browser, 'asset-feed', `<div style="display:flex;gap:32px;align-items:flex-start;padding:24px;background:#000">${fig(390, 'phone feed, 390px')}${fig(600, 'desktop feed, 600px')}</div>`, 1100);
  } else {
    const svg = fs.readFileSync(target, 'utf8');
    if (!/<svg[^>]*viewBox/i.test(svg)) warn('logo', 'no viewBox, so it will not scale cleanly');
    if (/<text[\s>]/i.test(svg)) warn('logo', 'uses <text>, so it depends on the font being installed; convert the letters to paths for the final file');
    if (/<image[\s>]/i.test(svg)) warn('logo', 'embeds a raster <image>, so it is not a true vector logo');
    const rows = [['#ffffff', '#111'], ['#f1ede4', '#111'], ['#121212', '#eee']].map(([bg, fg]) =>
      `<div style="background:${bg};color:${fg};display:flex;align-items:flex-end;gap:40px;padding:40px">${[240, 96, 48, 24, 16]
        .map((s) => `<figure style="margin:0"><img src="${src(path.resolve(target))}" style="height:${s}px;display:block"><figcaption style="opacity:.5;margin-top:6px">${s}px</figcaption></figure>`)
        .join('')}</div>`);
    await sheet(browser, 'logo-sheet', rows.join(''), 1600);
  }
  if (!isUrl && snapshot(path.dirname(path.resolve(target)), path.join(out, 'src'))) files.push(path.join(out, 'src/'));
} finally {
  await browser.close();
}

const warnings = [...found].map(([msg, where]) => `${[...where].join('+')}: ${msg}`);
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ target, mode, time: new Date().toISOString(), files, warnings }, null, 2));
console.log(`${out} (${mode})`);
for (const f of files) console.log(`  ${f}`);
console.log(warnings.length ? `warnings:\n${warnings.map((w) => `  - ${w}`).join('\n')}` : 'warnings: none');
console.log('Open every image above and look at it before you judge anything. Then critique against DESIGN.md.');
