/**
 * Tour chỉ dẫn trên màn chủ Ekko Lover: nền tối phủ cả màn, khoét một ô sáng
 * quanh từng chức năng, lần lượt từng cái, kèm một thẻ chú thích ngắn (mục
 * tiêu + tác dụng). Chạy ngay sau khi người dùng xem hết 3 màn onboarding;
 * mở lại riêng bằng `/app/?tour`.
 *
 * Ô sáng là một khối trong suốt có `box-shadow` trải rộng làm nền tối, nên
 * trượt từ chức năng này sang chức năng kia chỉ là đổi vị trí và kích thước.
 * Toạ độ tính theo khung màn hình (`getOverlayRoot()`), vì khung đó là mốc neo
 * của mọi lớp `position: fixed` trong app.
 */
import { el, getOverlayRoot, lockScroll, screenScale, unlockScroll } from '/shared/client.js';
import { t } from './i18n.js';

const STEPS = [
  { target: '.loverhome__navbar', title: 'Hồ sơ của bạn', body: 'Cấp độ, XP và chuỗi ngày học. Học và dùng chức năng mỗi ngày để heo lớn lên.' },
  { target: '.loverhome__tab[data-tone="explore"]', title: 'Học tập', body: 'Bài học vài phút theo lộ trình. Học xong nhận XP, cuối mô đun có trắc nghiệm.' },
  { target: '.loverhome__tab[data-tone="goals"]', title: 'Mục tiêu', body: 'Đặt khoản cần để dành, Ekko chia số tiền mỗi kỳ và theo dõi tiến độ.' },
  { target: '.loverhome__tab[data-tone="budget"]', title: 'Ngân sách', body: 'Đặt hạn mức chi mỗi tháng, Ekko nhắc khi bạn sắp vượt.' },
  { target: '.loverhome__tab[data-tone="expenses"]', title: 'Ghi chép', body: 'Ghi mọi khoản chi để biết tiền đi đâu, xem báo cáo theo tuần và tháng.' },
  { target: '.loverhome__tab[data-tone="savings"]', title: 'Tiết kiệm', body: 'Theo dõi các khoản tiết kiệm và tiền lãi, gửi tiết kiệm cùng Ekko.' },
  { target: '.quickbar', title: 'Ghi nhanh', body: 'Gõ “cà phê 35k” là khoản chi được ghi ngay.' },
  { target: '.botfab', title: 'Ekko bot', body: 'Hỏi mọi điều về tiền bạc, bot trả lời ngay.' },
];

// Ekko Lover: ô ghi nhanh nằm ẩn sau mascot (mascot.js), nên hai bước cuối chỉ
// vào mascot.
const LOVER_STEPS = [
  // Đầu màn chủ Ekko Lover là thẻ hồ sơ đầy đủ thay cho thanh nav nhỏ.
  ...STEPS.filter((s) => s.target !== '.quickbar' && s.target !== '.botfab')
    .map((s) => (s.target === '.loverhome__navbar' ? { ...s, target: '.profilecard--home' } : s)),
  { target: '.botfab', title: 'Ghi nhanh', body: 'Ấn giữ mascot khoảng 2 giây, ô ghi nhanh sẽ trượt ra. Gõ “cà phê 35k” là xong.' },
  { target: '.botfab', title: 'Ekko bot', body: 'Chạm vào mascot để hỏi mọi điều về tiền bạc.' },
];

// Simple mode có màn chủ riêng (home-simple.js): các khối gắn `data-tour`.
const SIMPLE_STEPS = [
  { target: '[data-tour="profile"]', title: 'Hồ sơ của bạn', body: 'Chú heo lớn lên khi bạn học bài và ghi chép mỗi ngày. Bấm vào để xem thành tích.' },
  { target: '[data-tour="voice"]', title: 'Nói để ghi chi tiêu', body: 'Bấm nút này rồi nói, ví dụ “cà phê ba mươi lăm nghìn”. Ekko ghi giúp bạn.' },
  { target: '[data-tour="today"]', title: 'Hôm nay bạn đã chi', body: 'Tổng tiền đã chi hôm nay và vài khoản gần nhất.' },
  { target: '[data-tour="budget"]', title: 'Ngân sách tháng này', body: 'Đã chi bao nhiêu và còn bao nhiêu so với mức bạn đặt.' },
  { target: '[data-tour="features"]', title: 'Các chức năng', body: 'Học tập, Ghi chép, Ngân sách, Mục tiêu và Tiết kiệm. Mỗi hàng có một dòng giải thích.' },
  { target: '.botfab', title: 'Ekko bot', body: 'Hỏi mọi điều về tiền bạc, bot trả lời ngay.' },
];

const PAD = 6;       // ô sáng rộng hơn chức năng một chút cho dễ nhìn
const GAP = 12;      // khoảng cách từ ô sáng tới thẻ chú thích
const EDGE = 16;     // lề hai bên màn hình

let running = null;

const visible = (node) => node && node.getClientRects().length > 0 && getComputedStyle(node).display !== 'none';

