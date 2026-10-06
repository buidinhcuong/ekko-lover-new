/**
 * Full-screen lesson player.
 *
 * Frame kinds map to four renderers. Two of them gate the "Tiếp tục" button:
 * an interactive frame needs every hotspot opened, a quiz needs an answer.
 * That is what makes a completion mean something.
 */
import { api, el, getOverlayRoot, guard, lockScroll, mount, renderText, screenScale, spriteIcon, toast, UI_SPRITE, unlockScroll } from '/shared/client.js';
import { celebrate, celebrateRewards } from '../ui.js';
import { t } from '../i18n.js';

export async function openLesson(lessonId, ctx) {
  const data = await guard(() => api.get(`/api/learn/lessons/${lessonId}`), t('Không mở được bài học'));
  if (!data) return;

  const { lesson, frames } = data;
  if (!frames.length) {
    toast(t('Bài học này chưa có nội dung'), 'error');
    return;
  }

  // Bài đã hoàn thành lưu frame_index = 999 (cột mốc "xong") ở server, nên
  // không thể dùng thẳng để tính slide bắt đầu — clamp sẽ luôn ra slide
  // CUỐI. Học lại một bài đã xong phải bắt đầu lại từ đầu; chỉ bài đang dở
  // (status khác 'completed') mới tiếp tục đúng vị trí đã lưu.
  let index = data.progress?.status === 'completed'
    ? 0
    : Math.min(data.progress?.frame_index ?? 0, frames.length - 1);
  let quizCorrect = 0;
  let quizAnswered = 0;
  let currentNext = null;   // nút "Tiếp tục" của slide đang hiện — kéo sang slide sau cũng theo nó

  const stage = el('div.player__stage');
  const foot = el('div.player__foot');
  const segments = el('div.player__bar');

  // Ekko Lover: cho người học biết trước học xong bài này được bao nhiêu XP.
  const lover = ctx?.world?.concept === 'lover';
  const xpPill = lover && data.xp > 0
    ? el('span.player__xp', { 'aria-label': t('Học xong bài này để nhận +{xp} XP', { xp: data.xp }) }, `+${data.xp} XP`)
    : null;

  const player = el('div.player', { role: 'dialog', 'aria-modal': 'true', 'aria-label': lesson.title }, [
    segments,
    el('div.player__head', {}, [
      el('button.iconbtn', { onclick: close, 'aria-label': t('Đóng bài học') }, spriteIcon('cancel-01', 20, UI_SPRITE)),
      el('strong', {}, `${lesson.module_title} · ${lesson.title}`),
      xpPill,
    ]),
    stage,
    foot,
  ]);

  function close() {
    player.remove();
    unlockScroll();
  }

  function renderSegments() {
    mount(segments, frames.map((_, i) => el(
      `div.player__seg${i < index ? '.player__seg--done' : i === index ? '.player__seg--current' : ''}`,
      {}, [el('i')],
    )));
  }

  function goTo(next) {
    index = next;
    renderSegments();
    renderFrame();
    stage.scrollTo({ top: 0 });
    api.post(`/api/learn/lessons/${lesson.id}/progress`, { frameIndex: index }).catch(() => { /* progress is best-effort */ });
  }

  function renderFrame() {
    const frame = frames[index];
    const isLast = index === frames.length - 1;

    const advance = () => (isLast ? finish() : goTo(index + 1));

    const nextButton = el('button.btn.btn--block', { onclick: advance }, isLast ? t('Hoàn thành bài học') : t('Tiếp tục'));
    const setReady = (ready) => { nextButton.disabled = !ready; };
    currentNext = nextButton;

    // Nút hành động trên slide (vd. "Tạo mục tiêu ngay"): ở slide cuối thì hoàn
    // thành bài rồi mở thẳng chức năng thật để thực hành; ở slide giữa thì chỉ
    // đóng bài và mở chức năng (tiến độ đã lưu, quay lại học tiếp được).
    const onAction = (route) => {
      if (isLast) return finish(route);
      close();
      return ctx.navigate(route);
    };
    mount(stage, renderer(frame, { setReady, onQuizAnswer: recordQuiz, onAction }));

    mount(foot, el('div', { style: { display: 'flex', gap: '10px' } }, [
      index > 0 ? el('button.btn.btn--ghost', { onclick: () => goTo(index - 1), 'aria-label': t('Quay lại') }, [spriteIcon('chevron-left-01-stroke', 20)]) : null,
      nextButton,
    ]));
  }

  // --- kéo ngang để chuyển slide --------------------------------------------
  // Kéo sang trái là slide sau, sang phải là slide trước; nội dung trượt theo
  // tay. Cùng luật với nút: sang slide sau chỉ khi "Tiếp tục" đang bật (đã trả
  // lời câu hỏi, đã mở hết điểm chạm), và slide cuối không kéo để hoàn thành —
  // hoàn thành bài vẫn phải bấm nút. Kéo dọc thì nhường cho cuộn nội dung.
  const SWIPE = 60;           // px tối thiểu để tính là chuyển slide
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let drag = null;
  let swallowClick = false;
  const frameEl = () => stage.firstElementChild;
  const canForward = () => index < frames.length - 1 && currentNext && !currentNext.disabled;
  const canBack = () => index > 0;

  function slide(dir) {
    const out = frameEl();
    if (reduceMotion || !out) { goTo(index + dir); return; }
    out.style.transition = 'transform .18s ease-in, opacity .18s ease-in';
    out.style.transform = `translateX(${-dir * 100}%)`;
    out.style.opacity = '0';
    setTimeout(() => {
      goTo(index + dir);
      const inn = frameEl();
      if (!inn) return;
      inn.style.transition = 'none';
      inn.style.transform = `translateX(${dir * 30}%)`;
      inn.style.opacity = '0';
      void inn.offsetWidth;   // chốt vị trí xuất phát trước khi trượt vào
      inn.style.transition = 'transform .22s ease-out, opacity .22s ease-out';
      inn.style.transform = '';
      inn.style.opacity = '';
    }, 180);
  }

  stage.addEventListener('dragstart', (e) => e.preventDefault());
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // k: khung máy có thể đang thu phóng — đổi px cửa sổ ra px trong màn hình.
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, axis: null, k: screenScale() };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / drag.k;
    const dy = (e.clientY - drag.y) / drag.k;
    if (!drag.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.axis === 'x') {
        stage.setPointerCapture?.(e.pointerId);
        stage.classList.add('is-dragging');
      }
    }
    if (drag.axis !== 'x') return;
    drag.dx = dx;
    // Hết đường (slide đầu, slide cuối, chưa được sang) thì chỉ nhích nhẹ.
    const blocked = (dx < 0 && !canForward()) || (dx > 0 && !canBack());
    const f = frameEl();
    if (f) {
      f.style.transition = 'none';
      f.style.transform = `translateX(${blocked ? dx * 0.25 : dx}px)`;
    }
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dx, axis } = drag;
    drag = null;
    stage.classList.remove('is-dragging');
    if (axis !== 'x') return;
    // Một cú kéo không được tính là chạm vào nút / đáp án bên dưới tay.
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    const dir = dx <= -SWIPE && canForward() ? 1 : dx >= SWIPE && canBack() ? -1 : 0;
    if (dir) { slide(dir); return; }
    const f = frameEl();
    if (f) {
      f.style.transition = reduceMotion ? 'none' : 'transform .2s ease-out';
      f.style.transform = '';
    }
    if (dx <= -SWIPE && index < frames.length - 1) currentNext?.animate?.(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
      { duration: 240 },
    );
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('click', (e) => {
    if (!swallowClick) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  function recordQuiz(correct) {
    quizAnswered += 1;
    if (correct) quizCorrect += 1;
  }

  async function finish(then = '/explore') {
    const result = await guard(
      () => api.post(`/api/learn/lessons/${lesson.id}/complete`, { quizCorrect, quizTotal: quizAnswered }),
      t('Không lưu được kết quả'),
    );
    if (!result) return;

    close();

    if (result.replay) {
      // Học lại không sinh thêm thưởng (đã nhận lần đầu), nhưng vẫn đáng một
      // màn ăn mừng — chỉ báo bằng toast thì cụt hứng cho công sức vừa ôn lại.
      await celebrate({
        title: t('Hoàn thành bài học'),
        subtitle: t('Ôn lại: {title}', { title: lesson.title }),
      });
    } else {
      await celebrateRewards(result.rewards, {
        title: t('Hoàn thành bài học'),
        subtitle: quizAnswered
          ? t('Bạn trả lời đúng {right}/{total} câu hỏi.', { right: quizCorrect, total: quizAnswered })
          : lesson.title,
      });

      if (result.moduleCompleted) {
        await celebrate({
          title: t('Hoàn thành mô-đun'),
          subtitle: t('Bạn đã học xong "{title}".', { title: result.moduleTitle }),
          image: '/assets/lessons/ke-hoach-12-thang.svg',
          stats: result.moduleRewards?.xp ? [`+${result.moduleRewards.xp} XP`] : [],
          badges: result.moduleRewards?.badges || [],
          levelUp: result.moduleRewards?.levelUp || null,
          actionLabel: t('Đi tiếp'),
        });
      }
    }

    await ctx.refreshWorld();

    // Học xong thì về trang Học tập (dù mở bài từ trang chủ hay từ lộ trình),
    // để thấy ngay bài vừa xong sáng lên và bài kế tiếp đã mở — chứ không tự
    // đẩy sang bài sau; học tiếp hay không vẫn là lựa chọn của người học. Nút
    // hành động ở slide cuối thì đưa thẳng tới chức năng nó trỏ tới.
    ctx.navigate(then);
  }

  getOverlayRoot().append(player);
  lockScroll();
  renderSegments();
  renderFrame();
  if (xpPill) toast({ title: t('Học xong bài này để nhận +{xp} XP', { xp: data.xp }) }, 'success');
}

// --- frame renderers -----------------------------------------------------
function renderer(frame, hooks) {
  switch (frame.kind) {
    case 'slide': return slideFrame(frame.payload, hooks);
    case 'interactive': return interactiveFrame(frame.payload, hooks);
    case 'quiz': return quizFrame(frame.payload, hooks);
    default: return textFrame(frame.payload, hooks);
  }
}

function textFrame(payload, { setReady }) {
  setReady(true);
  return el('div.frame', {}, [
    payload.title ? el('h2', {}, payload.title) : null,
    payload.image ? el('img.frame__image', { src: payload.image, alt: payload.imageAlt || '', loading: 'lazy' }) : null,
    payload.caption ? el('p.frame__caption', {}, payload.caption) : null,
    el('div', { html: renderText(payload.body) }),
  ]);
}

/** Đường dẫn hợp lệ cho nút hành động: chỉ các màn trong app (`/goals`...). */
const actionRoute = (route) => (typeof route === 'string' && /^\/[a-z0-9/-]*$/.test(route) ? route : null);

function slideFrame(payload, { setReady, onAction }) {
  setReady(true);
  const route = actionRoute(payload.cta?.route);
  const cta = route && payload.cta?.label
    ? el('button.slide-frame__cta', { type: 'button', onclick: () => onAction?.(route) }, payload.cta.label)
    : null;
  const box = el('div.slide-frame');
  const frame = el('div.frame.frame--slide', {}, [
    box,
    payload.caption ? el('p.frame__caption', {}, payload.caption) : null,
  ]);

  // Ảnh slide nguyên khối, giữ đúng tỉ lệ 1 : 1,371 (concept khác, hoặc slide
  // chưa có trong bảng bố cục — vd. ảnh admin mới tải lên). Ở Ekko Lover thẻ
  // vẫn cao kín màn, phần dư tô bằng màu mép ảnh (xem `fitSlide`).
  const plain = () => mount(box, el('div.slide-frame__art', {}, [
    el('img', { src: payload.image, alt: payload.alt || '', onload: (e) => fitSlide(box, e.currentTarget) }),
    cta,
  ]));

  if (document.documentElement.dataset.concept !== 'lover') { plain(); return frame; }
  Promise.all([slideNatives(), slideLayouts()]).then(([natives, table]) => {
    // Slide dựng lại bằng chữ thật (từ Figma); slide có nút hành động thì
    // giữ nguyên ảnh vì nút được đặt theo vùng chừa sẵn trong ảnh.
    const native = !cta && natives?.[payload.image];
    if (native) { renderNative(box, payload, native); return; }
    const entry = table?.[payload.image];
    if (!entry?.bands?.length) { plain(); return; }
    renderBands(box, payload, entry, cta);
  });
  return frame;
}

// --- Ekko Lover: slide dựng lại bằng chữ thật --------------------------------
// `tools/slide-native.py` chuyển những slide nhiều chữ (xếp bằng ảnh vẫn còn
// khoảng trống lớn) thành các hàng: khối chữ lấy nguyên từ Figma, vùng ảnh cắt
// từ chính slide (minh hoạ, hoặc ô/bảng có chữ bên trong giữ nguyên thiết kế).
// Ở đây dàn các hàng cho vừa thẻ: chữ to hơn bản gốc một chút (tối đa
// NATIVE_TEXT_MAX), minh hoạ phóng to lấp chỗ trống (tối đa NATIVE_ART_MAX),
// phần còn lại chia vào khe quanh minh hoạ và giữa các đoạn.
const NATIVE_TEXT = 1.12, NATIVE_TEXT_MIN = 0.92, NATIVE_TEXT_MAX = 1.2, NATIVE_ART_MAX = 1.7;
const NATIVE_MIN_PX = 13;   // chữ 10px trong Figma vẫn đọc được trên điện thoại
const FW = 350, FH = 480;
let nativeTable = null;
const slideNatives = () => (nativeTable ??= fetch('/assets/lessons/slide-native.json')
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null));

