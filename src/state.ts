/**
 * The player's record: today's takes and the running stats. It lives in
 * localStorage, and, when the page is served as a claude.ai artifact, is
 * also mirrored to the signed-in player's account so it follows them to
 * another device. Anywhere else the mirror is silently skipped.
 */
import { N } from './generator';

export const TAKES = 3;
/** Percent of beats on the score needed to pass the day. */
export const PASS = 75;
const KEY = 'baton-daily';

export interface Take { p: number; m: string }
export interface DayRecord {
  n: number;
  /** Takes finished or abandoned, in order; null marks an abandoned one. */
  takes: Array<Take | null>;
  /** Takes begun (a take counts from its second tap). */
  started: number;
  /** Whether this day has been added to `played`. */
  counted: boolean;
  /** 1-based take that first passed, 0 if none. */
  won: number;
  best: number;
}
export interface Stats {
  played: number; wins: number; streak: number; max: number;
  /** Which take the pass came on, per day won. */
  dist: [number, number, number];
  /** Day number of the latest pass, for streak continuity. */
  lastWin: number;
}
export interface SavedState { v: 1; updated: number; stats: Stats; day: DayRecord | null }

export const fresh = (): SavedState => ({
  v: 1, updated: 0,
  stats: { played: 0, wins: 0, streak: 0, max: 0, dist: [0, 0, 0], lastWin: 0 },
  day: null,
});

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Coerce anything read from storage into a well-formed state. */
export function tidy(s: unknown): SavedState {
  const f = fresh();
  if (!s || typeof s !== 'object' || (s as { v?: unknown }).v !== 1) return f;
  const o = s as Record<string, unknown>;
  const st = (o.stats && typeof o.stats === 'object' ? o.stats : {}) as Record<string, unknown>;
  const num = (x: unknown, d = 0) => (typeof x === 'number' && isFinite(x) ? x : d);
  f.updated = num(o.updated);
  const dist = Array.isArray(st.dist) ? st.dist : [];
  f.stats = {
    played: num(st.played), wins: num(st.wins), streak: num(st.streak), max: num(st.max), lastWin: num(st.lastWin),
    dist: [num(dist[0]), num(dist[1]), num(dist[2])],
  };
  const d = o.day as Record<string, unknown> | null | undefined;
  if (d && typeof d === 'object' && num(d.n) > 0) {
    const takes = (Array.isArray(d.takes) ? d.takes : []).slice(0, TAKES) as unknown[];
    f.day = {
      n: num(d.n), started: clamp(num(d.started), 0, TAKES), counted: !!d.counted, won: num(d.won), best: num(d.best, -1),
      takes: takes.map((t) => {
        const x = t as { p?: unknown; m?: unknown } | null;
        return x && typeof x.p === 'number' && typeof x.m === 'string' ? { p: x.p, m: x.m.slice(0, N) } : null;
      }),
    };
  }
  return f;
}

export function load(): SavedState {
  try { return tidy(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return fresh(); }
}

function persistLocal(state: SavedState): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage may be blocked */ }
}

/* ---------- account mirror (claude.ai artifacts only) ---------- */

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
}
declare global {
  interface Window { claude?: { use?: (name: string) => Promise<unknown> } }
}

let cloud: DocRef | null = null;
let pushing = false, dirty = false;
let pending: SavedState | null = null;

function push(): void {
  if (!cloud || !pending) return;
  if (pushing) { dirty = true; return; }
  pushing = true; dirty = false;
  cloud.set(JSON.parse(JSON.stringify(pending)) as Record<string, unknown>)
    .catch(() => undefined)
    .then(() => { pushing = false; if (dirty) push(); });
}

/** Save locally and, when connected, to the player's account. */
export function save(state: SavedState): void {
  state.updated = Date.now();
  persistLocal(state);
  pending = state;
  push();
}

/**
 * Try to connect the account mirror. Resolves with a newer remote state when
 * one exists (the caller decides whether to adopt it), otherwise null.
 */
export async function connectCloud(local: SavedState): Promise<SavedState | null> {
  try {
    const c = window.claude;
    if (!c || !c.use) return null;
    const [db, user] = await Promise.all([c.use('db'), c.use('user')]) as [
      { doc(path: string): DocRef } | null,
      { id(): Promise<string | null> } | null,
    ];
    if (!db || !user) return null;
    const id = await user.id();
    if (!id) return null;
    const ref = db.doc('data/users/' + id + '/record');
    const snap = await ref.get();
    const remote = snap.exists ? tidy(JSON.parse(JSON.stringify(snap.data()))) : null;
    cloud = ref;
    if (remote && remote.updated > local.updated) return remote;
    if (local.updated) { pending = local; push(); }
    return null;
  } catch {
    return null;
  }
}

/** Adopt a remote state: store it locally without bumping its timestamp. */
export function adopt(state: SavedState): void {
  persistLocal(state);
  pending = state;
}
