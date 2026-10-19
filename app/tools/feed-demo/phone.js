/**
 * Khung điện thoại của bản xem thử: màn hình chính là ảnh chụp DOM thật của app
 * (build.mjs nhúng vào APP_HOME / APP_FEED), còn màn "Góp ý tới công ty" là đúng
 * module app/views/feed.js chạy thật trên dữ liệu giả (mock.js).
 */
/* global APP_HOME, APP_FEED */
import { el, setOverlayRoot, setScrollRoot, spriteIcon, toast, uiIcon } from '@ekko/shared/client.js';
import feedView from '@ekko/app/views/feed.js';

const DEMO = window.parent.DEMO;
const host = document.getElementById('phone');

function mountDevice(html) {
  host.innerHTML = html;
  // build.mjs đổi <button> thành <ekko-btn> để giữ đúng cây lồng nhau — đổi lại ở đây.
  for (const fake of host.querySelectorAll('ekko-btn')) {
    const btn = document.createElement('button');
    for (const a of fake.attributes) btn.setAttribute(a.name, a.value);
    btn.append(...fake.childNodes);
    fake.replaceWith(btn);
  }
  const screen = host.querySelector('#screen');
  setOverlayRoot(screen);
  setScrollRoot(host.querySelector('#scroll'));
  return screen;
}

// Mục khác trong ảnh chụp chỉ để xem — báo nhẹ thay vì im lặng.
function onlyFeed(e) {
  const target = e.target.closest('button, a, [role="button"], .loverhome__tab');
  if (!target || target.closest('.feedbar, .streaknudge, .hud__back, .screen__body .feedview, .toast-host, .reward')) return;
  e.preventDefault();
  e.stopPropagation();
  toast('Bản xem thử: mời bạn thử mục "Góp ý tới công ty"', 'info');
}

function home() {
  mountDevice(APP_HOME);
  const app = host.querySelector('.loverhome');
  const unread = DEMO.unreadReplies();
  if (unread && app) {
    const nudge = el('button.streaknudge', { type: 'button' }, [
      el('span.streaknudge__icon', { 'aria-hidden': 'true' }, uiIcon('bubble-chat', 18)),
      el('span.streaknudge__text', {}, 'Công ty đã phản hồi góp ý của bạn'),
      el('span.streaknudge__go', { 'aria-hidden': 'true' }, spriteIcon('chevron-right-01', 18)),
    ]);
    const anchor = app.querySelector('.resumenudge') || app.querySelector('.feedbar');
    anchor?.before(nudge);
  }
  host.querySelectorAll('.feedbar, .streaknudge').forEach((b) => b.addEventListener('click', () => { location.hash = '/feed'; }));
}

async function feed() {
  mountDevice(APP_FEED);
  const back = host.querySelector('.hud__back');
  back?.addEventListener('click', (e) => { e.preventDefault(); location.hash = '/'; });
  const body = host.querySelector('.screen__body');
  body.replaceChildren(el('p.muted', { style: { padding: '24px' } }, 'Đang mở…'));
  const view = await feedView({ refreshWorld: async () => {} });
  body.replaceChildren(view);
}

function route() {
  const path = location.hash.slice(1) || '/';
  return path.startsWith('/feed') ? feed() : home();
}

host.addEventListener('click', onlyFeed, true);
window.addEventListener('hashchange', route);
// HR trả lời / đổi trạng thái → cập nhật màn đang mở (dòng nhắc vàng, phản hồi mới).
DEMO.onChange((who) => {
  if (who === 'worker') return;
  // Đang viết dở thì không vẽ lại (mất chữ) — phản hồi sẽ hiện khi mở lại màn.
  const typing = [...host.querySelectorAll('.feedview textarea')].some((t) => t.value.trim());
  if (!typing) route();
});
route();