function nativeText(block) {
  const node = el('div.sn-text', { style: { textAlign: block.al === 'justified' ? 'justify' : block.al } });
  let list = null;
  for (const para of block.p) {
    const first = para.runs[0];
    const lh = Math.max(...para.runs.map((r) => r.lh || r.z * 1.35), 0);
    const z0 = first?.z ?? 12;
    const size = (z) => `max(${NATIVE_MIN_PX}px, calc(var(--u) * ${z}))`;
    const p = el(para.li ? 'li' : 'p', {
      style: { fontSize: size(z0), lineHeight: `calc(${size(z0)} * ${((lh || 16) / z0).toFixed(3)})`, marginBottom: `calc(var(--u) * ${block.ps})` },
    }, para.runs.length ? para.runs.map((r) => el('span', {
      style: {
        fontSize: size(r.z), fontWeight: String(r.w), color: r.col,
        fontStyle: r.it ? 'italic' : null, letterSpacing: r.ls ? `calc(var(--u) * ${r.ls})` : null,
        textDecoration: r.td || null, textTransform: r.tc === 'upper' ? 'uppercase' : r.tc === 'lower' ? 'lowercase' : null,
      },
    }, r.c)) : '\u00a0');
    if (para.li) {
      if (!list || list.tagName.toLowerCase() !== para.li) { list = el(para.li); node.append(list); }
      list.append(p);
    } else {
      list = null;
      node.append(p);
    }
  }
  return node;
}

