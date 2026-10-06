import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const B = 'http://127.0.0.1:4323';
const S = process.env.SCRATCH;
const DB = `${S}/qa-data/gdtc.sqlite`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jar = (name) => readFileSync(`${S}/${name}.jar`, 'utf8').split('\n').filter((l) => l.includes('ekko_gdtc_session')).map((l) => { const p = l.split('\t'); return `${p[5]}=${p[6]}`; })[0];
const as = (cookie) => async (method, path, body) => {
  const r = await fetch(B + path, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json().catch(() => null);
};
const lan = as(jar('lan'));
const minh = as(jar('minh'));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-first-run', '--lang=vi-VN'] });
const page = await browser.newPage();
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('ekko.lang', 'vi'); } catch {}
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = '.personaswitch,.langswitch,.homelink,.toast-host{display:none!important}.botfab__bubble{display:none!important}*{scrollbar-width:none}';
    document.head.append(s);
  });
});
const me = (method, path, body) => page.evaluate(async (m, p, b) => {
  const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  return r.json().catch(() => null);
}, method, path, body);
const go = async (hash, wait = 1800) => { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(wait); };
const scrollTo = (y) => page.evaluate((yy) => { const s = document.querySelector('.device__scroll') || document.scrollingElement; s.scrollTop = yy; }, y);
const scrollToSel = (sel, offset = 80) => page.evaluate((s, o) => {
  const box = document.querySelector('.device__scroll'); const n = document.querySelector(s);
  if (box && n) box.scrollTop += n.getBoundingClientRect().top - box.getBoundingClientRect().top - o;
}, sel, offset);
const shot = async (name) => { await sleep(500); await page.screenshot({ path: `shots/${name}.png` }); console.log('shot', name); };
const step = async (label, fn) => { try { await fn(); } catch (err) { console.log('FAIL', label, err.message); } };

// --- người dùng chính: persona "mid" -----------------------------------------
await page.goto(`${B}/dev/persona?as=mid`, { waitUntil: 'networkidle0' });
await me('POST', '/api/me/onboarding', { key: 'lover' });
await me('POST', '/api/me/checkin', {});

