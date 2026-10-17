// Plays a whole day of Baton in headless Chromium against the built dist/index.html:
// a passing take paced from the page's own "next N BPM" readout, an abandoned take,
// a rushed failing take, a practice take, a reload between each, and then tomorrow.
// Run `npm run check` (builds first) or `node tests/e2e/play-through.js` after a build.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const built = resolve(dir, '../../dist/index.html');
if (!existsSync(built)) { console.error('dist/index.html not found: run `npm run build` first'); process.exit(2); }
const N = 32;

// Set PLAYWRIGHT_CHROMIUM to a Chromium binary to skip `npx playwright install`.
const launch = () => chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const errs = [];
let failed = false;
const expect = (label, ok) => { console.log((ok ? '  ok   ' : '  FAIL ') + label); if (!ok) failed = true; };

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('file://' + built);

const text = (sel) => page.textContent(sel).then((s) => (s || '').trim());
const rows = () => page.$$eval('.row .pct', (x) => x.map((y) => y.textContent || '-').join(','));
const stats = () => page.$$eval('.stats dd', (x) => x.map((y) => y.textContent).join('/'));
const buttons = () => page.$$eval('.ctl .btn', (x) => x.filter((y) => !y.hidden).map((y) => y.textContent).join(','));
const nextBpm = async () => { const m = (await text('#status')).match(/next (\d+) BPM/); return m ? +m[1] : null; };
const tapNow = () => page.dispatchEvent('#pad', 'pointerdown');

console.log('Op.', (await text('#opus')).replace(/\D/g, ''), '·', await text('#style'));

// Take 1: follow the score. The first tap only arms the take; from the second tap
// on, each interval is 60 / (the BPM the page says it wants next).
await tapNow();
let at = Date.now();
for (let j = 1; j <= N; j++) {
  at += 60000 / (await nextBpm());
  const w = at - Date.now();
  if (w > 0) await page.waitForTimeout(w);
  await tapNow();
}
let msg = await text('#msg');
const pct = +(msg.match(/(\d+)% on the score/) || [0, 0])[1];
expect(`take 1 on the score scores high (${pct}%)`, pct >= 90);
expect('take 1 passes', /Passed on take 1/.test(msg));
expect('stats count one played day and a streak of 1', (await stats()) === '1/100/1/1');
expect('next-take and copy buttons appear', (await buttons()) === 'Start take 2,Copy result');

// A reload keeps everything.
await page.reload();
expect('record survives a reload', (await rows()) === '97%,-,-' || /^\d+%,-,-$/.test(await rows()));
expect('reload offers take 2', /Take 2 is ready/.test(await text('#msg')));

// Take 2: walk away in the middle. It must count as lost.
for (let j = 0; j < 6; j++) { await page.keyboard.press('Space'); await page.waitForTimeout(300); }
await page.reload();
expect('an abandoned take is lost', /^\d+%,lost,-$/.test(await rows()));

// Take 3: rush everything. It must fail without touching the earlier pass.
for (let j = 0; j <= N; j++) { await tapNow(); await page.waitForTimeout(260); }
msg = await text('#msg');
expect('a rushed take scores 0% and says why', /0% on the score/.test(msg) && /rushing/.test(msg));
expect('no takes left: only practice and copy remain', (await buttons()) === "Practice today's score,Copy result");
expect('the pad is disabled for the day', await page.$eval('#pad', (p) => p.disabled));

// Share text.
await page.click('#bCopy');
await page.waitForTimeout(150);
const copied = (await text('#bCopy')) === 'Copied';
const fallback = await page.$eval('#shareBox', (b) => !b.hidden);
expect('copy result either copies or shows the fallback box', copied || fallback);

// Practice does not count.
await page.click('#bPractice');
for (let j = 0; j <= N; j++) { await tapNow(); await page.waitForTimeout(40); }
expect('practice take is marked as not counting', /does not count/.test(await text('#msg')));
expect('practice leaves the stats alone', (await stats()) === '1/100/1/1');
expect('no horizontal overflow at phone width', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
await page.screenshot({ path: resolve(dir, 'day-done.png'), fullPage: true });

// Tomorrow, in the same browser.
await page.addInitScript(() => {
  const R = Date, off = 864e5;
  class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }
  window.Date = D;
});
await page.reload();
expect('a new day starts with three fresh takes', (await rows()) === '-,-,-');
expect('yesterday stays in the record', (await stats()) === '1/100/1/1');
await ctx.close();

// A quick look in dark mode at desktop width, mid-take.
const ctx2 = await browser.newContext({ viewport: { width: 1100, height: 900 }, colorScheme: 'dark' });
const p2 = await ctx2.newPage();
await p2.goto('file://' + built);
await p2.dispatchEvent('#pad', 'pointerdown');
for (let j = 1; j <= 12; j++) {
  const m = ((await p2.textContent('#status')) || '').match(/next (\d+) BPM/);
  await p2.waitForTimeout((60000 / (m ? +m[1] : 100)) * (j % 5 === 4 ? 1.25 : 1));
  await p2.dispatchEvent('#pad', 'pointerdown');
}
await p2.screenshot({ path: resolve(dir, 'day-dark.png'), fullPage: true });
await browser.close();

expect('no console or page errors', errs.length === 0);
if (errs.length) console.log(errs);
console.log(failed ? '\nPLAY-THROUGH FAILED' : '\nPLAY-THROUGH OK');
process.exit(failed ? 1 : 0);