function renderNative(box, payload, spec) {
  box.classList.add('slide-frame--native');
  box.style.setProperty('--slide-fill', spec.bg);
  const src = `url("${payload.image}")`;
  const rows = spec.rows.map((row) => {
    if (row.t === 'text') return { row, node: el('div.sn-row', {}, [nativeText(row)]) };
    if (row.t === 'cols') {
      const total = row.items.reduce((t, it) => t + it.b[2], 0);
      return { row, node: el('div.sn-row.sn-cols', {}, row.items.map((it) => {
        const col = nativeText(it);
        col.style.flex = `${it.b[2] / total} 1 0`;
        return col;
      })) };
    }
    const crop = el('div.sn-crop', { style: { backgroundImage: src } });
    return { row, crop, node: el(`div.sn-row.sn-img${row.bleed ? `.is-bleed-${row.bleed}` : ''}`, {}, [crop]) };
  });
  const body = el('div.sn', {}, rows.map((r) => r.node));
  if (payload.alt) body.setAttribute('aria-label', payload.alt);
  mount(box, body);

  // Khe gốc giữa các hàng trong Figma (đơn vị khung 350 × 480).
  const gaps = rows.map(({ row }, i) => (i ? Math.max(6, row.b[1] - (rows[i - 1].row.b[1] + rows[i - 1].row.b[3])) : 0));
  const isArt = rows.map(({ row }) => row.t === 'img' && row.art);
  const lastGround = rows.length && rows[rows.length - 1].row.ground;
  let last = '';
  let forcedW = 0;   // bề ngang lúc thẻ phải cao theo nội dung (bỏ qua lần đổi cỡ do chính nó gây ra)

  const apply = (k, ts, art, extra) => {
    const u = k * ts;
    body.style.setProperty('--u', `${u}px`);
    body.style.padding = `${Math.min(Math.max(rows[0].row.b[1], 12), 22) * k}px ${20 * k}px ${lastGround ? 0 : 16 * k}px`;
    const inner = box.clientWidth - 40 * k;
    rows.forEach(({ row, node, crop }, i) => {
      node.style.marginTop = i ? `${gaps[i] * u + (extra[i] || 0)}px` : `${extra[0] || 0}px`;
      if (!crop) return;
      // Minh hoạ tràn mép trong thiết kế: vẫn chạm mép thẻ.
      if (row.bleed === 'r') node.style.marginRight = `${-20 * k}px`;
      if (row.bleed === 'l') node.style.marginLeft = `${-20 * k}px`;
      const [x, y, w, h] = row.b;
      const room = row.bleed ? inner + 20 * k : inner;
      const s = Math.min(row.art ? u * art : u, room / w);
      Object.assign(crop.style, {
        width: `${w * s}px`, height: `${h * s}px`,
        backgroundSize: `${FW * s}px ${FH * s}px`,
        backgroundPosition: `${-x * s}px ${-y * s}px`,
      });
    });
    // `.sn` luôn cao bằng thẻ nên đo theo đáy hàng cuối, không dùng scrollHeight.
    const end = body.lastElementChild;
    return end.offsetTop + end.offsetHeight + parseFloat(body.style.paddingBottom || 0);
  };

  const place = () => {
    const W = box.clientWidth;
    if (forcedW && W === forcedW) return;
    forcedW = 0;
    box.style.minHeight = '';
    const H = box.clientHeight;
    if (!W || !H) return;
    const key = `${W}x${H}`;
    if (key === last) return;
    last = key;
    const k = W / FW;
    const none = [];
    const fits = (ts, art) => apply(k, ts, art, none) <= H;
    // 1. cỡ chữ: bắt đầu từ NATIVE_TEXT, nhỏ dần nếu tràn
    let ts = NATIVE_TEXT;
    while (ts > NATIVE_TEXT_MIN && !fits(ts, 1)) ts -= 0.02;
    // 2. còn chỗ: phóng minh hoạ; slide không có minh hoạ thì tăng chữ thêm
    let art = 1;
    if (isArt.some(Boolean)) {
      if (fits(ts, 1)) {
        let lo = ts, hi = NATIVE_TEXT_MAX;
        for (let i = 0; i < 8; i += 1) { const mid = (lo + hi) / 2; if (apply(k, mid, 1, none) <= H * 0.86) lo = mid; else hi = mid; }
        ts = Math.max(ts, lo);
      }
      let lo = 1, hi = NATIVE_ART_MAX;
      for (let i = 0; i < 12; i += 1) { const mid = (lo + hi) / 2; if (fits(ts, mid)) lo = mid; else hi = mid; }
      art = lo;
    } else {
      let lo = ts, hi = NATIVE_TEXT_MAX;
      for (let i = 0; i < 10; i += 1) { const mid = (lo + hi) / 2; if (apply(k, mid, 1, none) <= H * 0.96) lo = mid; else hi = mid; }
      ts = lo;
    }
    // 3. phần dư: chia vào khe quanh minh hoạ (nặng gấp đôi) và giữa các đoạn
    const used = apply(k, ts, art, none);
    let left = Math.max(0, H - used);
    const extra = new Array(rows.length).fill(0);
    if (isArt.some(Boolean)) {
      const weights = rows.map((_, i) => (i === 0 ? 0 : (isArt[i] || isArt[i - 1] ? 2 : 1)));
      const sum = weights.reduce((a, b) => a + b, 0);
      weights.forEach((wt, i) => {
        if (!wt) return;
        const share = (left * wt) / sum;
        extra[i] = isArt[i] || isArt[i - 1] ? share : Math.min(48 * k, share);
      });
    } else if (rows.length > 1) {
      // Không có minh hoạ (bảng, ô chữ đã sát lề): chia đều cho các khe và đáy thẻ.
      const share = left / rows.length;
      for (let i = 1; i < rows.length; i += 1) extra[i] = Math.min(64 * k, share);
    }
    left -= extra.reduce((a, b) => a + b, 0);
    // Minh hoạ chạm đáy: dồn nốt phần dư lên trên nó để hình bám đáy thẻ.
    if (lastGround && left > 0) extra[rows.length - 1] += left;
    const final = apply(k, ts, art, extra);
    // Nhỏ hết mức vẫn tràn (màn quá thấp): thẻ cao theo nội dung, khung bài học cuộn.
    if (final > H + 1) { forcedW = W; box.style.minHeight = `${final}px`; }
  };
  new ResizeObserver(place).observe(box);
  (document.fonts?.ready ?? Promise.resolve()).then(() => { last = ''; place(); });
}

