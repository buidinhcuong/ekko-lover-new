/**
 * Mascot nổi của concept Ekko Lover — thay cho nút Ekko bot tròn + ô "Ghi nhanh"
 * luôn hiện ở đáy màn.
 *
 * - Chạm nhanh vào mascot: mở Ekko bot (như nút cũ).
 * - Rê chuột lên hoặc ấn giữ khoảng 2 giây: một vòng tiến độ chạy quanh mascot,
 *   đủ 2 giây thì ô "Ghi nhanh" trượt ra từ mascot. Bàn phím: phím ← khi đang
 *   đứng ở mascot.
 * - Bong bóng gợi ý ("Ấn giữ để ghi nhanh", "Hỏi gì đáp nấy"…) KHÔNG hiện sẵn:
 *   chỉ bật ra khi người dùng chạm / rê vào mascot, mỗi lần một câu, khoảng 2,5
 *   giây rồi tự ẩn. Không hiện khi đang mở bảng hay đang gõ ghi nhanh.
 * - Ô ghi nhanh thu lại khi rời ô mà chưa gõ gì, bấm Esc, hoặc chuyển màn.
 * - Kéo mascot đi đâu cũng được; thả ra thì nó trượt dính vào cạnh trái hoặc
 *   phải gần nhất, giữ độ cao vừa thả (trong vùng an toàn: dưới thanh trên cùng,
 *   trên tabbar). Vị trí nhớ trên máy (localStorage); ô ghi nhanh và bong bóng
 *   đổi phía theo mascot.
 * - Ở hai màn có tabbar (Heo cá nhân, Heo Dream Team — xem tabbar.js) mascot
 *   "đậu" vào nút tròn giữa tabbar: không kéo đi được, ô ghi nhanh trượt lên từ
 *   phía trên tabbar. Rời sang màn khác thì mascot về lại chỗ nổi đã nhớ.
 */
import { el, screenScale } from '/shared/client.js';
import { t } from './i18n.js';

const HOLD_MS = 2000;
const TIPS = ['Ấn giữ để ghi nhanh', 'Hỏi gì đáp nấy', 'Chạm để trò chuyện với Ekko', 'Ghi chi tiêu chỉ một dòng'];
const TIP_SHOW_MS = 2500;  // bong bóng hiện chừng này rồi tự ẩn
const RING_R = 44;
const DRAG_START = 8;      // px: kéo quá chừng này mới tính là kéo, không phải chạm
const EDGE_GAP = 12;       // cách mép màn khi dính vào cạnh
const POS_KEY = 'ekko.mascot.pos';

const readPos = () => {
  try { const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); return p && (p.side === 'left' || p.side === 'right') && Number.isFinite(p.top) ? p : null; } catch { return null; }
};
const writePos = (p) => { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* chế độ riêng tư */ } };

/**
 * @param {HTMLElement} bar   thanh ghi nhanh (buildQuickBar)
 * @param {() => void} openBot
 * @returns {HTMLElement} nút mascot
 */
