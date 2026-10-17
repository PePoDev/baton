/**
 * Everything about a day's score comes from its day number alone, so every
 * player gets the same score on the same date. This module is pure: no DOM,
 * no audio, no clock. Keep it that way, and never change what makeDay
 * returns for an existing day number: players' histories depend on it.
 * tests/unit/generator.test.ts holds a fingerprint of days 1-730 and fails
 * the moment any of them changes.
 */

/** Beats in a score. */
export const N = 32;
/** Day 1 of the game: 10 October 2026, a Saturday (month is 0-based). */
export const EPOCH: readonly [number, number, number] = [2026, 9, 10];

/** [beats, from BPM, to BPM]. from === to is a hold. */
export type Seg = [number, number, number];
/** [semitones above the tonic, 1 for major / 0 for minor]. */
export type Chord = [number, 0 | 1];
export type DrumName =
  | 'pop' | 'tick' | 'shuffle' | 'none' | 'chip'
  | 'folk' | 'tango' | 'march' | 'pizz' | 'epic';
export type BassPattern = 'root' | 'oct' | 'walk' | 'alt' | 'hab' | 'drone';

export interface Style {
  style: string;
  key: number;
  minor: 0 | 1;
  /** Chance that an off-beat melody slot is a rest. */
  rest: number;
  /** Melody slots per beat (2 by default, 4 for arpeggiated styles). */
  sub?: number;
  /** Where in the beat the off-beat falls (0.5 straight, more for swing). */
  swing?: number;
  /** A fixed progression; when absent one is drawn from MAJ or MIN. */
  ch?: Chord[];
  lead: { type: OscillatorType; v: number; len: number; oct?: number; bell?: boolean };
  bass: { pat: BassPattern; type: OscillatorType; v: number; short?: boolean };
  pad?: { type: OscillatorType; v: number };
  drum: DrumName;
}

export interface Song extends Style {
  ch: Chord[];
  /** Bars of chord-tone indexes, -1 for a rest, `sub` slots per beat. */
  mel: number[][];
}

export interface Day {
  n: number;
  /** 0 = Sunday … 6 = Saturday. */
  dow: number;
  /** Allowed tempo error, as a fraction. */
  tol: number;
  segs: Seg[];
  /** Target BPM per beat, 1-based (T[0] is unused). */
  T: number[];
  song: Song;
}

/** mulberry32: small, fast, and good enough for a game. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Band styles: timbre, bass pattern and drums. Chords and melody are drawn fresh each day. */
export const STYLES: readonly Style[] = [
  { style: 'sunny pop', key: 60, minor: 0, rest: 0.12, lead: { type: 'triangle', v: 0.2, len: 0.9 }, bass: { pat: 'root', type: 'sine', v: 0.3 }, drum: 'pop' },
  { style: 'a music box', key: 62, minor: 0, rest: 0.3, lead: { type: 'sine', v: 0.2, len: 2.6, oct: 12, bell: true }, bass: { pat: 'root', type: 'triangle', v: 0.14 }, drum: 'tick' },
  { style: 'a blues shuffle', key: 64, minor: 1, rest: 0.35, swing: 0.66, ch: [[0, 0], [0, 0], [5, 0], [0, 0], [7, 1], [5, 0], [0, 0], [7, 1]], lead: { type: 'sawtooth', v: 0.11, len: 0.7 }, bass: { pat: 'walk', type: 'triangle', v: 0.3 }, drum: 'shuffle' },
  { style: 'a lullaby', key: 65, minor: 0, rest: 0.75, lead: { type: 'sine', v: 0.24, len: 1.8, oct: 12 }, bass: { pat: 'root', type: 'sine', v: 0.22 }, pad: { type: 'sine', v: 0.07 }, drum: 'none' },
  { style: 'a chiptune', key: 57, minor: 1, sub: 4, rest: 0, lead: { type: 'square', v: 0.08, len: 0.8, oct: 12 }, bass: { pat: 'oct', type: 'square', v: 0.11 }, drum: 'chip' },
  { style: 'a sea folk tune', key: 62, minor: 1, rest: 0.12, swing: 0.6, lead: { type: 'triangle', v: 0.2, len: 0.9, oct: 12 }, bass: { pat: 'drone', type: 'sine', v: 0.18 }, drum: 'folk' },
  { style: 'a tango', key: 55, minor: 1, rest: 0.5, lead: { type: 'sawtooth', v: 0.11, len: 0.5, oct: 12 }, bass: { pat: 'hab', type: 'triangle', v: 0.28 }, drum: 'tango' },
  { style: 'a march', key: 58, minor: 0, rest: 0.25, lead: { type: 'sawtooth', v: 0.12, len: 0.8, oct: 12 }, bass: { pat: 'alt', type: 'triangle', v: 0.28 }, drum: 'march' },
  { style: 'pizzicato strings', key: 64, minor: 1, rest: 0.5, lead: { type: 'triangle', v: 0.24, len: 0.35, oct: 12 }, bass: { pat: 'root', type: 'sine', v: 0.2, short: true }, drum: 'pizz' },
  { style: 'a big orchestra', key: 60, minor: 1, rest: 0.25, lead: { type: 'sawtooth', v: 0.12, len: 0.9, oct: 12 }, bass: { pat: 'oct', type: 'sawtooth', v: 0.14 }, pad: { type: 'sawtooth', v: 0.035 }, drum: 'epic' },
];