// --- Ekko Lover: xếp lại nội dung slide cho vừa màn -------------------------
// Slide là ảnh 700 × 960 vẽ sẵn chữ và minh hoạ trên nền một màu; thẻ trên
// màn thì cao hơn tỉ lệ đó. `tools/slide-layout.py` tách sẵn mỗi ảnh thành
// các khối nằm ngang (tiêu đề, đoạn chữ, bảng, minh hoạ). Ở đây mỗi khối là
// một lát cắt của chính ảnh đó, đặt lại vị trí và cỡ:
//   1. chữ to thêm một mức chung (TEXT_SCALE), không lấn lề TEXT_MARGIN;
//   2. minh hoạ đứng riêng phóng to tới ART_MAX, theo tâm của nó;
//   3. khe giữa hai phần chữ được nới thêm, khe trong một danh sách giữ nguyên;
//   4. phần còn lại chia cho khoảng quanh minh hoạ (hoặc cuối thẻ nếu không
//      có minh hoạ). Minh hoạ chạm đáy ảnh thì vẫn bám đáy thẻ.
const NW = 700, NH = 960;
const TEXT_SCALE = 1.05, TEXT_MARGIN = 22, ART_MAX = 1.25, ART_MARGIN = 36;
let layoutTable = null;
const slideLayouts = () => (layoutTable ??= fetch('/assets/lessons/slide-layout.json')
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null));

