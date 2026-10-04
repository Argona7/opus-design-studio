#!/usr/bin/env node
// frames.mjs - eyes for motion. Freezes an HTML animation at exact moments so the model can watch its own frames.
//   node frames.mjs reel/index.html                 -> shots/iter-NN/: contact sheets, one frame every 0.5 s, timestamped
//   node frames.mjs reel/index.html --strip 4.2     -> plus 12 consecutive frames from 4.2 s (catches pops and overlaps)
//   node frames.mjs reel/index.html --mp4 reel.mp4  -> the finished video: 1920x1080, 30 fps, h264 with a silent aac track
// flags: --dur 15  --every 0.5  --fps 30  --size 1920x1080  --out DIR
// The page runs on virtual time, so every frame lands exactly on its timestamp: CSS animations,
// transitions, Web Animations, GSAP, timers and requestAnimationFrame loops all follow it.
// A page that defines window.seek(seconds) is seeked directly.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VALUED = new Set(['out', 'size', 'dur', 'every', 'fps', 'strip', 'mp4']);
const o = { _: [] };
for (let a = process.argv.slice(2), i = 0; i < a.length; i++) {
  if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = VALUED.has(k) ? a[++i] : true; }
  else o._.push(a[i]);
}
const target = o._[0];
if (!target) {
  console.error('usage: node frames.mjs <page.html> [--dur 15] [--every 0.5] [--strip T] [--mp4 out.mp4] [--fps 30] [--size WxH]');
  process.exit(1);
}
const isUrl = /^https?:\/\//.test(target);
const url = isUrl ? target : pathToFileURL(path.resolve(target)).href;
const [W, H] = (o.size || '1920x1080').split('x').map(Number);
const DUR = Number(o.dur || 15);
const EVERY = Number(o.every || 0.5);
const FPS = Number(o.fps || 30);

function nextIter(base) {
  fs.mkdirSync(base, { recursive: true });
  const nums = fs.readdirSync(base).map((d) => Number((/^iter-(\d+)$/.exec(d) || [])[1])).filter(Boolean);
  return path.join(base, `iter-${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`);
}
const videoOnly = o.mp4 && !o.strip;
const out = path.resolve(o.out || (videoOnly ? path.dirname(path.resolve(o.mp4)) : nextIter('shots')));
fs.mkdirSync(out, { recursive: true });

// a copy of the source next to the frames, so every round can be replayed later
function snapshot(from, to) {
  const list = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || ['shots', 'refs', 'node_modules'].includes(e.name) || e.name.endsWith('.mp4')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else list.push(p);
    }
  };
  walk(from);
  if (list.length > 150 || list.reduce((s, f) => s + fs.statSync(f).size, 0) > 25e6) return;
  for (const f of list) {
    const dest = path.join(to, path.relative(from, f));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f, dest);
  }
}

// Injected before any page script: the page's clocks, timers and animation frames run on virtual time,
// which only moves when window.__advance(ms) is called. CSS and Web Animations are paused and seeked to match.
const VIRTUAL_TIME = () => {
  const RealDate = Date;
  const EPOCH = 1790000000000;
  let now = 0;
  let seq = 0;
  const timers = new Map();
  let rafs = new Map();
  const report = (e) => (window.reportError ? window.reportError(e) : console.error(e));
  window.setTimeout = (fn, ms, ...args) => { timers.set(++seq, { at: now + Math.max(0, Number(ms) || 0), fn, args }); return seq; };
  window.setInterval = (fn, ms, ...args) => { const every = Math.max(1, Number(ms) || 0); timers.set(++seq, { at: now + every, fn, args, every }); return seq; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (cb) => { rafs.set(++seq, cb); return seq; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };
  performance.now = () => now;
  window.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [EPOCH + now])); }
    static now() { return EPOCH + now; }
  };
  const start = new WeakMap();
  const drive = () => {
    for (const a of document.getAnimations()) {
      if (!start.has(a)) start.set(a, now);
      const local = now - start.get(a);
      const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
      if (Number.isFinite(end) && local >= end) { if (a.playState !== 'finished') try { a.finish(); } catch {} }
      else { if (a.playState !== 'paused') a.pause(); a.currentTime = local; }
    }
  };
  const tick = (t) => {
    for (;;) {
      let next = null;
      for (const [id, x] of timers) if (x.at <= t && (!next || x.at < next[1].at)) next = [id, x];
      if (!next) break;
      const [id, x] = next;
      now = x.at;
      if (x.every) x.at += x.every; else timers.delete(id);
      try { if (typeof x.fn === 'function') x.fn(...x.args); } catch (e) { report(e); }
    }
    now = t;
    const due = rafs;
    rafs = new Map();
    for (const cb of due.values()) try { cb(t); } catch (e) { report(e); }
    if (document.documentElement) drive();
  };
  // small steps keep libraries with lag smoothing (GSAP) honest; the last step lands exactly on the target
  window.__advance = (ms) => { while (now + 16 < ms) tick(now + 16); tick(ms); };
};

