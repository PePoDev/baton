# Baton

A daily conducting game. One new score a day, three takes, and you set the tempo.

Tap once per beat and the band plays exactly when you tap. The score asks for a tempo that rises and falls over 32 beats, drawn as a dashed line inside a shaded band. A beat counts as "on the score" when your tempo is inside the band; 75% or more passes the day and keeps your streak going.

Everyone gets the same score on the same date. The tempo curve, the band style (pop, music box, blues shuffle, lullaby, chiptune, folk, tango, march, pizzicato, orchestra) and the tune itself are all generated from the date, so there is nothing to download and no song library to maintain.

## Play

Open `index.html` in a browser. It is a single self-contained file: no build step, no dependencies beyond Google Fonts. Sound is synthesized with the Web Audio API, so turn your volume on.

- Tap the big pad, or press **Space**, once per beat.
- Your best of three takes counts. A take starts counting on your second tap, and leaving in the middle uses it up.
- **Copy result** gives you a Wordle-style grid to share: green for on the score, red for rushing, blue for dragging.
- Your record (days played, pass rate, streak, which take you passed on) is kept in the browser's local storage.

The band is wider early in the week and narrower toward the weekend, and sudden tempo jumps only appear from Wednesday on.

## Files

| Path | What it is |
|---|---|
| `index.html` | The daily game |
| `demos/index.html` | Six playable sketches of rhythm-game ideas that Baton grew out of |
| `tests/check-daily.js` | Headless Playwright check: validates two years of generated scores, then plays through a full day |

## Running the check

```sh
npm install playwright
node tests/check-daily.js
```

It sweeps days 1–730 for valid tempo curves and melodies, then opens the page in headless Chromium and plays a passing take, an abandoned take, a failing take and a practice take.

## How a day is generated

`makeDay(n)` in `index.html` seeds a small PRNG with the day number and draws, in order: the section lengths, the tempo curve (holds, ramps and, later in the week, jumps, all kept between 60 and 138 BPM), the band style, a key, a chord progression and two bars of melody. Day 1 is 10 October 2026.

## Note on the claude.ai version

The page was first published as a claude.ai artifact, where it also syncs the player's record to their account so it follows them across devices. That code is guarded and does nothing when the page is served anywhere else.
