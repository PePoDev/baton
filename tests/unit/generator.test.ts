import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { makeDay, dayNumber, marking, N, EPOCH, STYLES } from '../../src/generator';

const DAYS = 730;
const BPM_MIN = 60, BPM_MAX = 138;

/**
 * SHA-256 of JSON.stringify(makeDay(1..730)). If this test fails you have
 * changed what an existing day sounds or plays like, which breaks every
 * player's history. Only update it deliberately, and never for a day that
 * has already been played.
 */
const FINGERPRINT = 'cd8e47bd4653d35f6758465a0b7d1813659a3ffb425eec760dd22f575ae4ff51';

const days = Array.from({ length: DAYS }, (_, i) => makeDay(i + 1));

describe('makeDay', () => {
  it('is deterministic', () => {
    for (const n of [1, 2, 77, 365, 730]) expect(makeDay(n)).toEqual(makeDay(n));
  });

  it('still produces exactly the scores players have already seen', () => {
    const hash = createHash('sha256').update(JSON.stringify(days)).digest('hex');
    expect(hash).toBe(FINGERPRINT);
  });

  it('produces a valid tempo curve every day', () => {
    for (const d of days) {
      expect(d.T).toHaveLength(N + 1);
      expect(d.segs.reduce((a, s) => a + s[0], 0)).toBe(N);
      for (let i = 1; i <= N; i++) {
        expect(d.T[i]).toBeGreaterThanOrEqual(BPM_MIN);
        expect(d.T[i]).toBeLessThanOrEqual(BPM_MAX);
      }
      let ramps = 0, prev: number | null = null;
      for (const [len, a, b] of d.segs) {
        if (a !== b) {
          ramps++;
          expect(Math.abs(b - a) / len, `day ${d.n}: ramp too steep`).toBeLessThanOrEqual(6.5);
          if (prev !== null) expect(a, `day ${d.n}: ramp does not start where the last section ended`).toBe(prev);
        } else if (prev !== null && prev !== a) {
          expect(Math.abs(prev - a), `day ${d.n}: a jump smaller than 20 BPM`).toBeGreaterThanOrEqual(20);
        }
        prev = b;
      }
      expect(ramps, `day ${d.n}: a score with no ramp`).toBeGreaterThan(0);
    }
  });

  it('produces a playable tune every day', () => {
    for (const d of days) {
      const S = d.song, slots = (S.sub || 2) * 4;
      expect(S.ch.length).toBeGreaterThan(0);
      for (const m of S.mel) {
        expect(m).toHaveLength(slots);
        expect(m[0], `day ${d.n}: a bar starting on a rest`).toBeGreaterThanOrEqual(0);
        for (const x of m) { expect(x).toBeGreaterThanOrEqual(-1); expect(x).toBeLessThanOrEqual(5); }
      }
    }
  });

  it('uses every band style and many curve shapes over two years', () => {
    const styles = new Set(days.map((d) => d.song.style));
    expect(styles.size).toBe(STYLES.length);
    const shapes = new Set(days.map((d) => d.segs.map(([, a, b]) => (a === b ? 'h' : b > a ? 'u' : 'd')).join('')));
    expect(shapes.size).toBeGreaterThan(15);
  });

  it('is easier early in the week and only jumps from Wednesday on', () => {
    for (const d of days) {
      const tol = [0.11, 0.1, 0.09][[2, 0, 0, 1, 1, 2, 2][d.dow]];
      expect(d.tol).toBe(tol);
      if (d.dow === 1 || d.dow === 2) {
        let prev: number | null = null;
        for (const [, a, b] of d.segs) {
          if (prev !== null) expect(a, `day ${d.n} (Mon/Tue) has a jump`).toBe(prev);
          prev = b;
        }
      }
    }
  });
});

describe('dayNumber', () => {
  it('starts at 1 on the epoch day and counts local calendar days', () => {
    const epoch = new Date(EPOCH[0], EPOCH[1], EPOCH[2], 12);
    expect(dayNumber(epoch)).toBe(1);
    expect(dayNumber(new Date(2026, 9, 10, 0, 0, 1))).toBe(1);
    expect(dayNumber(new Date(2026, 9, 10, 23, 59, 59))).toBe(1);
    expect(dayNumber(new Date(2026, 9, 11, 0, 0, 1))).toBe(2);
    expect(dayNumber(new Date(2027, 9, 10, 12))).toBe(366);
  });
  it('never goes below 1', () => {
    expect(dayNumber(new Date(2020, 0, 1))).toBe(1);
  });
});

describe('marking', () => {
  it('maps BPM to the usual Italian terms', () => {
    expect(marking(60)).toBe('Larghetto');
    expect(marking(70)).toBe('Adagio');
    expect(marking(100)).toBe('Andante');
    expect(marking(110)).toBe('Moderato');
    expect(marking(130)).toBe('Allegro');
  });
});