export function layoutSlide(entry, Hn, hasCta = false) {
  const { bands } = entry;
  const n = bands.length;
  const E = Hn - NH;
  const h = (b) => b[1] - b[0];
  const w = (b) => b[3] - b[2];
  if (E <= 0 || !n) return bands.map((b) => ({ b, y: b[0], s: 1, ax: NW / 2 }));

  const art = new Set(bands.map((b, i) => i).filter((i) => {
    const b = bands[i];
    return h(b) >= 120 && b[5] < 0.12 && (w(b) < 560 || h(b) >= 250);
  }));
  const grow = new Set([...art].filter((i) => !bands[i][6] && w(bands[i]) < 600));

  const scale = new Array(n).fill(1);
  const anchor = new Array(n).fill(NW / 2);
  const others = bands.map((b, i) => i).filter((i) => !grow.has(i));
  const sumOthers = others.reduce((t, i) => t + h(bands[i]), 0) || 1;
  const t = Math.min(TEXT_SCALE, 1 + 0.35 * E / sumOthers);
  for (const i of others) scale[i] = Math.max(1, Math.min(t, (NW - 2 * TEXT_MARGIN) / w(bands[i])));

  if (grow.size) {
    const used = others.reduce((sum, i) => sum + (scale[i] - 1) * h(bands[i]), 0);
    const sumGrow = [...grow].reduce((sum, i) => sum + h(bands[i]), 0);
    let s = Math.min(ART_MAX, 1 + 0.5 * (E - used) / sumGrow);
    for (const i of grow) s = Math.min(s, (NW - 2 * ART_MARGIN) / w(bands[i]));
    s = Math.max(t, s);
    for (const i of grow) { scale[i] = s; anchor[i] = (bands[i][2] + bands[i][3]) / 2; }
  }

  let R = E - bands.reduce((sum, b, i) => sum + (scale[i] - 1) * h(b), 0);
  const gaps = [bands[0][0], ...bands.slice(1).map((b, i) => b[0] - bands[i][1]), NH - bands[n - 1][1]];
  const add = new Array(n + 1).fill(0);
  const grounded = gaps[n] < 10;

  const textGaps = [];
  for (let i = 1; i < n; i += 1) if (!art.has(i) && !art.has(i - 1) && gaps[i] >= 40) textGaps.push(i);
  for (const i of textGaps) add[i] = Math.min(24, Math.max(0, R) / (textGaps.length + 2));
  R -= add.reduce((a, b) => a + b, 0);

  const slots = new Set();
  for (const i of art) { slots.add(i); if (i + 1 < n) slots.add(i + 1); }
  if (!art.size) {
    // Không có minh hoạ: chia đều cho các khe giữa các phần (khe rộng, không
    // phải khe trong danh sách) và đáy thẻ, mỗi khe tối đa 80 đơn vị.
    const wide = [];
    for (let i = 1; i < n; i += 1) if (gaps[i] >= 40) wide.push(i);
    const share = Math.max(0, R) / (wide.length + 1);
    for (const i of wide) { const a = Math.min(80, share); add[i] += a; R -= a; }
  }
  if (!grounded && !hasCta) slots.add(n);
  if (!slots.size) slots.add(grounded ? 0 : n);
  for (const j of slots) add[j] += Math.max(0, R) / slots.size;

  let y = gaps[0] + add[0];
  return bands.map((b, i) => {
    const item = { b, y, s: scale[i], ax: anchor[i] };
    y += h(b) * scale[i] + gaps[i + 1] + add[i + 1];
    return item;
  });
}

