# opus-design-studio: give Claude eyes for design

Claude can't see what it built until you show it. This kit closes that gap. It writes a taste file from three
sites you like, builds the thing, screenshots its own work at desktop and phone width (or freezes animation
frames), critiques the screenshots against the taste file and fixes them until they pass.

It works for landing pages and websites, dashboards and app screens, logos, banners and covers, and HTML motion
graphics. It is a Claude Code skill (`SKILL.md` plus supporting files) and two small Playwright scripts.

## Install: one message to Claude Code

Open Claude Code in your project folder and paste:

```text
Install the design studio: run `mkdir -p /tmp/design-studio && curl -L https://github.com/Argona7/opus-design-studio/archive/refs/heads/main.tar.gz | tar xz -C /tmp/design-studio --strip-components 1 && bash /tmp/design-studio/install.sh .`,
then run /design-studio setup and ask me for three websites whose look I like.
```

You need Node.js 20 or newer ([nodejs.org](https://nodejs.org)); `install.sh` stops and says so when it is
missing. `curl` and `tar` ship with macOS. By default Claude Code asks before it runs each command.

`install.sh` does four things, so you can also do them by hand:

1. copies `skill/design-studio/` to `.claude/skills/design-studio/` (a project skill, called as `/design-studio`;
   running it again replaces that folder with a fresh copy, your `DESIGN.md` and shots stay);
2. appends the design rules from `skill/design-studio/templates/CLAUDE.md` to your `CLAUDE.md`, once;
3. runs `npm i -D playwright && npx playwright install chromium` (skip it with `--no-npm`);
4. checks that the headless browser starts: `node .claude/skills/design-studio/scripts/shoot.mjs --check`.

To remove the studio, delete `.claude/skills/design-studio/` and the "Design rules (design studio)" block in
`CLAUDE.md`. To have it in every project, copy the skill folder to `~/.claude/skills/design-studio/` and install
Playwright inside that copy once.

## Use

```text
/design-studio setup                                  # DESIGN.md from three reference sites
/design-studio a landing page for a coffee roaster in Lisbon
/design-studio the main screen of a habit tracker
/design-studio logo, 1500x500 banner and 1500x600 cover for my newsletter
/design-studio a 15-second showreel, 1920x1080
```

Claude also loads the skill on its own when you ask for visual work. Every job runs one loop:

```text
DESIGN.md → build → shoot → open every image → critique against DESIGN.md → fix → shoot again
            (stop at PASS or after 6 rounds; each round in shots/iter-NN/, one line per round in shots/LOG.md)
```

## What's inside

```text
install.sh                          the one-shot installer
skill/design-studio/                → copied to .claude/skills/design-studio/
├── SKILL.md                        the workflow Claude follows
├── templates/DESIGN.md             the taste file: references, palette, type, spacing, motion, bans, pass bar
├── templates/CLAUDE.md             rules for your project's CLAUDE.md
├── prompts/critique.md             look first, count the defaults, score 7 axes, worst 3-5 problems, PASS/FAIL
├── prompts/fix.md                  fix only what the critique named, then shoot again
└── scripts/
    ├── shoot.mjs                   the eyes for pages, logos, banners, covers and reference sites
    └── frames.mjs                  the eyes for motion: contact sheets, frame strips, the final MP4
test/                               end-to-end tests and fixtures (npm test)
```

`shoot.mjs` saves desktop (1440 px) and phone (390 px) screens into `shots/iter-NN/` and prints what a quick look
misses: sideways scroll on the phone, low-contrast text, fonts that did not load, broken images, JS errors, text
under 11 px. `frames.mjs` runs an HTML animation on its own clock, so every frame lands exactly on its timestamp,
and renders the MP4 with ffmpeg. Both print absolute file paths, and Claude Code opens an image when it gets the
path ([Common workflows](https://code.claude.com/docs/en/common-workflows)).

## What it never does

- It never publishes, deploys, posts or uploads anything, pays for anything, deletes your files or messages anyone
  without your yes. The skill and the `CLAUDE.md` rules it installs say so, and the scripts only open pages and
  write screenshots.
- It works only on your machine. The scripts run a local headless browser and save into your project folder; the
  kit uploads nothing and needs no account or key of its own.

## Limits

- The critic is the same model that built the thing. A fresh subagent that sees only the screenshots and
  `DESIGN.md` is a stronger second opinion for big jobs.
- The warnings are heuristics: text on images and gradients is left to the eyes.
- References are for taste: the rules tell Claude never to copy their words, logos or photos.
- The MP4 has a silent audio track, and `--mp4` needs ffmpeg.

## Test

```bash
npm install
npm test     # installs into a scratch project and drives every script against fixtures (needs ffmpeg and ffprobe)
```

MIT license.
