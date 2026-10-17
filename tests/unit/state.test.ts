import { describe, it, expect } from 'vitest';
import { tidy, fresh, TAKES } from '../../src/state';

describe('tidy', () => {
  it('returns a fresh state for anything unrecognizable', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { v: 2 }]) expect(tidy(bad)).toEqual(fresh());
  });

  it('keeps a well-formed state as it is', () => {
    const s = {
      v: 1 as const, updated: 123,
      stats: { played: 3, wins: 2, streak: 2, max: 2, dist: [1, 1, 0] as [number, number, number], lastWin: 5 },
      day: { n: 5, takes: [{ p: 80, m: 'g'.repeat(32) }, null], started: 2, counted: true, won: 1, best: 80 },
    };
    expect(tidy(s)).toEqual(s);
  });

  it('repairs partial or oversized data', () => {
    const t = tidy({
      v: 1, updated: 'soon',
      stats: { played: 'many', dist: [1] },
      day: { n: 9, takes: [{ p: 50, m: 'g'.repeat(40) }, { p: 'x' }, {}, {}, {}], started: 99 },
    });
    expect(t.updated).toBe(0);
    expect(t.stats).toEqual({ played: 0, wins: 0, streak: 0, max: 0, dist: [1, 0, 0], lastWin: 0 });
    expect(t.day?.started).toBe(TAKES);
    expect(t.day?.takes).toHaveLength(TAKES);
    expect(t.day?.takes[0]?.m).toHaveLength(32);
    expect(t.day?.takes[1]).toBeNull();
    expect(t.day?.best).toBe(-1);
  });
});
