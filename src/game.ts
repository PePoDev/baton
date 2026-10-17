/**
 * The rules of a day: takes, scoring, the streak, and what the band plays
 * on each tap. Rendering is delegated to ui.ts, persistence to state.ts.
 */
import { N, makeDay, dayNumber, marking, type Day } from './generator';
import { ensureAudio, audioNow, playBeat, playEnding } from './audio';
import { PASS, TAKES, load, save, adopt, connectCloud, type SavedState, type DayRecord } from './state';
import * as ui from './ui';
import type { Mark, Phase, Point } from './ui';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

let state: SavedState = load();
let D: Day = makeDay(1);
let phase: Phase = 'ready';
let practice = false;
let k = 0;
let last = 0;
let marks: Mark[] = [];
let pts: Point[] = [];

const day = (): DayRecord => {
  if (!state.day) throw new Error('no day');
  return state.day;
};
const left = () => TAKES - day().started;

function shownStreak(): number {
  const s = state.stats;
  return s.lastWin === D.n || s.lastWin === D.n - 1 ? s.streak : 0;
}

function bestTake(): number {
  let bi = -1;
  day().takes.forEach((t, i) => {
    const best = bi < 0 ? null : day().takes[bi];
    if (t && (!best || t.p > best.p)) bi = i;
  });
  return bi;
}

function view() {
  return { phase, practice, left: left(), started: day().started, begun: marks.length > 0 };
}
function refreshControls(): void {
  ui.renderControls(view());
  ui.renderStatus({ ...view(), k, nextBpm: Math.round(D.T[clamp(k, 1, N)]) });
}
function refreshBoard(): void {
  const liveIdx = phase === 'playing' && !practice && marks.length ? day().started - 1 : -1;
  ui.renderBoard(day(), liveIdx, marks);
}
function refreshAll(): void {
  refreshBoard();
  ui.renderResult(day(), bestTake(), left());
  ui.renderRecord(state.stats, shownStreak(), day().won);
  refreshControls();
}

function resetTake(): void {
  k = 0; last = 0; marks = []; pts = [];
  ui.drawTrace(pts);
}

/** Load today's score, creating today's record if this is the first visit. */
export function enterDay(): void {
  const n = dayNumber(new Date());
  D = makeDay(n);
  if (!state.day || state.day.n !== n) state.day = { n, takes: [], started: 0, counted: false, won: 0, best: -1 };
  while (state.day.takes.length < state.day.started) state.day.takes.push(null);
  practice = false;
  phase = left() > 0 ? 'ready' : 'done';
  const b0 = Math.round(D.T[1]);
  ui.renderHeader(D, b0, marking(b0));
  ui.drawStaff(D);
  resetTake();
  refreshAll();
  ui.$('#shareBox').hidden = true;
  const done = state.day.takes.filter(Boolean).length;
  ui.say(
    phase === 'done'
      ? (state.day.won
        ? 'You passed today. A new score arrives at midnight. You can still practice this one.'
        : 'No takes left today. A new score arrives at midnight. You can still practice this one.')
      : done
        ? `Take ${state.day.started + 1} is ready. Your best so far is ${state.day.best}%.`
        : `Today starts at ${b0} BPM. Give the first beat when you are ready, and the band follows you.`,
  );
}

