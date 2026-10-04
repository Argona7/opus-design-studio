## Design rules (design studio)

- Visual work starts from DESIGN.md. No DESIGN.md yet: run /design-studio setup first.
- You can't see your own UI until you screenshot it. Never call visual work done before you shoot it
  and open the images: `node .claude/skills/design-studio/scripts/shoot.mjs <file>`.
- Every visual change runs the loop: shoot → critique against DESIGN.md → fix → shoot. Stop at PASS or
  after 6 rounds. Keep every round in shots/iter-NN/ and one line per round in shots/LOG.md.
- Only the colours, fonts and spacing in DESIGN.md. Need a new one? Add it to DESIGN.md first.
- References in refs/ are for taste: never copy their words, logos or photos.
- Real content only: no lorem ipsum, fake testimonials, fake client logos or invented claims. Sample data
  in an app screen is fine when it is realistic and adds up.
- Never publish, deploy, post or upload anything, pay for anything, delete files or message anyone without
  the user's explicit yes.
