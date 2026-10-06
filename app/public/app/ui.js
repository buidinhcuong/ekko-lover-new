/** App-specific UI primitives: bottom sheets, the reward celebration, HUD bits. */
import { dataIcon, el, getOverlayRoot, lockScroll, screenScale, uiIcon, unlockScroll } from '/shared/client.js';
import { looksShorthand, parseMoney } from '/shared/money.js';
import { getLang, t } from './i18n.js';

// --- bottom sheet --------------------------------------------------------
let openSheet = null;

export function sheet({ title, body, footer, onClose }) {
  closeSheet();

  const backdrop = el('div.sheet-backdrop', { onclick: () => closeSheet() });
  const panel = el('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || t('Bảng') }, [
    el('div.sheet__head', {}, [
      el('h2', {}, title || ''),
      el('button.iconbtn', { onclick: () => closeSheet(), 'aria-label': t('Đóng') }, uiIcon('cancel-01', 20)),
    ]),
    el('div.sheet__body', {}, [].concat(body)),
    footer || null,
  ]);

  getOverlayRoot().append(backdrop, panel);
  lockScroll();
  document.body.classList.add('is-sheet');
  openSheet = { backdrop, panel, onClose };

  // Focus the first control so keyboard and screen-reader users land inside.
  panel.querySelector('input, textarea, button:not(.iconbtn)')?.focus({ preventScroll: true });
  return panel;
}

export function closeSheet() {
  if (!openSheet) return;
  const { backdrop, panel, onClose } = openSheet;
  openSheet = null;
  backdrop.remove();
  panel.remove();
  unlockScroll();
  document.body.classList.remove('is-sheet');
  onClose?.();
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSheet();
});

// --- reward celebration --------------------------------------------------
const MASCOT_CHEER = ['/assets/mascot/bot-1.png', '/assets/mascot/bot-2.png', '/assets/mascot/bot-3.png'];
/**
 * Màu giấy vụn lấy thẳng từ token của design system.
 *
 * Canvas/inline style cần giá trị màu thật chứ không nhận `var()`, nên đọc token
 * lúc chạy bằng `getComputedStyle` — cùng cách Admin portal đọc token cho ô
 * `<input type="color">`. Đọc lúc chạy cũng có nghĩa là đổi sang chế độ tối thì
 * giấy vụn đổi theo, không phải sửa ở hai nơi.
 */
const CONFETTI_TOKENS = [
  '--bg-warning-500', '--bg-success-500', '--bg-brand-500',
  '--secondary-colors-violet', '--bg-error-500',
];

const confettiColors = () => {
  const style = getComputedStyle(document.documentElement);
  return CONFETTI_TOKENS.map((token) => style.getPropertyValue(token).trim()).filter(Boolean);
};

/** Một lớp "tung hoa" rơi từ trên xuống, chỉ trang trí — không chặn click. */
function confettiLayer() {
  const colors = confettiColors();
  const pieces = Array.from({ length: 28 }, () => {
    const piece = el('span.reward__confetti');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    piece.style.animationDuration = `${1.6 + Math.random() * 1}s`;
    piece.style.setProperty('--rot', `${Math.random() * 360}deg`);
    return piece;
  });
  return el('div.reward__confetti-layer', { 'aria-hidden': 'true' }, pieces);
}

// "Đến nhận thưởng": màn đang mở (vd. bài học vừa xong) thường tự chuyển trang
// ngay sau khi đóng màn chúc mừng. Trong vài giây sau khi bấm, mọi lần chuyển
// trang đều dẫn về trang Huy hiệu (main.js `navigate`), để không bị đè mất.
let claimRedirectAt = 0;
export const claimRedirectActive = () => Date.now() - claimRedirectAt < 4000;
export const clearClaimRedirect = () => { claimRedirectAt = 0; };

/**
 * One screen for every "you earned something" moment: lesson finished, module
 * finished, level up, badges. Resolves when the user dismisses it.
 *
 * Huy hiệu `claimable` (Ekko Lover: XP chờ bấm nhận) hiện kèm phần thưởng và
 * nút "Đến nhận thưởng" mở trang Huy hiệu.
 */