export function loverMascot(bar, openBot) {
  const ringLen = 2 * Math.PI * RING_R;
  const ring = el('span.botfab__ring', {
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="${RING_R}" style="stroke-dasharray:${ringLen};stroke-dashoffset:${ringLen}"/></svg>`,
  });
  const bubble = el('span.botfab__bubble', { 'aria-hidden': 'true' });
  const fab = el('button.botfab.botfab--mascot', {
    type: 'button',
    'aria-label': t('Ekko bot: chạm để trò chuyện, ấn giữ 2 giây để ghi nhanh'),
    'aria-keyshortcuts': 'ArrowLeft',
  }, [ring, el('img', { src: '/assets/mascot/ekko-lover-mascot.png', alt: '', draggable: 'false' }), bubble]);

  bar.classList.add('quickbar--tucked');
  const input = bar.querySelector('input');

  // --- ô ghi nhanh -------------------------------------------------------
  const isOpen = () => bar.classList.contains('is-open');
  const openBar = () => {
    hideTip();
    bar.classList.add('is-open');
    fab.classList.add('is-bar-open');
    setTimeout(() => input?.focus({ preventScroll: true }), 180);
  };
  const closeBar = () => {
    bar.classList.remove('is-open');
    fab.classList.remove('is-bar-open');
  };
  bar.addEventListener('focusout', () => setTimeout(() => {
    if (!bar.contains(document.activeElement) && !input?.value.trim()) closeBar();
  }, 200));
  // Chạm ra ngoài khi ô còn trống cũng thu lại (đỡ phải tìm nút đóng).
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !bar.contains(e.target) && !fab.contains(e.target) && !input?.value.trim()) closeBar();
  });
  bar.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeBar(); fab.focus(); } });
  window.addEventListener('hashchange', closeBar);
  // Ghi xong (main.js · buildQuickBar): thu ô về sau mascot, trả focus cho mascot.
  bar.addEventListener('quickbar:saved', () => { input?.blur(); closeBar(); });

  // --- vị trí: mặc định theo CSS (góc phải dưới); kéo thả thì dính cạnh -----
  let pos = readPos();
  /** Đang đậu trong tabbar (main.js gắn class has-tabbar lên <html>). */
  const docked = () => document.documentElement.classList.contains('has-tabbar');
  const area = () => {
    // Mọi số đều tính bằng px BÊN TRONG màn hình (chia cho hệ số thu phóng).
    const screen = document.getElementById('screen');
    const k = screenScale();
    const rect = screen.getBoundingClientRect();
    const box = { left: rect.left, top: rect.top, width: screen.offsetWidth, height: screen.offsetHeight, k };
    const size = fab.offsetWidth || 80;
    const hud = document.querySelector('.hud');
    const hudBottom = hud && getComputedStyle(hud).display !== 'none' ? (hud.getBoundingClientRect().bottom - rect.top) / k : 0;
    const statusH = parseFloat(getComputedStyle(screen).getPropertyValue('--status-h')) || 0;
    const tab = document.querySelector('.ekkotabbar');
    const tabTop = tab && getComputedStyle(tab).display !== 'none' ? (tab.getBoundingClientRect().top - rect.top) / k : box.height;
    const homeH = parseFloat(getComputedStyle(screen).getPropertyValue('--home-h')) || 0;
    return {
      box, size,
      minTop: Math.max(statusH, hudBottom) + 12,
      maxTop: Math.min(tabTop, box.height - homeH) - size - 12,
    };
  };
  const clampTop = (top, a) => Math.max(a.minTop, Math.min(a.maxTop, top));
  function place(animate = false) {
    if (!fab.isConnected) return;
    const sides = ['is-left', 'is-high'];
    fab.classList.toggle('is-docked', docked());
    bar.classList.toggle('is-docked', docked());
    if (!pos || docked()) {
      ['left', 'top', 'right', 'bottom', 'transition'].forEach((k) => { fab.style[k] = ''; bar.style[k] = ''; });
      sides.forEach((c) => { fab.classList.remove(c); bar.classList.remove(c); });
      return;
    }
    const a = area();
    const top = clampTop(pos.top, a);
    const left = pos.side === 'left' ? EDGE_GAP : a.box.width - EDGE_GAP - a.size;
    fab.style.transition = animate ? 'left .3s cubic-bezier(.2, 1.25, .4, 1), top .3s cubic-bezier(.2, 1.25, .4, 1)' : 'none';
    Object.assign(fab.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
    const leftSide = pos.side === 'left';
    fab.classList.toggle('is-left', leftSide);
    fab.classList.toggle('is-high', top < a.minTop + 48);   // sát mép trên: bong bóng lật xuống dưới
    bar.classList.toggle('is-left', leftSide);
    const qh = bar.offsetHeight || 54;
    Object.assign(bar.style, {
      top: `${top + (a.size - qh) / 2}px`, bottom: 'auto',
      left: leftSide ? `${EDGE_GAP + a.size + 6}px` : '',
    });
  }
  requestAnimationFrame(() => place(false));
  window.addEventListener('resize', () => place(false));
  // Đổi màn thì tabbar/HUD có thể hiện hoặc ẩn: tính lại vùng an toàn.
  window.addEventListener('hashchange', () => setTimeout(() => place(false), 60));
  window.addEventListener('ekko:chrome', () => place(false));

  let drag = null;
  fab.addEventListener('pointermove', (e) => {
    if (!pressed || !drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / drag.k;
    const dy = (e.clientY - drag.y) / drag.k;
    if (!drag.moving) {
      if (docked() || Math.hypot(dx, dy) < DRAG_START) return;
      drag.moving = true;
      cancelHold();
      hideTip();
      closeBar();
      fab.setPointerCapture?.(e.pointerId);
      fab.classList.add('is-dragging');
    }
    const a = area();
    const left = Math.max(0, Math.min(a.box.width - a.size, drag.left + dx));
    const top = Math.max(a.minTop - 40, Math.min(a.maxTop + 40, drag.top + dy));
    fab.style.transition = 'none';
    Object.assign(fab.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moving;
    drag = null;
    fab.classList.remove('is-dragging');
    if (!moved) return;
    swallowClick = true;   // cú thả sau khi kéo không mở bot
    const a = area();
    const r = fab.getBoundingClientRect();
    pos = {
      side: (r.left + r.width / 2 - a.box.left) / a.box.k < a.box.width / 2 ? 'left' : 'right',
      top: clampTop((r.top - a.box.top) / a.box.k, a),
    };
    writePos(pos);
    place(true);
  };
  fab.addEventListener('pointerup', endDrag);
  fab.addEventListener('pointercancel', endDrag);

  // --- giữ 2 giây (chuột: rê lên; cảm ứng / chuột: ấn giữ) ----------------
  let holdTimer = null;
  let pressed = false;        // đang ấn (chuột hoặc ngón tay) trên mascot
  let swallowClick = false;   // cú thả tay sau khi giữ đủ 2 giây: không mở bot
  const startHold = () => {
    if (holdTimer || isOpen()) return;
    fab.classList.add('is-holding');
    holdTimer = setTimeout(() => {
      holdTimer = null;
      swallowClick = pressed;
      fab.classList.remove('is-holding');
      openBar();
    }, HOLD_MS);
  };
  const cancelHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    fab.classList.remove('is-holding');
  };
  fab.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') startHold(); });
  fab.addEventListener('pointerleave', cancelHold);
  fab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pressed = true;
    const a = area();
    const r = fab.getBoundingClientRect();
    drag = {
      id: e.pointerId, x: e.clientX, y: e.clientY, k: a.box.k,
      left: (r.left - a.box.left) / a.box.k, top: (r.top - a.box.top) / a.box.k, moving: false,
    };
    startHold();
  });
  fab.addEventListener('pointerup', (e) => { pressed = false; if (e.pointerType !== 'mouse') cancelHold(); });
  fab.addEventListener('pointercancel', () => { pressed = false; cancelHold(); });
  fab.addEventListener('contextmenu', (e) => e.preventDefault());   // ấn giữ trên điện thoại
  fab.addEventListener('click', () => {
    // Vừa ấn giữ đủ 2 giây (ô ghi nhanh đã mở) thì cú thả tay đó không mở bot.
    if (swallowClick) { swallowClick = false; return; }
    cancelHold();
    openBot();
  });
  fab.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); openBar(); } });

  // --- bong bóng gợi ý: chỉ hiện khi chạm / rê vào mascot, rồi tự ẩn ------
  let tipIndex = 0;
  let tipTimer = null;
  const busy = () => isOpen() || document.hidden
    || document.body.classList.contains('is-sheet') || document.body.classList.contains('is-modal')
    || getComputedStyle(fab).display === 'none';
  function hideTip() {
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = null;
    fab.classList.remove('is-tip');
  }
  const flashTip = () => {
    if (busy() || fab.classList.contains('is-tip')) return;
    bubble.textContent = t(TIPS[tipIndex % TIPS.length]);
    tipIndex += 1;
    fab.classList.add('is-tip');
    tipTimer = setTimeout(hideTip, TIP_SHOW_MS);
  };
  fab.addEventListener('pointerenter', flashTip);
  fab.addEventListener('pointerdown', flashTip);
  fab.addEventListener('focus', flashTip);

  return fab;
}
