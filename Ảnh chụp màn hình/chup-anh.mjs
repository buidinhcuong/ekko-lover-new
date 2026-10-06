/**
 * Chụp toàn bộ màn hình "App người dùng" kèm khung điện thoại.
 *
 * Không thêm phụ thuộc: dùng Chrome đã có trên máy ở chế độ headless và nói
 * chuyện với nó qua CDP bằng WebSocket có sẵn trong Node 24.
 *
 * Khung iPhone do chính app vẽ (.device + .device__chassis) và chỉ hiện khi
 * cửa sổ >= 768 x 680, nên cửa sổ ảo đặt 900 x 990 để khung đủ 450 x 920 pt.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const ORIGIN = process.env.ORIGIN || 'http://localhost:4321';
const OUT = process.argv[2] || path.resolve('shots');
const PROFILE = path.join(process.env.TMPDIR || '/tmp', 'ekko-shots-profile');
/** `?lang=` để chụp bản tiếng Anh mà không phải bấm nút. */
const LANG = process.env.LANG_CODE || '';

/* Đoạn tiện ích được nạp vào trang trước mỗi lần chuẩn bị màn hình. */
const HELPERS = () => `
  window.__lang = ${JSON.stringify(LANG || 'vi')};
  // Nhãn nút đổi theo ngôn ngữ, nên mỗi bước chuẩn bị nhận cả hai bản.
  window.__pick = (vi, en) => (window.__lang === 'en' ? en : vi);
  window.__q = (t, sel) => [...document.querySelectorAll(sel || 'button, a, [role=button]')]
    .find((e) => e.textContent.trim().toLowerCase().includes(String(t).toLowerCase()));
  window.__click = async (t, sel) => {
    let n = null;
    // Chờ nút hiện ra: view dựng xong sau vài nhịp, bấm sớm thì không thấy gì.
    for (let i = 0; i < 40 && !n; i += 1) { n = window.__q(t, sel); if (!n) await new Promise(r => setTimeout(r, 100)); }
    if (!n) throw new Error('không thấy: ' + t);
    n.click();
    await new Promise(r => setTimeout(r, 700));
    return n.textContent.trim();
  };
  window.__waitFor = async (sel) => {
    for (let i = 0; i < 40; i += 1) { const n = document.querySelector(sel); if (n) return n; await new Promise(r => setTimeout(r, 100)); }
    throw new Error('không thấy: ' + sel);
  };  window.__top = (y) => { const s = document.getElementById('scroll'); if (s) s.scrollTop = y || 0; };
`;

/** Mỗi màn hình: tên tệp, route, và (tuỳ chọn) đoạn chuẩn bị chạy trong trang. */
const SCREENS = [
  { file: '01-trang-chu-ban-do-hoc-tap', hash: '#/', prep: `__top(0)` },
  { file: '02-ban-do-cuon-giua',         hash: '#/', prep: `__top(900)` },
  { file: '03-ban-do-cuon-cuoi',         hash: '#/', prep: `__top(99999)` },
  { file: '04-ghi-chep-chi-tieu',        hash: '#/expenses', prep: `__top(0)` },
  { file: '05-ghi-mot-khoan-chi',        hash: '#/expenses', prep: `await __click(__pick('Ghi một khoản chi', 'Log an expense'))` },
  { file: '06-lap-ngan-sach',            hash: '#/budget', prep: `__top(0)` },
  { file: '07-ngan-sach-chinh-sua',      hash: '#/budget', prep: `const edit = __pick('sửa ngân sách', 'Edit budget'); await __click(__q(edit) ? edit : __pick('Lập ngân sách', 'Set a budget'))` },
  { file: '08-muc-tieu-cua-ban',         hash: '#/goals', prep: `await __click(__pick('Mục tiêu của bạn', 'Your goals'))` },
  { file: '09-dat-them-muc-tieu',        hash: '#/goals', prep: `await __click(__pick('Đặt thêm mục tiêu', 'Add a goal'))` },
  { file: '10-muc-tieu-thiet-lap',       hash: '#/goals', prep: `await __click(__pick('Đặt thêm mục tiêu', 'Add a goal')); await __click(__pick('Quỹ khẩn cấp', 'Emergency fund'))` },
  { file: '11-huy-hieu-cap-do',          hash: '#/badges', prep: `__top(0)` },
  { file: '12-huy-hieu-cuon',            hash: '#/badges', prep: `__top(99999)` },
  { file: '13-sau-cap-do-heo',           hash: '#/badges', prep: `await __click(__pick('Xem tất cả', 'See all')); await new Promise(r => setTimeout(r, 800))` },
  { file: '14-ekko-bot',                 hash: '#/', prep: `await __click('', '.botfab, #botFab, [aria-label*="Ekko"]')` },
  // Trình phát bài học: mở một bài ĐÃ học xong để không ghi thêm tiến độ nào.
  { file: '15-bai-hoc-noi-dung',         hash: '#/', prep: `(await __waitFor('.pathnode[data-state="done"] .pathnode__dot')).click(); await new Promise(r => setTimeout(r, 1600))` },
  { file: '16-bai-hoc-cuon',             hash: '#/', prep: `(await __waitFor('.pathnode[data-state="done"] .pathnode__dot')).click(); await new Promise(r => setTimeout(r, 1600)); document.querySelectorAll('.lesson__scroll, .lesson, .sheet__body').forEach(n => { n.scrollTop = 99999; })` },
  { file: '17-trac-nghiem-mo-dun',       hash: '#/', prep: `(await __waitFor('.pathnode--quiz:not([data-state="locked"]) .pathnode__dot')).click(); await new Promise(r => setTimeout(r, 2000))` },
];

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