export function celebrate({ title, subtitle, image, stats = [], badges = [], levelUp = null, actionLabel = t('Tuyệt vời') }) {
  const claimable = badges.some((b) => b.claimable);
  return new Promise((resolve) => {
    const overlay = el('div.reward', { role: 'dialog', 'aria-modal': 'true' });

    const close = () => {
      overlay.remove();
      unlockScroll();
      document.body.classList.remove('is-modal');
      resolve();
    };

    const card = el('div.reward__card', {}, [
      el('img', { src: image || MASCOT_CHEER[Math.floor(Math.random() * MASCOT_CHEER.length)], alt: '' }),
      el('h2', {}, title),
      subtitle ? el('p.muted', {}, subtitle) : null,
      stats.length ? el('div.reward__stats', {}, stats.map((s) => el('span.pill', {}, s))) : null,
      levelUp
        ? el('div.reward__badge', {}, [
          el('span.reward__icon', {}, dataIcon(levelUp.emoji, 'party', 32)),
          el('div', {}, [el('b', {}, t('Lên cấp: {name}', { name: levelUp.name })), el('small', {}, levelUp.perk || '')]),
        ])
        : null,
      ...badges.map((b) => el('div.reward__badge', {}, [
        el('span', {}, b.icon || '🏅'),
        el('div', {}, [el('b', {}, t('Huy hiệu mới: {name}', { name: b.name })), el('small', {}, b.description || '')]),
        b.xp_reward ? el('em.reward__xp', {}, `+${b.xp_reward} XP`) : null,
      ])),
      claimable
        ? el('button.btn.btn--block', {
          onclick: () => {
            claimRedirectAt = Date.now();
            close();
            window.dispatchEvent(new CustomEvent('ekko:navigate', { detail: '/badges' }));
          },
          style: { marginTop: '8px' },
        }, t('Đến nhận thưởng'))
        : null,
      el(`button.btn.btn--block${claimable ? '.btn--ghost' : ''}`, { onclick: close, style: { marginTop: '8px' } }, claimable ? t('Để sau') : actionLabel),
    ]);

    overlay.append(confettiLayer(), card);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    getOverlayRoot().append(overlay);
    lockScroll();
    document.body.classList.add('is-modal');
    card.querySelector('.btn')?.focus({ preventScroll: true });
  });
}

/** Turns a rewards envelope from the API into a celebration, if worth showing. */
export async function celebrateRewards(rewards, { title, subtitle, image } = {}) {
  if (!rewards) return;
  const stats = [];
  if (rewards.xp) stats.push(`+${rewards.xp} XP`);
  if (rewards.streak?.changed) {
    stats.push(rewards.streak.outcome === 'recovered'
      ? [uiIcon('fire', 16), ` ${t('Cứu chuỗi: {n} ngày', { n: rewards.streak.count })}`]
      : [uiIcon('fire', 16), ` ${t('{n} ngày', { n: rewards.streak.count })}`]);
  }
  if (!stats.length && !rewards.badges?.length && !rewards.levelUp) return;

  await celebrate({
    title: title || t('Làm tốt lắm'),
    subtitle,
    image,
    stats,
    badges: rewards.badges || [],
    levelUp: rewards.levelUp || null,
  });
}

// --- small building blocks ----------------------------------------------
export const bar = (percent, tone = '') => el('div.bar', {}, [
  el(`div.bar__fill${tone ? `.bar__fill--${tone}` : ''}`, { style: { width: `${Math.max(0, Math.min(100, percent))}%` } }),
]);

export function confirmSheet({ title, message, confirmLabel = t('Xoá'), tone = 'danger' }) {
  return new Promise((resolve) => {
    let settled = false;
    const answer = (value) => { settled = true; closeSheet(); resolve(value); };

    sheet({
      title,
      body: [el('p.muted', {}, message)],
      footer: el('div.sheet__body', { style: { display: 'flex', gap: '12px', borderTop: '1px solid var(--border-secondary)' } }, [
        el('button.btn.btn--ghost', { style: { flex: '1' }, onclick: () => answer(false) }, t('Huỷ')),
        el(`button.btn.btn--${tone}`, { style: { flex: '1' }, onclick: () => answer(true) }, confirmLabel),
      ]),
      onClose: () => { if (!settled) resolve(false); },
    });
  });
}

