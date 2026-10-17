/**
 * The band. Everything is synthesized with the Web Audio API: there are no
 * samples. `ensureAudio()` must be called from a user gesture before anything
 * plays, because browsers keep audio muted until then.
 */
import type { Song, DrumName } from './generator';

let AC: AudioContext | null = null;
let OUT: DynamicsCompressorNode | null = null;
let NOISE: AudioBuffer | null = null;

export function ensureAudio(): AudioContext {
  if (!AC) {
    AC = new AudioContext();
    OUT = AC.createDynamicsCompressor();
    const g = AC.createGain();
    g.gain.value = 0.9;
    OUT.connect(g);
    g.connect(AC.destination);
    NOISE = AC.createBuffer(1, Math.floor(AC.sampleRate * 0.6), AC.sampleRate);
    const d = NOISE.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (AC.state !== 'running') void AC.resume();
  return AC;
}

/** The audio clock, in seconds. Only valid after ensureAudio(). */
export const audioNow = (): number => (AC ? AC.currentTime : 0);

function ctx(): { ac: AudioContext; out: DynamicsCompressorNode; noise: AudioBuffer } {
  if (!AC || !OUT || !NOISE) throw new Error('ensureAudio() first');
  return { ac: AC, out: OUT, noise: NOISE };
}

function shape(g: GainNode, t: number, peak: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

export function tone(f: number, t: number, dur = 0.18, v = 0.25, type: OscillatorType = 'triangle'): void {
  const { ac, out } = ctx();
  t = Math.max(t, ac.currentTime);
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  shape(g, t, v, dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function kick(t: number, v = 1): void {
  const { ac, out } = ctx();
  t = Math.max(t, ac.currentTime);
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
  shape(g, t, 0.9 * v, 0.24);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.3);
}

/** A burst of filtered noise: snares, hats, clicks and the final-chord shimmer. */
export function noise(t: number, dur: number, freq: number, kind: BiquadFilterType, v: number): void {
  const { ac, out, noise } = ctx();
  t = Math.max(t, ac.currentTime);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise;
  f.type = kind;
  f.frequency.value = freq;
  shape(g, t, v, dur);
  s.connect(f);
  f.connect(g);
  g.connect(out);
  s.start(t);
  s.stop(t + dur + 0.05);
}

export const snare = (t: number, v = 1): void => { noise(t, 0.16, 1900, 'bandpass', 0.55 * v); tone(185, t, 0.09, 0.25 * v); };
export const hat = (t: number, v = 1): void => noise(t, 0.05, 7500, 'highpass', 0.22 * v);
export const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

/** Drum patterns: (beat in bar, beat time, beat length, off-beat time). */
const DRUMS: Record<DrumName, (b: number, t: number, e: number, o: number) => void> = {
  pop: (b, t, _e, o) => { (b % 2 ? snare : kick)(t, 0.7); hat(o, 0.6); },
  tick: (_b, t, _e, o) => { noise(t, 0.03, 2600, 'bandpass', 0.5); noise(o, 0.02, 3400, 'bandpass', 0.25); },
  shuffle: (b, t, _e, o) => { (b % 2 ? snare : kick)(t, 0.6); hat(t, 0.5); hat(o, 0.4); },
  none: (b, t) => { if (b === 0) hat(t, 0.3); },
  chip: (b, t, _e, o) => { kick(t, 0.6); noise(o, 0.03, 5000, 'highpass', 0.2); if (b % 2) noise(t, 0.06, 3000, 'highpass', 0.25); },
  folk: (b, t, _e, o) => { if (b % 2 === 0) kick(t, 0.8); hat(t, 0.35); hat(o, 0.5); },
  tango: (b, t, _e, o) => { if (b === 0) kick(t, 0.7); noise(t, 0.04, 2200, 'bandpass', 0.3); if (b === 3) snare(o, 0.5); },
  march: (b, t, e, o) => { if (b % 2 === 0) kick(t, 0.8); snare(t, 0.45); snare(o, 0.2); if (b === 3) snare(t + e * 0.75, 0.25); },
  pizz: (_b, _t, _e, o) => { hat(o, 0.35); },
  epic: (b, t, _e, o) => {
    kick(t, b === 0 ? 1.2 : 0.7);
    tone(55, t, 0.35, b === 0 ? 0.3 : 0.12, 'sine');
    if (b % 2) snare(t, 0.6);
    if (b === 0) noise(t, 0.5, 5000, 'highpass', 0.1);
    hat(o, 0.4);
  },
};

const chordTones = (major: 0 | 1): number[] => (major ? [0, 4, 7, 12, 16, 19] : [0, 3, 7, 12, 15, 19]);

/** Play beat `j` of the tune at time `t`, expecting the beat to last `est` seconds. */
export function playBeat(S: Song, j: number, t: number, est: number): void {
  const bar = Math.floor(j / 4), b = j % 4;
  const [off, q] = S.ch[bar % S.ch.length], ct = chordTones(q);
  const cr = S.key + (off >= 9 ? off - 12 : off);
  const br = S.key - 24 + (off >= 5 ? off - 12 : off);
  const sub = S.sub || 2, o = t + est * (S.swing || 0.5);
  const pat = S.mel[bar % S.mel.length], ld = S.lead, slot = est / sub;

  for (let s = 0; s < sub; s++) {
    const i = pat[b * sub + s];
    if (i < 0) continue;
    const when = s === 0 ? t : sub === 2 ? o : t + (est * s) / sub;
    const fr = midi(cr + ct[i] + (ld.oct || 0));
    tone(fr, when, slot * ld.len, ld.v, ld.type);
    if (ld.bell) tone(fr * 2, when, slot * ld.len * 0.6, ld.v * 0.35, 'sine');
  }

  const B = S.bass;
  const bt = (n: number, when: number, len: number) => tone(midi(br + n), when, len, B.v, B.type);
  switch (B.pat) {
    case 'root': bt(0, t, est * (B.short ? 0.3 : 0.9)); break;
    case 'oct': bt(0, t, est * 0.45); bt(12, t + est / 2, est * 0.4); break;
    case 'walk': bt([0, ct[1], 7, q ? 9 : 10][b], t, est * 0.8); break;
    case 'alt': bt(b % 2 ? 7 : 0, t, est * 0.6); break;
    case 'hab':
      if (b % 2 === 0) { bt(0, t, est * 0.6); bt(7, t + est * 0.75, est * 0.25); }
      else { bt(12, t, est * 0.4); bt(7, t + est * 0.5, est * 0.4); }
      break;
    case 'drone': if (b % 2 === 0) { bt(0, t, est * 1.9); bt(7, t, est * 1.9); } break;
  }
  if (S.pad && b % 2 === 0) {
    const pad = S.pad;
    [0, ct[1], 7].forEach((n) => tone(midi(cr + n), t, est * 1.9, pad.v, pad.type));
  }
  DRUMS[S.drum](b, t, est, o);
}

/** The final chord after the last beat. */
export function playEnding(S: Song, t: number): void {
  const third = chordTones(S.ch[0][1])[1];
  const type: OscillatorType = S.lead.type === 'square' ? 'square' : 'triangle';
  [-12, 0, third, 7, 12].forEach((n) => tone(midi(S.key + n), t, 1.6, 0.15, type));
  kick(t);
  noise(t, 0.6, 6000, 'highpass', 0.12);
}
