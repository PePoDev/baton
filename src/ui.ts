/**
 * Rendering. Every function here takes what it draws as arguments and
 * touches only the DOM; game rules live in game.ts.
 */
import { N, type Day } from './generator';
import { PASS, TAKES, type DayRecord, type Stats } from './state';

export type Mark = 'g' | 'r' | 'b';
export interface Point { k: number; bpm: number; m: Mark }

export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error('missing element ' + sel);
  return e;
};
const el = (tag: string, cls?: string, txt?: string | null) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const f = (v: number) => v.toFixed(1);

/* ---------- the staff ---------- */

const X = (i: number) => 46 + ((i - 1) / (N - 1)) * 336;
const Y = (b: number) => 166 - (clamp(b, 48, 152) - 48) * 1.3;

export function drawStaff(D: Day): void {
  const T = D.T;
  // A sudden change is drawn as a vertical step, not a slope.
  const path = (m: number) => {
    const a: string[] = [];
    for (let i = 1; i <= N; i++) {
      if (i > 1 && Math.abs(T[i] - T[i - 1]) > 12) {
        const xm = f((X(i) + X(i - 1)) / 2);
        a.push(xm + ',' + f(Y(T[i - 1] * m)), xm + ',' + f(Y(T[i] * m)));
      }
      a.push(f(X(i)) + ',' + f(Y(T[i] * m)));
    }
    return a;
  };
  let g = `<polygon class="band" points="${path(1 + D.tol).concat(path(1 - D.tol).reverse()).join(' ')}"/>`;
  [60, 80, 100, 120, 140].forEach((b) => {
    g += `<line class="ln" x1="36" x2="392" y1="${f(Y(b))}" y2="${f(Y(b))}"/><text class="tx" x="31" y="${f(Y(b) + 3)}" text-anchor="end">${b}</text>`;
  });
  g += `<text class="tx" x="31" y="26" text-anchor="end">BPM</text>`;
  const top = f(Y(140)), bot = f(Y(60));
  g += `<line class="bar" x1="36" x2="36" y1="${top}" y2="${bot}"/>`;
  for (let m = 1; m < 8; m++) {
    const x = f((X(4 * m) + X(4 * m + 1)) / 2);
    g += `<line class="bar" x1="${x}" x2="${x}" y1="${top}" y2="${bot}"/>`;
  }
  g += `<line class="end" stroke-width=".8" x1="388" x2="388" y1="${top}" y2="${bot}"/><line class="end" stroke-width="2.6" x1="391.4" x2="391.4" y1="${top}" y2="${bot}"/>`;
  g += `<polyline class="tl" points="${path(1).join(' ')}"/>`;
  let o = 0;
  D.segs.forEach(([len, a, b]) => {
    const short = len < 6;
    const s = a === b ? (short ? String(a) : 'hold ' + a) : b > a ? (short ? 'up' : 'speed up') : short ? 'down' : 'slow down';
    g += `<text class="tx" x="${f(X(o + (len + 1) / 2))}" y="186" text-anchor="middle">${s}</text>`;
    o += len;
  });
  $('#staff').innerHTML = g + '<g id="trace"></g>';
}

export function drawTrace(pts: Point[]): void {
  let g = `<polyline class="pl" points="${pts.map((p) => f(X(p.k)) + ',' + f(Y(p.bpm))).join(' ')}"/>`;
  pts.forEach((p) => { g += `<circle class="${p.m}" cx="${f(X(p.k))}" cy="${f(Y(p.bpm))}" r="3"/>`; });
  $('#trace').innerHTML = g;
}

/* ---------- the take board ---------- */

export function renderBoard(d: DayRecord, liveIdx: number, liveMarks: Mark[]): void {
  const board = $('#board');
  board.innerHTML = '';
  for (let i = 0; i < TAKES; i++) {
    const t = d.takes[i], lost = i < d.takes.length && !t;
    const m = t ? t.m : i === liveIdx ? liveMarks.join('') : '';
    const row = el('div', 'row' + (i === liveIdx ? ' live' : ''));
    row.append(el('span', 'small', 'Take ' + (i + 1)));
    const strip = el('div', 'strip');
    for (let b = 0; b < 8; b++) {
      const grp = el('div', 'grp');
      for (let c = 0; c < 4; c++) grp.append(el('i', 'c ' + (m[b * 4 + c] || '')));
      strip.append(grp);
    }
    row.append(strip, el('span', 'small pct', t ? t.p + '%' : lost ? 'lost' : i === liveIdx ? '…' : ''));
    row.setAttribute('aria-label', `Take ${i + 1}: ` + (t ? t.p + ' percent' : lost ? 'left unfinished' : 'not played'));
    board.append(row);
  }
}