/**
 * Ô nhập tiền: người dùng gõ số, dấu phân cách nghìn được thêm ngay khi gõ nên
 * "ba mươi triệu" đọc được thành 30.000.000 chứ không phải một dãy tám chữ số.
 * Dùng chung cho mọi màn có nhập số tiền (mục tiêu, ngân sách, ghi chép chi
 * tiêu) — luôn hiện dấu chấm phân cách, không bao giờ để số trần.
 */
/**
 * Ô nhập số tiền. Gõ số thường thì tự chèn dấu phân cách; gõ tắt kiểu
 * "12tr", "29tr900", "1tr2", "500k" thì giữ nguyên chữ đang gõ, hiện ngay số
 * đọc được bên dưới, và đổi thành số đầy đủ khi rời ô. Bàn phím để kiểu chữ
 * (không phải bàn phím số) vì bàn phím số trên điện thoại không gõ được "tr"/"k".
 */
export function moneyInput(value = 0, placeholder = t('VD: 30.000.000')) {
  const grouping = () => (getLang() === 'en' ? 'en-US' : 'vi-VN');
  const input = el('input.input.input--money', {
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder,
    value: value ? Number(value).toLocaleString(grouping()) : '',
  });
  const hint = el('span.moneyhint', { 'aria-live': 'polite', hidden: true });
  const format = (n) => Number(n).toLocaleString(grouping());

  input.addEventListener('input', () => {
    if (looksShorthand(input.value)) {
      const amount = parseMoney(input.value);
      if (!hint.isConnected) input.insertAdjacentElement('afterend', hint);
      hint.hidden = false;
      hint.textContent = amount ? `= ${format(amount)}đ` : t('Chưa đọc được số tiền');
      hint.classList.toggle('is-error', !amount);
      return;
    }
    hint.hidden = true;
    const digits = input.value.replace(/\D/g, '').slice(0, 12);
    input.value = digits ? format(digits) : '';
  });
  input.addEventListener('blur', () => {
    if (!looksShorthand(input.value)) return;
    const amount = parseMoney(input.value);
    if (amount) {
      input.value = format(amount);
      hint.hidden = true;
    }
  });
  return input;
}

/** Số đồng trong ô `moneyInput` — đọc được cả khi người dùng bấm Lưu lúc chữ tắt còn nguyên. */
export const readMoney = (input) => (looksShorthand(input.value)
  ? parseMoney(input.value) || 0
  : Number(input.value.replace(/\D/g, '')) || 0);

// --- swipeable row (Ngân sách, Ghi chép chi tiêu…) -----------------------
// Phải khớp đúng với kích thước/khoảng cách của .swiperow__action trong
// style.css, vì đây là khoảng vuốt cần kéo để lộ hết các nút phía sau.
const SWIPE_ACTION_WIDTH = 44;
const SWIPE_ACTION_GAP = 12;
const SWIPE_ACTION_PAD = 16;
let closeOpenSwipeRow = null;

// Chạm vào bất kỳ đâu trên màn hình (ngoài chính các nút hành động) thì đóng
// hàng đang mở lại — kể cả chạm lại vào chính hàng đó. Bắt ở capture phase
// của document nên luôn chạy TRƯỚC pointerdown riêng của từng hàng, đăng ký
// một lần duy nhất ở module-scope (module chỉ chạy một lần) thay vì mỗi lần
// dựng hàng lại thêm một listener mới.
document.addEventListener('pointerdown', (event) => {
  if (!closeOpenSwipeRow || event.target.closest('.swiperow__actions')) return;
  closeOpenSwipeRow();
}, true);