function renderBands(box, payload, entry, cta) {
  box.classList.add('slide-frame--bands');
  box.style.setProperty('--slide-fill', entry.bg);
  box.setAttribute('role', 'img');
  if (payload.alt) box.setAttribute('aria-label', payload.alt);
  const layer = el('div.slide-frame__bands', { 'aria-hidden': 'true' });
  mount(box, layer, cta);
  const src = `url("${payload.image}")`;
  let last = '';
  const place = () => {
    const cw = box.clientWidth, ch = box.clientHeight;
    if (!cw || !ch) return;
    const key = `${cw}x${ch}`;
    if (key === last) return;
    last = key;
    const k = cw / NW;
    mount(layer, layoutSlide(entry, ch / k, !!cta).map(({ b, y, s, ax }) => el('div.slide-band', {
      style: {
        left: `${ax * k * (1 - s)}px`,
        top: `${y * k}px`,
        width: `${NW * k * s}px`,
        height: `${(b[1] - b[0]) * k * s}px`,
        backgroundImage: src,
        backgroundSize: `${NW * k * s}px ${NH * k * s}px`,
        backgroundPosition: `0 ${-b[0] * k * s}px`,
      },
    })));
    // Nút hành động nằm ở vùng chừa sẵn dưới đáy slide: cách đáy 40 / 960.
    if (cta) cta.style.bottom = `${40 * k}px`;
  };
  new ResizeObserver(place).observe(box);
  requestAnimationFrame(place);
}

