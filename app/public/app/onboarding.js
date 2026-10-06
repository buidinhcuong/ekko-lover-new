/**
 * Ba màn giới thiệu khi người dùng vào Ekko Lover (và bản sao Ekko Lover
 * Colors) lần đầu.
 *
 * Dựng theo mẫu "Giới thiệu tính năng" của app Ekko trong Figma (🌊 Ekko - User
 * Interface · UI Version 2.0): bottom sheet trắng trên nền tối, nút ✕ góc phải,
 * tiêu đề chung, ảnh điện thoại có thẻ phóng to nổi lên, tên tính năng màu
 * xanh, một đoạn mô tả và chấm trang. Thêm một nút "Tiếp tục" ở đáy để người
 * không quen vuốt vẫn đi hết được.
 *
 * Ảnh minh hoạ là màn hình thật của từng concept, ghép sẵn ở
 * `/assets/onboarding/<concept>/<n>.png` (264 × 452, xuất @3x).
 *
 * Đã xem hay chưa lưu ở server (`user_state.lover_intro_at`). Bản demo trên
 * Vercel dựng lại DB mỗi lần khởi động nguội; khi đó server tự đánh dấu "đã
 * xem" cho người dùng được khôi phục từ cookie, nên không cần nhớ gì ở máy.
 * Mở `/app/?intro` để xem lại (tham số được gỡ khỏi địa chỉ ngay sau đó).
 *
 * Xem hết 3 màn thì tour chỉ dẫn trên màn chủ chạy tiếp (xem `tour.js`).
 */
import { api, el, getOverlayRoot, lockScroll, screenScale, uiIcon, unlockScroll } from '/shared/client.js';
import { t } from './i18n.js';
import { startHomeTour } from './tour.js';

// Simple mode: cùng ba ý nhưng tả đúng màn của nó (danh sách chức năng, nói để ghi).
const SIMPLE_STEPS = [
  {
    title: 'Học để heo lên cấp',
    body: 'Mỗi bài học chỉ vài phút. Học xong bạn nhận XP, chú heo của bạn lớn dần qua từng cấp và chuỗi ngày học luôn giữ lửa.',
  },
  {
    title: 'Năm chức năng, ghi chú rõ ràng',
    body: 'Học tập, Ghi chép, Ngân sách, Mục tiêu và Tiết kiệm xếp thành danh sách, mỗi hàng có một dòng giải thích.',
  },
  {
    title: 'Nói để ghi chi tiêu',
    body: 'Bấm nút micro rồi nói, ví dụ “cà phê ba mươi lăm nghìn”. Ekko đọc lại để bạn kiểm tra rồi mới lưu.',
  },
];

const STEPS = [
  {
    title: 'Học để heo lên cấp',
    body: 'Mỗi bài học chỉ vài phút. Học xong bạn nhận XP, chú heo của bạn lớn dần qua từng cấp và chuỗi ngày học luôn giữ lửa.',
  },
  {
    title: 'Bốn công cụ quản lý tiền',
    body: 'Đặt Mục tiêu, lập Ngân sách, Ghi chép chi tiêu và theo dõi Tiết kiệm ngay trên màn chính, áp dụng liền điều vừa học.',
  },
  {
    title: 'Ghi nhanh, hỏi Ekko bot',
    body: 'Gõ như nói chuyện, ví dụ “cà phê 35k”, là khoản chi được ghi ngay. Có thắc mắc về tiền bạc? Chạm vào Ekko bot để hỏi bất cứ lúc nào.',
  },
];

let open = false;

/**
 * Mở onboarding nếu người dùng chưa xem. Gọi mỗi lần màn chủ của Ekko Lover
 * hiện ra; chỉ lần đầu là có tác dụng.
 */
export function maybeShowLoverIntro(world) {
  if (open) return;
  const params = new URLSearchParams(location.search);
  const forced = params.has('intro');
  const tourOnly = params.has('tour');
  if (forced || tourOnly) {
    // Chỉ mở lại một lần: tải lại trang thì theo đúng trạng thái đã xem.
    params.delete('intro');
    params.delete('tour');
    const query = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }
  if (tourOnly && !forced) { requestAnimationFrame(() => startHomeTour()); return; }
  if (!forced && world?.onboarding?.lover) return;
  showLoverIntro(world);
}

function markSeen(world) {
  if (world?.onboarding) world.onboarding.lover = true;
  api.post('/api/me/onboarding', { key: 'lover' }).catch(() => { /* lần sau thử lại */ });
}

