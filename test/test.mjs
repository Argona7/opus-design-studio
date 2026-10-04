// End-to-end tests for the studio kit: install into a scratch project, then drive every script
// against fixtures and check files, sizes, warnings, frame timing and the video container.
// Run from the kit folder: npm test   (needs node, ffmpeg/ffprobe; `claude` is optional)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(KIT, 'test', 'fixtures');
const PROJ = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
const SKILL = path.join(PROJ, '.claude', 'skills', 'design-studio');

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: PROJ, encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const shoot = (...a) => run('node', [path.join(SKILL, 'scripts', 'shoot.mjs'), ...a]);
const frames = (...a) => run('node', [path.join(SKILL, 'scripts', 'frames.mjs'), ...a]);
const size = (f) => {
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim().split(',').map(Number);
  return `${w}x${h}`;
};
const pixel = (f, x, y) => [...execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
const near = (got, want, tol = 40) => got.every((v, i) => Math.abs(v - want[i]) <= tol);
const meta = (dir) => JSON.parse(fs.readFileSync(path.join(PROJ, dir, 'meta.json'), 'utf8'));

let failed = 0;
const test = (name, fn) => {
  try { fn(); console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${String(e.message).split('\n').slice(0, 6).join('\n      ')}`); }
};

test('install.sh puts the skill and the CLAUDE.md rules into a project', () => {
  fs.symlinkSync(path.join(KIT, 'node_modules'), path.join(PROJ, 'node_modules'));
  run('bash', [path.join(KIT, 'install.sh'), PROJ, '--no-npm']);
  for (const f of ['SKILL.md', 'templates/DESIGN.md', 'templates/CLAUDE.md', 'prompts/critique.md', 'prompts/fix.md', 'scripts/shoot.mjs', 'scripts/frames.mjs']) {
    assert.ok(fs.existsSync(path.join(SKILL, f)), `missing ${f}`);
  }
  assert.match(fs.readFileSync(path.join(PROJ, 'CLAUDE.md'), 'utf8'), /Design rules \(design studio\)/);
  run('bash', [path.join(KIT, 'install.sh'), PROJ, '--no-npm']);
  assert.equal(fs.readFileSync(path.join(PROJ, 'CLAUDE.md'), 'utf8').match(/Design rules/g).length, 1, 'rules appended twice');
});

test('SKILL.md has the frontmatter Claude Code reads (name, description, allowed-tools)', () => {
  const head = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8').split('---')[1];
  assert.match(head, /^name: design-studio$/m);
  assert.match(head, /^description: .{80,}/m);
  assert.match(head, /^allowed-tools: .*\$\{CLAUDE_SKILL_DIR\}\/scripts/m);
  assert.ok(fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8').split('\n').length < 500, 'SKILL.md over 500 lines');
});

test('claude plugin validate --strict passes on the installed skill', () => {
  const which = spawnSync('which', ['claude'], { encoding: 'utf8' });
  if (which.status !== 0) { console.log('      (claude CLI not found, skipped)'); return; }
  const out = run('claude', ['plugin', 'validate', '--strict', path.join(PROJ, '.claude')]);
  assert.match(out, /Validation passed/);
});

test('a clean page: desktop and phone screens, phone sheet, source copy, no warnings', () => {
  const out = shoot(path.join(FIX, 'clean', 'index.html'));
  assert.match(out, /shots\/iter-01 \(page\)/);
  assert.match(out, /warnings: none/);
  assert.equal(size(path.join(PROJ, 'shots/iter-01/desktop-1.jpg')), '1440x900');
  assert.equal(size(path.join(PROJ, 'shots/iter-01/phone-1.jpg')), '780x1688');
  assert.ok(fs.existsSync(path.join(PROJ, 'shots/iter-01/phone-sheet.jpg')));
  assert.ok(fs.existsSync(path.join(PROJ, 'shots/iter-01/src/index.html')));
  assert.equal(meta('shots/iter-01').warnings.length, 0);
});

test('a broken page: every planted problem is reported', () => {
  const out = shoot(path.join(FIX, 'broken', 'index.html'));
  assert.match(out, /shots\/iter-02 \(page\)/, 'iteration folders should count up');
  const w = meta('shots/iter-02').warnings.join('\n');
  assert.match(w, /phone: horizontal scroll: page is \d+px wider than the screen \(div\.wide\)/);
  assert.match(w, /broken image\(s\): missing-photo\.jpg/);
  assert.match(w, /font "Nonexistent Grotesk" is not loaded/);
  assert.match(w, /low-contrast text element\(s\), e\.g\. 1\.\d:1 "This grey text is too faint/);
  assert.match(w, /smaller than 11px/);
  assert.doesNotMatch(w, /desktop: horizontal scroll/);
});

test('contrast is judged against what is painted under the text, not the page background', () => {
  shoot(path.join(FIX, 'layers', 'index.html'), '--out', 'shots/layers');
  const w = meta('shots/layers').warnings.join('\n');
  assert.match(w, /low-contrast text element\(s\), e\.g\. 1\.\d:1 "Dark navy text on the dark layer/);
  assert.doesNotMatch(w, /White on a dark layer/);
});

test('an app shell that scrolls inside a panel still gets every screen', () => {
  shoot(path.join(FIX, 'app', 'index.html'), '--out', 'shots/app');
  assert.ok(fs.existsSync(path.join(PROJ, 'shots/app/desktop-3.jpg')), 'expected 3+ desktop screens from the inner scroller');
});

test('--hires gives 2x desktop and 3x phone PNGs', () => {
  shoot(path.join(FIX, 'clean', 'index.html'), '--hires', '--out', 'shots/final');
  assert.equal(size(path.join(PROJ, 'shots/final/desktop-1.png')), '2880x1800');
  assert.equal(size(path.join(PROJ, 'shots/final/phone-1.png')), '1170x2532');
});

test('logo sheet, and the font/viewBox warnings for a text logo', () => {
  const bad = shoot(path.join(FIX, 'logo-text.svg'), '--out', 'shots/logo-bad');
  assert.match(bad, /no viewBox/);
  assert.match(bad, /uses <text>/);
  const good = shoot(path.join(FIX, 'logo-paths.svg'), '--out', 'shots/logo-good');
  assert.match(good, /warnings: none/);
  assert.equal(size(path.join(PROJ, 'shots/logo-good/logo-sheet.png')).split('x')[0], '3200');
});

test('exact-size asset: 2x render and the phone-feed preview', () => {
  shoot(path.join(FIX, 'banner.html'), '--size', '1500x500', '--out', 'shots/banner');
  assert.equal(size(path.join(PROJ, 'shots/banner/asset.png')), '3000x1000');
  assert.ok(fs.existsSync(path.join(PROJ, 'shots/banner/asset-feed.png')));
});

test('motion: sheets follow virtual time for CSS, late CSS and requestAnimationFrame', () => {
  const out = frames(path.join(FIX, 'motion', 'index.html'), '--dur', '4', '--every', '1', '--out', 'shots/motion');
  assert.match(out, /virtual time/);
  assert.ok(fs.existsSync(path.join(PROJ, 'shots/motion/sheet-1.png')));
  const f2 = path.join(PROJ, 'shots/motion/frames/t02.00.png'); // frames are 960x540 (half scale)
  assert.ok(near(pixel(f2, 450, 150), [255, 59, 48]), 'CSS box should be at 800px at 2s');
  assert.ok(near(pixel(f2, 450, 450), [10, 132, 255]), 'canvas box should be at 800px at 2s');
  const f3 = path.join(PROJ, 'shots/motion/frames/t03.00.png');
  assert.ok(near(pixel(f3, 450, 300), [52, 199, 89]), 'late CSS box (starts at 2s) should be halfway at 3s');
});

test('motion: the same moment renders the same pixels twice', () => {
  frames(path.join(FIX, 'motion', 'index.html'), '--dur', '4', '--every', '1', '--out', 'shots/motion2');
  const a = fs.readFileSync(path.join(PROJ, 'shots/motion/frames/t03.00.png'));
  const b = fs.readFileSync(path.join(PROJ, 'shots/motion2/frames/t03.00.png'));
  assert.ok(a.equals(b), 'frame at 3s differs between two renders');
});

test('motion: GSAP follows virtual time even across 1-second jumps (needs the CDN)', () => {
  const out = frames(path.join(FIX, 'gsap', 'index.html'), '--dur', '4', '--every', '1', '--out', 'shots/gsap');
  if (/gsap is not defined/.test(out)) { console.log('      (gsap CDN unreachable, skipped)'); return; }
  const f = path.join(PROJ, 'shots/gsap/frames/t02.00.png');
  assert.ok(near(pixel(f, 402, 270), [191, 90, 242]) && near(pixel(f, 498, 270), [191, 90, 242]), 'GSAP box should span 800-1000px at 2s');
  assert.ok(near(pixel(f, 396, 270), [16, 16, 16]) && near(pixel(f, 504, 270), [16, 16, 16]), 'GSAP box edges are off');
});

test('motion: a page with window.seek(t) is seeked directly, strip works', () => {
  const out = frames(path.join(FIX, 'seek', 'index.html'), '--dur', '4', '--every', '1', '--strip', '1', '--out', 'shots/seek');
  assert.match(out, /window\.seek/);
  assert.ok(near(pixel(path.join(PROJ, 'shots/seek/frames/t02.00.png'), 475, 270), [255, 214, 10]), 'seek box should be at 850px at 2s');
  assert.ok(fs.existsSync(path.join(PROJ, 'shots/seek/strip-1s.png')));
});

test('motion: --mp4 renders 1920x1080, 30 fps, h264 + aac, exact duration', () => {
  const file = path.join(PROJ, 'reel.mp4');
  frames(path.join(FIX, 'motion', 'index.html'), '--dur', '2', '--mp4', file);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  const p = JSON.parse(probe);
  const v = p.streams.find((s) => s.codec_name === 'h264');
  assert.ok(v, 'no h264 stream');
  assert.equal(`${v.width}x${v.height}`, '1920x1080');
  assert.equal(v.r_frame_rate, '30/1');
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.ok(p.streams.some((s) => s.codec_name === 'aac'), 'no aac stream');
  assert.ok(Math.abs(Number(p.format.duration) - 2) < 0.05, `duration ${p.format.duration}`);
});

console.log(failed ? `\n${failed} test(s) failed (scratch project: ${PROJ})` : `\nall tests passed (scratch project: ${PROJ})`);
process.exit(failed ? 1 : 0);