/** `onDone`: chạy khi tour kết thúc, kể cả bấm "Bỏ qua" (onboarding.js mở Thông tin cá nhân). */
export function startHomeTour({ onDone = null } = {}) {
  if (running) return;
  const concept = document.documentElement.dataset.concept;
  const list = concept === 'simple' ? SIMPLE_STEPS : concept === 'lover' ? LOVER_STEPS : STEPS;
  const steps = list.filter((s) => visible(document.querySelector(s.target)));
  const scroller = document.getElementById('scroll');
  if (!steps.length) { onDone?.(); return; }

  const root = getOverlayRoot();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let index = 0;

  const hole = el('div.tour__hole', { 'aria-hidden': 'true' });
  const count = el('span.tour__count');
  const title = el('h3.tour__title', { id: 'tour-title' });
  const body = el('p.tour__body', { id: 'tour-body' });
  const skip = el('button.tour__skip', { type: 'button', onclick: () => stop() }, t('Bỏ qua'));
  const next = el('button.btn.btn--sm.tour__next', { type: 'button', onclick: () => go(index + 1) });
  const arrow = el('span.tour__arrow', { 'aria-hidden': 'true' });
  const card = el('div.tour__card', {
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-title', 'aria-describedby': 'tour-body',
  }, [arrow, title, body, el('div.tour__foot', {}, [count, skip, next])]);
  // Chạm vào vùng tối cũng là đi tiếp — không chặn người dùng ở lại một bước.
  const layer = el('div.tour', { onclick: (e) => { if (!card.contains(e.target)) go(index + 1); } }, [hole, card]);
  if (reduceMotion) layer.classList.add('is-still');

  function place() {
    const step = steps[index];
    const target = document.querySelector(step.target);
    if (!target) { go(index + 1); return; }
    // Đo bằng px của cửa sổ rồi chia hệ số thu phóng của khung máy, để ra px
    // bên trong màn hình — nơi đặt ô sáng và thẻ chú thích.
    const k = screenScale();
    const outer = root.getBoundingClientRect();
    const box = { width: root.offsetWidth, height: root.offsetHeight };
    const local = (rect) => ({
      top: (rect.top - outer.top) / k, left: (rect.left - outer.left) / k,
      width: rect.width / k, height: rect.height / k, bottom: (rect.bottom - outer.top) / k,
    });
    // Khối nằm dưới màn hình (màn chủ Simple mode dài hơn một màn): cuộn tới
    // nó trước, chừa chỗ phía trên cho thẻ chú thích.
    if (scroller?.contains(target)) {
      const pre = local(target.getBoundingClientRect());
      // Khối cao hơn nửa màn: đặt thấp xuống, chừa phía trên cho thẻ chú thích
      // (phần dưới của khối có thể khuất, nhưng phần đầu luôn thấy rõ).
      const room = pre.height > box.height * 0.5 ? 236 : 96;
      if (pre.top < 80 || pre.bottom > box.height - 80) {
        scroller.scrollTop += pre.top - room;
      }
    }
    const r = local(target.getBoundingClientRect());
    const x = r.left - PAD;
    const y = r.top - PAD;
    const w = r.width + PAD * 2;
    const h = r.height + PAD * 2;
    const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
    Object.assign(hole.style, {
      left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`,
      borderRadius: `${Math.min(radius + PAD, h / 2)}px`,
    });

    // Thẻ chú thích: dưới ô sáng nếu chức năng ở nửa trên màn, không thì ở trên.
    const below = y + h / 2 < box.height / 2;
    card.classList.toggle('is-below', below);
    card.classList.toggle('is-above', !below);
    const cw = Math.min(box.width - EDGE * 2, 300);
    const cx = Math.max(EDGE, Math.min(box.width - EDGE - cw, x + w / 2 - cw / 2));
    card.style.width = `${cw}px`;
    card.style.left = `${cx}px`;
    if (below) { card.style.top = `${y + h + GAP}px`; card.style.bottom = ''; }
    else { card.style.bottom = `${box.height - y + GAP}px`; card.style.top = ''; }
    arrow.style.left = `${Math.max(18, Math.min(cw - 18, x + w / 2 - cx))}px`;

    // Khối cao (danh sách chức năng) trên máy màn thấp: thẻ chú thích tràn khỏi
    // màn thì kéo nó vào trong, chấp nhận đè lên phần dưới của ô sáng.
    const ch = card.offsetHeight;
    const top = below ? y + h + GAP : box.height - (box.height - y + GAP) - ch;
    if (top + ch > box.height - EDGE) { card.style.top = `${box.height - EDGE - ch}px`; card.style.bottom = ''; arrow.hidden = true; }
    else if (top < EDGE) { card.style.top = `${EDGE}px`; card.style.bottom = ''; arrow.hidden = true; }
    else arrow.hidden = false;
  }

  function render() {
    const step = steps[index];
    count.textContent = `${index + 1}/${steps.length}`;
    title.textContent = t(step.title);
    body.textContent = t(step.body);
    next.textContent = index < steps.length - 1 ? t('Tiếp') : t('Xong');
    place();
    next.focus({ preventScroll: true });
  }

  function go(i) {
    if (i >= steps.length) { stop(); return; }
    index = Math.max(0, i);
    render();
  }

  function onKey(e) {
    if (e.key === 'Escape') stop();
    else if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
  }

  function stop() {
    if (!running) return;
    running = null;
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', onKey);
    layer.remove();
    unlockScroll();
    document.body.classList.remove('is-modal');
    onDone?.();
  }

  running = { stop };
  // Chức năng nằm ở đầu màn chủ: kéo về đầu trước khi đo vị trí.
  scroller?.scrollTo({ top: 0 });
  root.append(layer);
  lockScroll();
  document.body.classList.add('is-modal');
  window.addEventListener('resize', place);
  document.addEventListener('keydown', onKey);
  // Lần đầu đặt thẳng vào chỗ, không trượt từ góc màn hình ra.
  layer.classList.add('is-placing');
  render();
  requestAnimationFrame(() => layer.classList.remove('is-placing'));
}

export const stopHomeTour = () => running?.stop();
