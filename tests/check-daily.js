const { chromium } = require('playwright');
const fs = require('fs');
const dir = __dirname;
const src = fs.readFileSync(dir + '/../index.html', 'utf8');
const gen = src.slice(src.indexOf('/*GEN*/'), src.indexOf('/*ENDGEN*/'));
const { makeDay, N } = new Function(gen + ';return {makeDay,N};')();

// 1. sweep two years of daily scores for validity
let bad = 0; const styles = {}, shapes = {};
for (let n = 1; n <= 730; n++) {
  const d = makeDay(n), e = [];
  if (d.T.length !== N + 1) e.push('length ' + d.T.length);
  if (d.segs.reduce((a, s) => a + s[0], 0) !== N) e.push('beats');
  for (let i = 1; i <= N; i++) if (!(d.T[i] >= 60 && d.T[i] <= 138)) e.push('range ' + d.T[i]);
  let ramps = 0, prev = null;
  d.segs.forEach(([len, a, b]) => {
    if (a !== b) { ramps++; if (Math.abs(b - a) / len > 6.5) e.push('steep'); if (prev !== null && prev !== a) e.push('ramp gap'); }
    else if (prev !== null && prev !== a && Math.abs(prev - a) < 20) e.push('small jump');
    prev = b;
  });
  if (!ramps) e.push('no ramp');
  const S = d.song, slots = (S.sub || 2) * 4;
  S.mel.forEach(m => { if (m.length !== slots) e.push('mel len'); m.forEach(x => { if (!(x >= -1 && x <= 5)) e.push('mel idx'); }); if (m[0] < 0) e.push('rest on 1'); });
  if (!S.ch.length || S.ch.some(c => c.length !== 2)) e.push('chords');
  if (JSON.stringify(makeDay(n)) !== JSON.stringify(d)) e.push('not deterministic');
  styles[S.style] = (styles[S.style] || 0) + 1;
  const sh = d.segs.map(([l, a, b]) => a === b ? 'h' : b > a ? 'u' : 'd').join(''); shapes[sh] = (shapes[sh] || 0) + 1;
  if (e.length) { bad++; if (bad < 6) console.log('day', n, e.join(', '), JSON.stringify(d.segs)); }
}
console.log('sweep: 730 days,', bad, 'invalid |', Object.keys(shapes).length, 'curve shapes |', JSON.stringify(styles));
for (const n of [1, 2, 3]) { const d = makeDay(n); console.log('day', n, JSON.stringify(d.segs), d.song.style, 'tol', d.tol); }

(async () => {
  fs.writeFileSync(dir + '/wrapped-daily.html', src);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] }).catch(() => chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }));
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const url = 'file://' + dir + '/wrapped-daily.html';
  await page.goto(url);
  const n = parseInt((await page.textContent('#opus')).replace(/\D/g, ''), 10), d = makeDay(n);
  const info = async tag => console.log(tag, '::', (await page.textContent('#msg')).trim(), '|', (await page.textContent('#status')).trim(), '| rows:', await page.$$eval('.row .pct', x => x.map(y => y.textContent || '-').join(',')), '| stats:', await page.$$eval('.stats dd', x => x.map(y => y.textContent).join('/')), '| btns:', await page.$$eval('.ctl .btn', x => x.filter(y => !y.hidden).map(y => y.textContent).join(',')), '| pad:', await page.$eval('#pad', p => p.textContent + (p.disabled ? ' [off]' : '')));
  await info('fresh Op.' + n);
  await page.screenshot({ path: dir + '/daily-fresh.png', fullPage: true });
  // take 1: conduct on the score
  let at = Date.now();
  for (let j = 0; j <= N; j++) { if (j > 0) at += 60000 / d.T[j]; const w = at - Date.now(); if (w > 0) await page.waitForTimeout(w); await page.dispatchEvent('#pad', 'pointerdown'); if (j === 12) await info('mid take'); }
  await info('after take 1');
  // reload: must persist
  await page.reload();
  await info('reloaded');
  // take 2: abandon mid-way by reloading (uses the take)
  for (let j = 0; j < 6; j++) { await page.keyboard.press('Space'); await page.waitForTimeout(300); }
  await page.reload();
  await info('abandoned take 2');
  // take 3: rush everything
  for (let j = 0; j <= N; j++) { await page.dispatchEvent('#pad', 'pointerdown'); await page.waitForTimeout(260); }
  await info('after take 3');
  await page.click('#bCopy'); await page.waitForTimeout(100);
  console.log('share fallback visible:', await page.$eval('#shareBox', b => !b.hidden), JSON.stringify(await page.$eval('#shareBox', b => b.value)));
  await page.click('#bPractice');
  for (let j = 0; j <= N; j++) { await page.dispatchEvent('#pad', 'pointerdown'); await page.waitForTimeout(40); }
  await info('after practice');
  await page.screenshot({ path: dir + '/daily-done.png', fullPage: true });
  console.log('h-overflow px:', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  // tomorrow: same browser, clock moved one day on
  await page.addInitScript(() => { const R = Date; const off = 864e5; class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } } window.Date = D; });
  await page.reload();
  await info('next day');
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1100, height: 900 }, colorScheme: 'dark' });
  const p2 = await ctx2.newPage(); await p2.goto(url);
  for (let j = 0; j < 14; j++) { await p2.dispatchEvent('#pad', 'pointerdown'); await p2.waitForTimeout(60000 / d.T[Math.min(N, j + 1)] * (j % 5 === 4 ? 1.25 : 1)); }
  await p2.screenshot({ path: dir + '/daily-dark.png', fullPage: true });
  console.log('ERRORS', JSON.stringify(errs, null, 1));
  await browser.close();
})();
