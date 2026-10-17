# Baton

**Play it: https://baton.pepo.dev/**

A daily conducting game. One new score a day, three takes, and you set the tempo.

Tap once per beat and the band plays exactly when you tap. The score asks for a tempo that rises and falls over 32 beats, drawn as a dashed line inside a shaded band. A beat counts as "on the score" when your tempo is inside the band; 75% or more passes the day and keeps your streak going.

Everyone gets the same score on the same date. The tempo curve, the band style (pop, music box, blues shuffle, lullaby, chiptune, folk, tango, march, pizzicato, orchestra) and the tune itself are all generated from the date, so there is nothing to download and no song library to maintain. Sound is synthesized with the Web Audio API.

## Play

- Tap the big pad, or press **Space**, once per beat.
- Your best of three takes counts. A take starts counting on your second tap, and leaving in the middle uses it up.
- **Copy result** gives you a Wordle-style grid to share: green for on the score, red for rushing, blue for dragging.
- Your record (days played, pass rate, streak, which take you passed on) is kept in the browser's local storage.

The band is wider early in the week and narrower toward the weekend, and sudden tempo jumps only appear from Wednesday on.

## Develop

```sh
npm install
npm run dev      # local server with hot reload
npm test         # unit tests (Vitest)
npm run build    # type-check, then build dist/index.html
npm run check    # build, then play a whole day in headless Chromium
```

Every push to `main` that passes CI is deployed to GitHub Pages by `.github/workflows/ci.yml`.

The build is **one self-contained HTML file** (`dist/index.html`, about 27 KB), so it deploys anywhere that serves static files: GitHub Pages, a CDN, a claude.ai artifact, or just opening the file. The only runtime dependency is Google Fonts.

`npm run check` needs a Chromium that matches the installed Playwright (`npx playwright install chromium`). Set `PLAYWRIGHT_CHROMIUM=/path/to/chromium` to use one you already have.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The page: markup and the font link; Vite's entry |
| `src/generator.ts` | `makeDay(n)`: the tempo curve, band style and tune for day `n`. Pure, no DOM |
| `src/audio.ts` | The synthesized band: instruments, drum patterns, `playBeat` and `playEnding` |
| `src/state.ts` | The player's record: localStorage, plus the account mirror on claude.ai |
| `src/game.ts` | The rules of a day: takes, scoring, streaks, what each tap does |
| `src/ui.ts` | Rendering: the staff, the take board, the record, controls |
| `src/main.ts` | Wires events, the clock and the account sync |
| `src/style.css` | Styles, light and dark |
| `public/demos/index.html` | Six playable sketches of rhythm-game ideas that Baton grew out of; served at `/demos/` |
| `tests/unit/` | Vitest: the generator and the saved-state repair |
| `tests/e2e/play-through.js` | Playwright: a whole day played against the built file |

## The one rule

`makeDay(n)` must keep returning the same score for the same `n`, forever. Players' histories, streaks and shared results all depend on it. `tests/unit/generator.test.ts` holds a SHA-256 fingerprint of days 1–730 and fails the moment any of them changes. If you change the generator on purpose, make the change apply only to day numbers nobody has played yet, and update the fingerprint deliberately.

## How a day is generated

`makeDay(n)` seeds a small PRNG (mulberry32) with the day number and draws, in order: the section lengths, the tempo curve (holds, ramps and, later in the week, jumps, all kept between 60 and 138 BPM), the band style, a key, a chord progression and two bars of melody. Day 1 is 10 October 2026.