/* ------------------------------------------------------------------ CDP */
let ws; let seq = 0; const waiting = new Map(); const listeners = new Set();

const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq;
  waiting.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const once = (method, sessionId) => new Promise((resolve) => {
  const fn = (msg) => {
    if (msg.method !== method || (sessionId && msg.sessionId !== sessionId)) return;
    listeners.delete(fn);
    resolve(msg.params);
  };
  listeners.add(fn);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Mọi bước đều có hạn chờ: headless đôi khi treo im lặng, thà bỏ một màn hình
   còn hơn treo cả lượt chụp. */
const withTimeout = (promise, ms, what) => Promise.race([
  promise,
  sleep(ms).then(() => { throw new Error(`hết hạn chờ (${ms}ms): ${what}`); }),
]);

async function browserSocket() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await res.json()).webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error('Chrome không mở cổng gỡ lỗi');
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await rm(PROFILE, { recursive: true, force: true });

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--window-size=900,990',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
  ], { stdio: 'ignore' });

  const url = await browserSocket();
  ws = new WebSocket(url);
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      return msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
    for (const fn of [...listeners]) fn(msg);
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = sessionId;

  await send('Page.enable', {}, S);
  await send('Runtime.enable', {}, S);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 900, height: 990, deviceScaleFactor: 2, mobile: false }, S);

  const go = async (target) => {
    // Nạp lại thật sự: hai bước liền nhau có thể cùng một URL (cùng `#/`), và
    // `Page.navigate` tới đúng URL đang mở thì Chrome không tải lại — bước sau
    // sẽ thừa hưởng bảng nổi mà bước trước vừa mở ra.
    await send('Page.navigate', { url: 'about:blank' }, S);
    await sleep(120);
    const loaded = once('Page.loadEventFired', S);
    await send('Page.navigate', { url: target }, S);
    await withTimeout(loaded, 15000, `tải ${target}`).catch(() => {});
  };

  const evaluate = async (expression) => {
    const r = await withTimeout(send('Runtime.evaluate',
      { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true }, S),
      20000, 'chạy script trong trang');
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'lỗi trong trang');
    return r.result?.value;
  };

  // Phiên đăng nhập demo: preview dùng tài khoản quản trị nên app hiện đúng tiến độ.
  await go(`${ORIGIN}/dev/login?role=admin&redirect=/app/`);
  await evaluate(`await new Promise(r => setTimeout(r, 1500));`);

  const done = [];
  for (const screen of SCREENS.filter((s) => !ONLY || ONLY.some((k) => s.file.startsWith(k)))) {
    try {
      await go(`${ORIGIN}/app/${LANG ? `?lang=${LANG}` : ''}${screen.hash}`);
      // Chờ app dựng xong (bỏ màn "Đang mở…") và font đã sẵn sàng.
      await evaluate(`
        ${HELPERS()}
        for (let i = 0; i < 80; i += 1) {
          if (!document.querySelector('.boot') && document.querySelector('#app')?.children.length) break;
          await new Promise(r => setTimeout(r, 100));
        }
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]);
        await new Promise(r => setTimeout(r, 500));
      `);
      if (screen.prep) await evaluate(`${HELPERS()}\n${screen.prep}`);
      await evaluate(`await new Promise(r => setTimeout(r, 900));`);

      // Cắt sát khung điện thoại, chừa lề cho bóng đổ.
      const box = await evaluate(`
        const d = document.querySelector('.device');
        const r = d.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      `);
      const pad = 36;
      const clip = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(900, box.w + pad * 2),
        height: Math.min(990, box.h + pad * 2),
        scale: 1,
      };
      const shot = await withTimeout(send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false }, S), 20000, 'chụp ảnh');
      const file = path.join(OUT, `${screen.file}.png`);
      await writeFile(file, Buffer.from(shot.data, 'base64'));
      done.push(`✓ ${screen.file}.png`);
      console.log(`✓ ${screen.file}.png`);
    } catch (err) {
      done.push(`✗ ${screen.file} — ${err.message}`);
      console.log(`✗ ${screen.file} — ${err.message}`);
    }
  }

  console.log('---\n' + done.join('\n'));
  ws.close();
  chrome.kill();
}

main().catch((err) => { console.error('LỖI:', err.message); process.exit(1); });