const MAJ: readonly Chord[][] = [
  [[0, 1], [9, 0], [5, 1], [7, 1]],
  [[0, 1], [7, 1], [9, 0], [5, 1]],
  [[0, 1], [5, 1], [0, 1], [7, 1]],
  [[0, 1], [4, 0], [5, 1], [7, 1]],
];
const MIN: readonly Chord[][] = [
  [[0, 0], [8, 1], [3, 1], [10, 1]],
  [[0, 0], [5, 0], [7, 1], [0, 0]],
  [[0, 0], [10, 1], [8, 1], [7, 1]],
  [[0, 0], [3, 1], [10, 1], [5, 0]],
];
/** Ways to cut 32 beats into four sections. */
const PARTS: readonly number[][] = [
  [8, 8, 8, 8], [4, 12, 8, 8], [8, 6, 6, 12], [6, 10, 8, 8], [8, 4, 8, 12],
  [12, 8, 4, 8], [10, 6, 8, 8], [8, 8, 4, 12], [6, 6, 8, 12], [4, 8, 12, 8],
];

const BPM_MIN = 60;
const BPM_MAX = 138;

export function makeDay(n: number): Day {
  const R = rng((Math.imul(n, 2654435761) ^ 0x9e3779b9) >>> 0);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(R() * a.length)];
  const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));

  // Monday and Tuesday are the easiest days (no jumps), Friday to Sunday the hardest.
  const dow = (6 + n - 1) % 7;
  const hard = [2, 0, 0, 1, 1, 2, 2][dow];
  const tol = [0.11, 0.1, 0.09][hard];

  // The tempo curve: a hold, then ramps, holds and (later in the week) jumps.
  const lens = pick(PARTS);
  let cur = ri(38, 58) * 2;
  let last: 'hold' | 'ramp' | 'jump' = 'hold';
  let ramps = 0;
  const segs: Seg[] = [[lens[0], cur, cur]];
  const turn = (d: number) => {
    const up = cur + d <= BPM_MAX, down = cur - d >= BPM_MIN;
    if (up && down) return R() < 0.5 ? d : -d;
    if (up) return d;
    if (down) return -d;
    return BPM_MAX - cur > cur - BPM_MIN ? BPM_MAX - cur : -(cur - BPM_MIN);
  };
  for (let i = 1; i < lens.length; i++) {
    const len = lens[i];
    const opts: Array<'hold' | 'ramp' | 'jump'> = ['ramp', 'ramp', 'ramp'];
    if (last !== 'hold') opts.push('hold');
    if (last !== 'jump') for (let h = 0; h < hard; h++) opts.push('jump');
    let type = pick(opts);
    if (i === lens.length - 1 && !ramps) type = 'ramp';
    if (type === 'ramp') {
      const d = turn(Math.min(ri(9, 22) * 2, Math.floor((6.5 * len) / 2) * 2));
      segs.push([len, cur, cur + d]);
      cur += d;
      ramps++;
    } else if (type === 'jump') {
      cur += turn(ri(10, 18) * 2);
      segs.push([len, cur, cur]);
    } else {
      segs.push([len, cur, cur]);
    }
    last = type;
  }
  const T = [0];
  segs.forEach(([len, a, b]) => {
    for (let i = 1; i <= len; i++) T.push(a + (i / len) * (b - a));
  });

  // The band: a style, a key, a progression and two bars of melody.
  const st = pick(STYLES);
  const key = st.key + ri(-2, 3);
  const ch = st.ch || pick(st.minor ? MIN : MAJ);
  const bar = (end: boolean) => {
    let i = ri(0, 3);
    const o: number[] = [];
    for (let s = 0; s < 8; s++) {
      const rest = s > 0 && ((end && s >= 6) || R() < (s % 2 ? st.rest : st.rest * 0.35));
      o.push(rest ? -1 : i);
      if (!rest) i = Math.max(0, Math.min(5, i + pick([-2, -1, -1, 0, 1, 1, 2])));
    }
    return o;
  };
  const arp = () => {
    const o: number[] = [];
    for (let b = 0; b < 4; b++) {
      const base = ri(0, 2);
      pick([[0, 2, 3, 2], [0, 1, 2, 1], [2, 1, 0, 1], [0, 2, 1, 3]]).forEach((x) => o.push(Math.min(5, base + x)));
    }
    return o;
  };
  const mel = st.sub === 4 ? [arp(), arp()] : [bar(false), bar(true)];

  return { n, dow, tol, segs, T, song: { ...st, key, ch, mel } };
}

/** The day number for a calendar date (local time), 1 on the epoch day. */
export function dayNumber(date: Date): number {
  const a = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const b = Date.UTC(EPOCH[0], EPOCH[1], EPOCH[2]);
  return Math.max(1, Math.round((a - b) / 864e5) + 1);
}

/** The Italian tempo marking printed next to the opening BPM. */
export const marking = (bpm: number): string =>
  bpm < 66 ? 'Larghetto' : bpm < 76 ? 'Adagio' : bpm < 108 ? 'Andante' : bpm < 120 ? 'Moderato' : 'Allegro';