// Slide chưa có trong bảng bố cục: thẻ cao hơn ảnh, phần dư phải nối liền với
// ảnh nên lấy màu ở mép ảnh. Mép dưới một màu thì giữ ảnh ở trên, nối nền
// xuống dưới; hình chạm đáy thì giữ ảnh bám đáy và nối nền lên trên.
const slideFill = new Map();   // src -> { anchor, color }

function edgeColor(data, width, y) {
  let r = 0, g = 0, b = 0;
  const lo = [255, 255, 255], hi = [0, 0, 0];
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    const px = [data[i], data[i + 1], data[i + 2]];
    r += px[0]; g += px[1]; b += px[2];
    px.forEach((v, c) => { lo[c] = Math.min(lo[c], v); hi[c] = Math.max(hi[c], v); });
  }
  const flat = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) <= 12;
  return { flat, color: `rgb(${Math.round(r / width)} ${Math.round(g / width)} ${Math.round(b / width)})` };
}

function measureSlide(img) {
  const W = 70, H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const { data } = g.getImageData(0, 0, W, H);
  const bottom = edgeColor(data, W, H - 1);
  if (bottom.flat) return { anchor: 'top', color: bottom.color };
  const top = edgeColor(data, W, 0);
  if (top.flat) return { anchor: 'bottom', color: top.color };
  return { anchor: 'center', color: bottom.color };
}