async function launch() {
  try { return await chromium.launch(); }
  catch { return chromium.launch({ channel: 'chrome' }); }
}

async function openFrozen(browser, scale) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  await page.addInitScript(VIRTUAL_TIME);
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300); // let "fonts loaded → start" promise chains run; virtual time stays at 0
  const own = await page.evaluate(() => typeof window.seek === 'function');
  const seek = (ms) => page.evaluate(({ t, own }) => (own ? window.seek(t / 1000) : window.__advance(t)), { t: Math.round(ms * 1000) / 1000, own });
  await seek(0);
  return { ctx, page, seek, own, errors };
}

const fmt = (t) => `${Number(t.toFixed(3))}s`;

async function grid(browser, name, frames, cols) {
  const tmp = path.join(out, `.${name}.html`);
  const tiles = frames.map(([f, t]) => `<figure style="margin:0"><img src="${pathToFileURL(f).href}" style="width:480px;display:block"><figcaption>${fmt(t)}</figcaption></figure>`);
  fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;font:600 15px system-ui,sans-serif"><div style="display:grid;grid-template-columns:repeat(${cols},480px);gap:14px 12px;padding:14px">${tiles.join('')}</div></body>`);
  const ctx = await browser.newContext({ viewport: { width: cols * 492 + 16, height: 400 } });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
  fs.rmSync(tmp);
  return file;
}

const browser = await launch();
const made = [];
let errors = [];
let own = false;
try {
  if (!videoOnly) {
    // contact sheets: the frames sit at 480px wide, about the size the video plays at in a phone feed
    const s = await openFrozen(browser, 0.5);
    own = s.own;
    const dir = path.join(out, 'frames');
    fs.mkdirSync(dir, { recursive: true });
    const frames = [];
    for (let i = 0; i * EVERY <= DUR + 1e-9; i++) {
      const t = i * EVERY;
      await s.seek(t * 1000);
      const f = path.join(dir, `t${t.toFixed(2).padStart(5, '0')}.png`);
      await s.page.screenshot({ path: f });
      frames.push([f, t]);
    }
    for (let i = 0; i * 16 < frames.length; i++) made.push(await grid(browser, `sheet-${i + 1}`, frames.slice(i * 16, i * 16 + 16), 4));
    errors = s.errors;
    await s.ctx.close();
    if (!isUrl) snapshot(path.dirname(path.resolve(target)), path.join(out, 'src'));
    if (o.strip) {
      const st = await openFrozen(browser, 0.5);
      const T = Number(o.strip);
      const sf = [];
      for (let k = 0; k < 12; k++) {
        const t = T + k / 30;
        await st.seek(t * 1000);
        const f = path.join(dir, `strip-${t.toFixed(3)}.png`);
        await st.page.screenshot({ path: f });
        sf.push([f, t]);
      }
      made.push(await grid(browser, `strip-${T}s`, sf, 6));
      await st.ctx.close();
    }
  }
  if (o.mp4) {
    const file = path.resolve(o.mp4);
    const m = await openFrozen(browser, 1);
    own = m.own;
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '20M', '-bufsize', '40M', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const total = Math.round(DUR * FPS);
    for (let i = 0; i < total; i++) {
      await m.seek((i * 1000) / FPS);
      const png = await m.page.screenshot({ type: 'png' });
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    const code = await new Promise((r) => ff.on('close', r));
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    errors = errors.concat(m.errors);
    await m.ctx.close();
    made.push(file);
  }
} finally {
  await browser.close();
}

const metaFile = videoOnly && !o.out ? `${path.resolve(o.mp4)}.json` : path.join(out, 'meta.json');
fs.writeFileSync(metaFile, JSON.stringify({ target, time: new Date().toISOString(), dur: DUR, every: EVERY, fps: FPS, size: `${W}x${H}`, seek: own ? 'window.seek' : 'virtual time', made, errors }, null, 2));
console.log(`${out} (motion, ${own ? 'window.seek' : 'virtual time'})`);
for (const f of made) console.log(`  ${f}`);
console.log(errors.length ? `JS errors:\n${[...new Set(errors)].map((e) => `  - ${e}`).join('\n')}` : 'JS errors: none');
if (!videoOnly) console.log('Open every sheet above and watch it like a harsh motion director. Then critique against DESIGN.md.');