/**
 * Vuốt ngang một hàng để lộ các nút hành động phía sau (Sửa/Xoá…). Dùng
 * Pointer Events (chứ không riêng touch) để cả chuột trên desktop cũng kéo
 * được, không chỉ cảm ứng trên điện thoại. `actions`: [{label, tone, onclick}].
 */
export function swipeRow(content, actions) {
  const actionsNode = el('div.swiperow__actions', {}, actions.map((a) => el(
    `button.swiperow__action.swiperow__action--${a.tone}`,
    { onclick: () => { close(); a.onclick(); } },
    a.label,
  )));
  const inner = el('div.swiperow__inner', {}, [content]);
  const wrap = el('div.swiperow', {}, [actionsNode, inner]);
  const width = actions.length * SWIPE_ACTION_WIDTH + (actions.length - 1) * SWIPE_ACTION_GAP + SWIPE_ACTION_PAD;

  let startX = 0;
  let scale = 1;
  let baseX = 0;
  let open = false;
  let dragging = false;

  const apply = (x) => { inner.style.transform = `translateX(${x}px)`; };
  const close = () => {
    open = false; inner.style.transition = ''; inner.style.willChange = ''; apply(0);
    if (closeOpenSwipeRow === close) closeOpenSwipeRow = null;
  };

  inner.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (closeOpenSwipeRow && closeOpenSwipeRow !== close) closeOpenSwipeRow();
    startX = event.clientX;
    scale = screenScale();   // khung máy có thể đang thu phóng
    baseX = open ? -width : 0;
    dragging = true;
    inner.style.transition = 'none';
    inner.style.willChange = 'transform';
    inner.setPointerCapture?.(event.pointerId);
  });

  inner.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const x = Math.min(0, Math.max(-width, baseX + (event.clientX - startX) / scale));
    apply(x);
  });

  const end = (event) => {
    if (!dragging) return;
    dragging = false;
    inner.style.transition = '';
    const dx = (event.clientX - startX) / scale;
    const x = Math.min(0, Math.max(-width, baseX + dx));
    open = x < -width / 2;
    apply(open ? -width : 0);
    closeOpenSwipeRow = open ? close : (closeOpenSwipeRow === close ? null : closeOpenSwipeRow);
    // Trở lại đứng yên rồi thì bỏ hint compositor ngay, tránh để lộ đường
    // viền đỏ 1px của nút phía sau khi hàng ở trạng thái nghỉ.
    inner.style.willChange = '';
  };
  inner.addEventListener('pointerup', end);
  inner.addEventListener('pointercancel', end);

  return wrap;
}

// The lesson and quiz players mount themselves, so they need these directly.
export { getOverlayRoot, lockScroll, unlockScroll } from '/shared/client.js';

/**
 * Chép một đoạn chữ vào bộ nhớ tạm. Trình duyệt chặn Clipboard API (khung xem
 * trước, trang không an toàn) thì dùng cách cũ: chọn chữ trong một ô ẩn rồi chép.
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = el('textarea', { readonly: true, style: { position: 'fixed', opacity: '0', top: '0', left: '0' } });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

/** Nút "ID: EK7KQ2M9 ⧉" — bấm để chép mã ID (Heo Dream Team). */
export function friendCodeChip(code, { compact = false } = {}) {
  const label = el('span.idchip__label', {}, t('Đã chép'));
  const chip = el(`button.idchip${compact ? '.idchip--compact' : ''}`, {
    type: 'button',
    'aria-label': t('Sao chép ID {code}', { code }),
    onclick: async (event) => {
      event.stopPropagation();   // nằm trong thẻ hồ sơ bấm được: không mở trang khác
      const ok = await copyText(code);
      chip.classList.toggle('is-copied', ok);
      label.textContent = ok ? t('Đã chép') : t('Chưa chép được');
      setTimeout(() => chip.classList.remove('is-copied'), 1600);
    },
    onkeydown: (event) => event.stopPropagation(),
  }, [
    el('span.idchip__key', {}, 'ID'),
    el('b.idchip__code', {}, code),
    el('span.idchip__copy', { 'aria-hidden': 'true', html: COPY_SVG }),
    label,
  ]);
  return chip;
}

const COPY_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