function fitSlide(box, img) {
  let fill = slideFill.get(img.src);
  if (!fill) {
    try { fill = measureSlide(img); } catch { fill = { anchor: 'top', color: '' }; }  // ảnh khác nguồn: không đọc được điểm ảnh
    slideFill.set(img.src, fill);
  }
  box.dataset.anchor = fill.anchor;
  if (fill.color) box.style.setProperty('--slide-fill', fill.color);
}

function interactiveFrame(payload, { setReady }) {
  const hotspots = payload.hotspots || [];
  const seen = new Set();
  setReady(hotspots.length === 0);

  const note = el('div.hotspot-note', { hidden: true });
  const counter = el('p.frame__caption', {}, t('Đã xem {seen}/{total} điểm', { seen: 0, total: hotspots.length }));

  const wrap = el('div.hotspot-wrap', {}, [
    el('img', { src: payload.image, alt: payload.alt || '', loading: 'lazy' }),
    ...hotspots.map((spot, i) => el('button.hotspot', {
      style: { left: `${spot.x}%`, top: `${spot.y}%` },
      dataset: { seen: 'false' },
      'aria-label': spot.label,
      onclick: (event) => {
        seen.add(i);
        event.currentTarget.dataset.seen = 'true';
        note.hidden = false;
        mount(note, el('strong', {}, spot.label), el('p', {}, spot.text));
        counter.textContent = t('Đã xem {seen}/{total} điểm', { seen: seen.size, total: hotspots.length });
        if (seen.size === hotspots.length) setReady(true);
      },
    }, String(i + 1))),
  ]);

  return el('div.frame', {}, [
    payload.title ? el('h2', {}, payload.title) : null,
    payload.intro ? el('p', {}, payload.intro) : null,
    wrap,
    counter,
    note,
  ]);
}

function quizFrame(payload, { setReady, onQuizAnswer }) {
  setReady(false);
  const options = payload.options || [];
  let answered = false;

  const explain = el('div.quiz-explain', { hidden: true });

  const buttons = options.map((option, i) => el('button.quiz-option', {
    onclick: (event) => {
      if (answered) return;
      answered = true;
      onQuizAnswer(Boolean(option.correct));

      buttons.forEach((btn, j) => {
        if (options[j].correct) btn.dataset.state = 'correct';
        else if (j === i) btn.dataset.state = 'wrong';
        btn.disabled = true;
      });

      explain.hidden = false;
      explain.textContent = option.explain
        || (option.correct ? t('Chính xác.') : t('Chưa đúng. Đáp án đúng đã được tô sáng.'));
      setReady(true);
      event.currentTarget.scrollIntoView({ block: 'nearest' });
    },
  }, [
    el('i', {}, String.fromCharCode(65 + i)),
    el('span', {}, option.text),
  ]));

  return el('div.frame', {}, [
    el('h2', {}, payload.question),
    ...buttons,
    explain,
  ]);
}