// Dream Team: Lan (trưởng đội, đã có Minh) mời "mid", mid đồng ý.
const world = await me('GET', '/api/me/world');
await lan('POST', '/api/team/invites', { code: world.me.friendCode });
const board = await me('GET', '/api/team');
if (board.invites.incoming[0]) await me('POST', `/api/team/invites/${board.invites.incoming[0].id}/accept`, {});
// XP từ Dream Team: tạm để 100% để thấy rõ phần vàng trên thanh, rồi trả lại mặc định.
const db = new DatabaseSync(DB);
db.prepare("INSERT INTO settings(key,value) VALUES('team_xp_share_percent','100') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
const done = new Set((db.prepare("SELECT lesson_id FROM lesson_progress lp JOIN users u ON u.id=lp.user_id WHERE u.ekko_user_id='qa-lan' AND status='completed'").all()).map((r) => r.lesson_id));
let added = 0;
for (const { id } of db.prepare('SELECT id FROM lessons WHERE is_published=1 ORDER BY id').all()) {
  if (done.has(id) || added >= 5) continue;
  await lan('POST', `/api/learn/lessons/${id}/complete`, {}); added += 1;
}
db.prepare("DELETE FROM settings WHERE key='team_xp_share_percent'").run();
const mates = (await me('GET', '/api/team')).team?.members || [];
const lanRow = mates.find((m) => m.name.startsWith('Lan'));
if (lanRow && lanRow.canNudge) await me('POST', `/api/team/members/${lanRow.userId}/nudge`, {});

// Ghi nhanh 2 khoản (như AI tách "phở 45k, cà phê 25k").
const cats = await me('GET', '/api/categories');
const pick = (code) => cats.find((c) => c.code === code)?.id;
console.log('quick', JSON.stringify(await me('POST', '/api/expenses/quick', { text: 'phở 45k, cà phê 25k', items: [
  { amount: 45000, note: 'phở', categoryId: pick('wants_dining') },
  { amount: 25000, note: 'cà phê', categoryId: pick('wants_entertainment') },
] })).slice(0, 300));
// Mục tiêu có lời tư vấn.
const deadline = (() => { const d = new Date(); d.setMonth(d.getMonth() + 10); return d.toISOString().slice(0, 10); })();
await me('POST', '/api/goals/advice', { name: 'Mua xe máy mới', targetAmount: 24000000, deadline, monthlyIncome: 9500000, monthlySaving: 2500000, icon: 'motorbike-01' });

await page.goto(`${B}/app/#/`, { waitUntil: 'networkidle0' });
await sleep(2500);

await step('home', async () => { await go('/'); await scrollTo(0); await shot('home'); });
await step('home-today', async () => { await scrollToSel('.loverhome-shell [class*="today"], .exptoday, .todaylist', 120); await shot('home-today'); });
await step('quickbar', async () => {
  await scrollTo(0);
  await page.evaluate(() => document.querySelector('.botfab--mascot')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  await sleep(500);
  await page.type('.quickbar input', 'phở 45k, cà phê 25k', { delay: 10 });
  await page.evaluate(() => { document.querySelector('.botfab--mascot')?.classList.add('is-holding'); });
  await shot('quickbar');
  await page.evaluate(() => { const i = document.querySelector('.quickbar input'); i.value = ''; i.blur(); document.querySelector('.botfab--mascot')?.classList.remove('is-holding'); });
});
await step('explore', async () => { await go('/explore', 2500); await scrollToSel('.lrnstop.is-current', 260); await shot('explore'); });
await step('lesson', async () => {
  await page.click('.lrnstop.is-current'); await sleep(2500); await shot('lesson-1');
  const next = await page.$$('button'); for (const b of next) { const t = await b.evaluate((n) => n.textContent.trim()); if (/Tiếp tục|Tiếp/.test(t)) { await b.click(); break; } }
  await sleep(1500); await shot('lesson-2');
  await page.goto(`${B}/app/`, { waitUntil: 'networkidle0' }); await page.reload({ waitUntil: 'networkidle0' }); await sleep(2000);
});
await step('quiz', async () => {
  await page.goto(`${B}/app/#/explore`, { waitUntil: 'networkidle0' }); await sleep(2500);
  const ok = await page.evaluate(() => {
    const q = [...document.querySelectorAll('.lrnstop')].find((n) => n.getAttribute('aria-label')?.startsWith('Trắc nghiệm') && !n.classList.contains('is-locked'));
    if (!q) return false; q.scrollIntoView(); q.click(); return true;
  });
  if (!ok) throw new Error('no quiz');
  await sleep(2500); await shot('quiz');
});
await page.goto(`${B}/app/`, { waitUntil: 'networkidle0' }); await page.reload({ waitUntil: 'networkidle0' }); await sleep(2500);
await step('goals', async () => { await go('/goals', 2200); await shot('goals'); });
await step('goal-advice', async () => {
  const clicked = await page.evaluate(() => { const c = [...document.querySelectorAll('.goalcard, [class*="goalcard"]')].find((n) => n.textContent.includes('xe máy')); if (!c) return false; (c.querySelector('.goalcard__ai') || c).click(); return true; });
  if (!clicked) throw new Error('no goal card');
  await sleep(1800); await shot('goal-advice');
});
await step('budget', async () => { await go('/budget', 2200); await shot('budget'); });
await step('expenses', async () => { await go('/expenses', 2200); await shot('expenses'); });
await step('savings', async () => { await go('/savings', 2200); await shot('savings'); });
await step('challenges', async () => { await go('/challenges', 2200); await shot('challenges'); });
await step('badges', async () => { await go('/badges', 2200); await shot('badges'); });
await step('level', async () => { await go('/level', 2200); await shot('level'); });
await step('team', async () => { await go('/team', 2500); await scrollToSel('.teamlist', 330); await shot('team'); });
await step('team-top', async () => { await scrollTo(0); await shot('team-top'); });
await step('home-teamxp', async () => { await go('/', 2200); await scrollTo(0); await shot('home-teamxp'); });
await step('bot', async () => {
  await page.evaluate(() => document.querySelector('.botfab--mascot')?.click());
  await sleep(1500);
  const input = await page.$('.sheet input.input');
  await input.type('Quỹ khẩn cấp nên có bao nhiêu?', { delay: 10 });
  await page.keyboard.press('Enter');
  await sleep(3500); await shot('bot');
});
await browser.close();
db.close();