function finishTake(): void {
  const pct = Math.round((marks.filter((m) => m === 'g').length / N) * 100);
  const fast = marks.filter((m) => m === 'r').length, slow = marks.filter((m) => m === 'b').length;
  const tip = fast + slow === 0 ? '' : fast > slow ? ' Most of your misses were rushing.' : ' Most of your misses were dragging.';
  phase = 'done';
  if (practice) {
    ui.say(`Practice take: ${pct}%. It does not count.` + tip);
    refreshControls();
    return;
  }
  const d = day(), s = state.stats, idx = d.started - 1;
  d.takes[idx] = { p: pct, m: marks.join('') };
  if (!d.counted) { d.counted = true; s.played++; }
  if (pct > d.best) d.best = pct;
  let first = false;
  if (pct >= PASS && !d.won) {
    d.won = idx + 1; first = true;
    s.wins++; s.dist[idx]++;
    s.streak = s.lastWin === d.n - 1 ? s.streak + 1 : 1;
    s.lastWin = d.n;
    s.max = Math.max(s.max, s.streak);
  }
  save(state);
  refreshAll();
  ui.say(
    `Final chord. ${pct}% on the score. ` +
    (first
      ? `Passed on take ${idx + 1}.` + (left() > 0 ? ' You can use another take to raise your best.' : '')
      : pct >= PASS
        ? 'Another passing take.'
        : left() > 0
          ? `You need ${PASS}% to pass.` + tip
          : `You needed ${PASS}% to pass.` + tip + ' A new score arrives at midnight.'),
  );
}

/** One tap of the baton. */
export function tap(): void {
  if (phase === 'done' || (!practice && left() <= 0 && phase === 'ready')) return;
  ensureAudio();
  ui.flashPad();
  const now = performance.now() / 1000, t = audioNow() + 0.01, j = k;
  let est = 60 / D.T[Math.min(N, j + 1)];
  if (j === 0) {
    phase = 'playing';
    ui.say(`Your next tap sets the tempo. The score asks for ${Math.round(D.T[1])} BPM.`);
  } else {
    if (j === 1 && !practice) { day().started++; save(state); }
    const iv = now - last, bpm = 60 / iv, want = D.T[j], dv = (bpm - want) / want;
    const m: Mark = Math.abs(dv) <= D.tol ? 'g' : dv > 0 ? 'r' : 'b';
    marks.push(m);
    pts.push({ k: j, bpm, m });
    est = clamp(iv, 0.25, 1.2);
    ui.drawTrace(pts);
    if (!practice) refreshBoard();
    const b = Math.round(bpm), a = Math.round(want);
    ui.say(m === 'g' ? `On the score: ${b} BPM, asked for ${a}.` : m === 'r' ? `Rushing: ${b} BPM, the score asks for ${a}.` : `Dragging: ${b} BPM, the score asks for ${a}.`);
  }
  last = now;
  if (j === N) { playEnding(D.song, t); finishTake(); return; }
  playBeat(D.song, j, t, est);
  k++;
  refreshControls();
}

export function startNextTake(): void {
  phase = 'ready';
  resetTake();
  refreshBoard();
  refreshControls();
  ui.say(`Take ${day().started + 1}. Give the first beat when you are ready.`);
}

export function startPractice(): void {
  practice = true;
  phase = 'ready';
  resetTake();
  refreshControls();
  ui.say('Practice take. It does not count toward your record.');
}

/** The Wordle-style result: one line of text and four rows of squares. */
export function shareText(): string {
  const bi = bestTake();
  if (bi < 0) return '';
  const t = day().takes[bi];
  if (!t) return '';
  const E: Record<string, string> = { g: '\u{1F7E9}', r: '\u{1F7E5}', b: '\u{1F7E6}' };
  const rows: string[] = [];
  for (let i = 0; i < N; i += 8) rows.push([...t.m.slice(i, i + 8)].map((c) => E[c] || '⬜').join(''));
  const s = shownStreak();
  return `Baton Op. ${D.n} · ${t.p}% · take ${bi + 1} of ${TAKES}` + (s > 1 ? ` · streak ${s}` : '') + '\n' + rows.join('\n');
}

/** Once a second: the countdown, and the switch to a new day at midnight. */
export function tick(): void {
  ui.renderCountdown();
  if (dayNumber(new Date()) !== D.n && phase !== 'playing') enterDay();
}

/** Mirror the record to the player's account where that is available. */
export async function syncAccount(): Promise<void> {
  const remote = await connectCloud(state);
  if (remote && phase !== 'playing') {
    state = remote;
    adopt(state);
    enterDay();
  }
}