export function showLoverIntro(world) {
  // Mỗi concept một bộ ảnh minh hoạ chụp từ chính màn của nó.
  const concept = ['lover-colors', 'simple'].includes(world?.concept) ? world.concept : 'lover';
  const steps = concept === 'simple' ? SIMPLE_STEPS : STEPS;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let index = 0;

  const panes = steps.map((step, i) => el('section.onboard__pane', {
    'aria-roledescription': t('màn'),
    'aria-label': t('Màn {n} / {total}', { n: i + 1, total: steps.length }),
    'aria-hidden': i === 0 ? null : 'true',
  }, [
    el('div.onboard__art', {}, [
      el('img', { src: `/assets/onboarding/${concept}/${i + 1}.png`, alt: '', draggable: 'false', loading: i === 0 ? 'eager' : 'lazy' }),
    ]),
    el('h3.onboard__title', {}, t(step.title)),
    el('p.onboard__body', {}, t(step.body)),
  ]));
  const track = el('div.onboard__track', {}, panes);
  const viewport = el('div.onboard__viewport', {}, [track]);

  const dots = steps.map((_, i) => el('button.onboard__dot', {
    type: 'button',
    'aria-label': t('Màn {n} / {total}', { n: i + 1, total: steps.length }),
    onclick: () => goTo(i),
  }));
  const next = el('button.btn.btn--block.onboard__next', { type: 'button', onclick: () => (index < steps.length - 1 ? goTo(index + 1) : close()) });

  const backdrop = el('div.sheet-backdrop.onboard__backdrop', { onclick: () => close() });
  const panel = el('div.sheet.onboard', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Chào mừng bạn đến với Học tập!') }, [
    el('div.onboard__head', {}, [
      el('button.onboard__close', { type: 'button', onclick: () => close(), 'aria-label': t('Đóng') }, uiIcon('cancel-01', 16)),
    ]),
    el('h2.onboard__heading', {}, t('Chào mừng bạn đến với Học tập!')),
    viewport,
    el('div.onboard__dots', {}, dots),
    el('div.onboard__foot', {}, [next]),
  ]);

  function render(animate = true) {
    track.style.transition = animate && !reduceMotion ? 'transform .32s cubic-bezier(.16, 1, .3, 1)' : 'none';
    track.style.transform = `translateX(${-index * 100}%)`;
    panes.forEach((p, i) => { p.toggleAttribute('inert', i !== index); p.setAttribute('aria-hidden', i === index ? 'false' : 'true'); });
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === index);
      d.setAttribute('aria-current', i === index ? 'step' : 'false');
    });
    next.textContent = index < steps.length - 1 ? t('Tiếp tục') : t('Bắt đầu học');
  }

  function goTo(i) {
    index = Math.max(0, Math.min(steps.length - 1, i));
    render();
  }

  function close() {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    panel.remove();
    unlockScroll();
    document.body.classList.remove('is-sheet');
    markSeen(world);
    // Xem tới màn cuối thì dẫn đi một vòng màn chủ, chỉ từng chức năng một.
    // Đóng giữa chừng (✕, chạm nền) nghĩa là muốn tự khám phá: không làm phiền.
    if (index === steps.length - 1) requestAnimationFrame(() => startHomeTour());
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') goTo(index + 1);
    else if (e.key === 'ArrowLeft') goTo(index - 1);
  }

  // Vuốt ngang để chuyển màn; vuốt quá màn đầu/cuối thì chỉ nhích nhẹ.
  const SWIPE = 50;
  let drag = null;
  viewport.addEventListener('dragstart', (e) => e.preventDefault());
  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, axis: null, k: screenScale() };
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / drag.k;
    const dy = (e.clientY - drag.y) / drag.k;
    if (!drag.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.axis === 'x') viewport.setPointerCapture?.(e.pointerId);
    }
    if (drag.axis !== 'x') return;
    drag.dx = dx;
    const edge = (dx > 0 && index === 0) || (dx < 0 && index === steps.length - 1);
    track.style.transition = 'none';
    track.style.transform = `translateX(calc(${-index * 100}% + ${edge ? dx * 0.25 : dx}px))`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dx, axis } = drag;
    drag = null;
    if (axis !== 'x') return;
    if (dx <= -SWIPE) goTo(index + 1);
    else if (dx >= SWIPE) goTo(index - 1);
    else render();
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  open = true;
  getOverlayRoot().append(backdrop, panel);
  lockScroll();
  document.body.classList.add('is-sheet');
  document.addEventListener('keydown', onKey);
  render(false);
  next.focus({ preventScroll: true });
}
