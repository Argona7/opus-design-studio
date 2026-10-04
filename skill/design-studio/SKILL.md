---
name: design-studio
description: Design studio with eyes. Writes a DESIGN.md taste file from three real reference sites, builds the page, app screen, brand asset or HTML animation, then screenshots its own work at desktop and phone width (or freezes animation frames), critiques the screenshots against DESIGN.md and fixes them until they pass. Use for any visual work - landing pages, websites, dashboards, app UI, logos, banners, covers, social images, motion graphics.
argument-hint: "[setup | what to design]"
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/*) Read
---

# Design studio

You can't see what you built until you look at it. Every visual job runs one loop:
taste file → build → screenshot → look → critique → fix → screenshot again.

## Tools

Playwright powers the scripts. Check once with `node ${CLAUDE_SKILL_DIR}/scripts/shoot.mjs --check`;
if it fails, run `npm i -D playwright && npx playwright install chromium`.

- `node ${CLAUDE_SKILL_DIR}/scripts/shoot.mjs <page.html>`: desktop (1440) and phone (390) screens into
  `shots/iter-NN/`, a phone sheet, a copy of the source, and the warnings a glance misses
  (horizontal scroll, low contrast, fonts that did not load, broken images, JS errors).
- `shoot.mjs <logo.svg>`: the logo at 240 → 16 px on white, warm and dark.
- `shoot.mjs <cover.html> --size 1500x600`: exact-size 2x render plus how it reads in a phone feed.
- `shoot.mjs <https://site> --out refs/01-name`: reference screens of a real site.
- `node ${CLAUDE_SKILL_DIR}/scripts/frames.mjs <reel.html>`: contact sheets of an animation, one frame
  every 0.5 s. `--strip 4.2` adds 12 consecutive frames from 4.2 s; `--mp4 out.mp4` renders the video.
- Several assets in one round: give each its own `--out shots/iter-NN/<asset>`.
- `--hires` gives 2x PNG screens for the final hand-off.

## 1. Taste file (once per project)

If `DESIGN.md` is missing:
1. Ask for three sites the user likes. If there are none, pick three real, well-designed sites from the
   same field (a studio, a shop, a product), not design galleries.
2. Shoot each one and open every image. A site that fails to load (blank, parked, bot wall) is dropped
   after one try: pick another.
3. Copy `${CLAUDE_SKILL_DIR}/templates/DESIGN.md` to `./DESIGN.md` and fill it from what you saw:
   for each reference what to take (palette, type, spacing, layout moves) and what not to take
   (their words, logo, photos). Exact hex values, font names, sizes, a spacing scale, bans.
   References from one field often share the defaults in the ban list (cream, serif, clay, caps labels):
   take their structure and pacing, and leave those traits unless you choose one on purpose.

"Modern", "clean" and "sleek" are not taste. Values are.

## 2. Build

Follow DESIGN.md. Real content for this business or person: no lorem ipsum, no invented testimonials,
client logos or claims (sample data in an app screen is fine when it is realistic and adds up). Motion: one HTML page at the video size, driven by CSS animations, GSAP or
requestAnimationFrame (frames.mjs fakes the clock, so any moment can be frozen).

## 3. Eyes: the critique loop

1. Shoot (frames.mjs for motion). Open every image it lists: desktop screens first, then the phone sheet.
   Read the warnings.
2. Critique with `${CLAUDE_SKILL_DIR}/prompts/critique.md`. Save it as `shots/iter-NN/critique.md`.
3. PASS: stop. FAIL: fix with `${CLAUDE_SKILL_DIR}/prompts/fix.md`, then back to 1.
4. One line per round in `shots/LOG.md`: `iter-NN · scores · what it caught · what changed`.

Stop at PASS or after 6 rounds. Visual work is done only when a screenshot you opened says so,
never from the code alone.

## 4. Hand-off

The final screenshots (`--hires`), the number of rounds, `shots/LOG.md`, and anything left unfixed.

## Never without the user's yes

Publishing, deploying, posting or uploading anything, payments, deleting the user's files and messages to anyone
wait for the user's explicit yes. The work stays in this project on this machine.
