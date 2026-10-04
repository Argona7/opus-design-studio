# DESIGN.md: <project>

The taste file. Read it before any visual work; every critique scores against it.
Change it on purpose, never by drift.

## Job

- What: <a landing page for ... / the main screen of ... / a logo, banner and cover for ... / a 15 s reel>
- For: <who, on which device>
- The one thing it must make them do or feel: <...>

## References (screens in refs/)

| # | Site | Take | Don't take |
|---|------|------|------------|
| 1 | <url> | <e.g. huge serif headline, lots of air, one warm accent> | <their photos, copy, logo> |
| 2 | <url> | <...> | <...> |
| 3 | <url> | <...> | <...> |

## Palette

| Role | Hex | Use |
|------|-----|-----|
| background | #...... | page |
| surface | #...... | cards, panels |
| ink | #...... | body text, 4.5:1 or more on background |
| muted | #...... | secondary text, still 4.5:1 or more |
| line | #...... | borders, dividers |
| accent | #...... | ONE accent: the main button, key numbers, links |

No other colours. No gradients unless they are listed here.

## Type

- Display: <family, weights>; sizes <e.g. 72 / 48 / 32>; tracking <e.g. -0.02em>
- Body: <family>; 16-18 px; line-height 1.5; 60-75 characters per line
- Labels and numbers: <family, size, case, tabular figures?>
- Two families at most. Load them and check that the shoot warnings say nothing about fonts.

## Space and layout

- Scale: 4 8 12 16 24 32 48 64 96 128 px. Nothing off the scale.
- Grid: <12 columns, max width 1200 px, 24 px gutters>; phone: <20 px side margins, one column>
- Radius: <one value>. Shadows: <none / one, named>. Borders: <1 px, line colour>.
- Alignment: <left-aligned text, asymmetric hero allowed, ...>

## Imagery and icons

- <real photos supplied / one illustration style / no stock people / one icon set, 1.5 px stroke>

## Motion

- UI: <what moves, 150-300 ms, which easing>. Nothing fades in on scroll unless it earns it.
- Video (reels only): <duration, size, a beat list with seconds, easing, a new idea every 1.5-3 s,
  the end card>

## Bans: the cheap look

Where AI design clusters right now (Anthropic's own frontend-design skill lists the first five). Each is fine when
the brief asks for it, so a default may appear only if this file chooses it on purpose and says why. Every other
appearance is a ban hit.

1. warm cream page (near #F4F1EA) + high-contrast serif display + terracotta or clay accent (near #D97757)
2. near-black page with one bright acid-green or vermilion accent
3. broadsheet look: hairline rules, zero radius, dense newspaper columns
4. SaaS-card kit: content chopped into identical rounded cards, one soft grey shadow, gradient washes
5. template chrome: a tracked ALL-CAPS eyebrow over every heading, meta joined with middle dots, monospace for
   small labels, "→" after link and button text
6. one word of the headline set in italic or in the accent colour; numbered 01 / 02 / 03 markers on content that
   is not a sequence; fade-and-slide-up on every section; hover lift on every card
7. the older slop: purple-to-blue gradients, gradient text, glowing blobs, Inter on white, a centred hero of
   headline + subline + two buttons, three identical feature cards with emoji, glassmorphism
8. copy like "Elevate", "Unlock", "Seamless", "Revolutionize", "Your journey"; fake logos, testimonials, numbers
9. video: labels, timecodes and frames parked in the corners; a HUD that says nothing
10. <bans for this project>

Chosen on purpose (if any): <default number, where, why this brief needs it>

## Pass bar

Every critique score 8/10 or more, zero ban hits, no shoot warnings left except the ones accepted here:
- <accepted warning, and why>