/* ---------- the record ---------- */

export function renderRecord(s: Stats, streak: number, wonOn: number): void {
  $('#sPlayed').textContent = String(s.played);
  $('#sPass').textContent = String(s.played ? Math.round((s.wins / s.played) * 100) : 0);
  $('#sStreak').textContent = String(streak);
  $('#sMax').textContent = String(s.max);
  const dist = $('#dist'), mx = Math.max(1, ...s.dist);
  dist.innerHTML = '';
  s.dist.forEach((c, i) => {
    const row = el('div', 'drow');
    row.append(el('span', 'small', 'Take ' + (i + 1)));
    const bar = el('div', 'dbar' + (wonOn === i + 1 ? ' on' : ''), String(c));
    bar.style.width = Math.max(8, (c / mx) * 100) + '%';
    const hold = el('div');
    hold.append(bar);
    row.append(hold);
    dist.append(row);
  });
}

export const rank = (p: number): string =>
  p >= 95 ? 'Maestro' : p >= 85 ? 'Concertmaster' : p >= PASS ? 'Conductor' : p >= 50 ? 'Understudy' : 'Page-turner';

export function renderResult(d: DayRecord, bestIdx: number, left: number): void {
  const box = $('#result');
  box.hidden = bestIdx < 0;
  $('#bCopy').hidden = bestIdx < 0;
  if (bestIdx < 0) return;
  const t = d.takes[bestIdx];
  if (!t) return;
  $('#rNum').innerHTML = t.p + '<small>%</small>';
  $('#rRank').textContent = rank(t.p);
  $('#rLine').textContent = d.won
    ? `Passed on take ${d.won}. Your best today is take ${bestIdx + 1}.`
    : left > 0
      ? `${PASS}% passes. You have ${left} take${left === 1 ? '' : 's'} left.`
      : `${PASS}% passes. No takes left today, so try again tomorrow.`;
}

/* ---------- controls and messages ---------- */

export type Phase = 'ready' | 'playing' | 'done';
export interface ControlView { phase: Phase; practice: boolean; left: number; started: number; begun: boolean }

export function renderControls(v: ControlView): void {
  const pad = $<HTMLButtonElement>('#pad');
  const can = v.phase !== 'done' && (v.practice || v.left > 0);
  pad.disabled = !can;
  $('#padBig').textContent =
    v.phase === 'playing' ? 'Tap the beat'
      : v.phase === 'done' ? (v.practice ? 'Practice take finished' : v.left > 0 ? 'Take finished' : 'Done for today')
        : 'Give the first beat';
  $('#padSub').textContent = v.phase === 'done' ? (v.left > 0 || v.practice ? '' : 'a new score arrives at midnight') : 'tap here or press Space';
  const next = $('#bNext');
  next.hidden = !(v.phase === 'done' && v.left > 0);
  next.textContent = 'Start take ' + (v.started + 1);
  const practice = $('#bPractice');
  practice.hidden = !(v.phase === 'done' && v.left <= 0);
  practice.textContent = v.practice ? 'Practice again' : "Practice today's score";
}

export function renderStatus(v: ControlView & { k: number; nextBpm: number }): void {
  const who = v.practice ? 'Practice' : v.left > 0 || v.phase !== 'ready'
    ? `Take ${clamp(v.started + (v.begun || v.phase === 'done' ? 0 : 1), 1, TAKES)} of ${TAKES}` : '';
  $('#status').innerHTML = v.phase === 'playing' ? `${who} · beat <b>${v.k}</b> of ${N} · next <b>${v.nextBpm}</b> BPM` : who;
}

export const say = (s: string): void => { $('#msg').textContent = s; };

export function renderHeader(D: Day, b0: number, style: string): void {
  $('#opus').textContent = 'Op. ' + D.n;
  $('#date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  $('#tempo').innerHTML = `♩ = ${b0} <i>${style}</i>`;
  $('#style').textContent = 'The band plays ' + D.song.style;
  $('#tol').textContent = 'Band ±' + Math.round(D.tol * 100) + '%';
}

export function renderCountdown(): void {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
  const p = (x: number) => String(x).padStart(2, '0');
  $('#next').innerHTML = `Next score in <b>${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}</b>`;
}

export function flashPad(): void {
  const pad = $('#pad');
  pad.classList.add('hit');
  setTimeout(() => pad.classList.remove('hit'), 100);
}
