/**
 * Khám phá · concept "Ekko Lover" — theo Figma "[Ekko UI] - User Interface",
 * trang Học tập.
 *
 * Mỗi mô-đun là một thanh tiêu đề xanh lá, bên dưới là "con đường" nét dày
 * uốn lượn như đường mòn: đi ngang qua từng nút và giữ nguyên hướng, tới gần mép
 * thì vòng một khúc cong mềm rồi quay lại qua nút kế tiếp. Nút lệch vị trí và
 * khúc vòng rộng hẹp mỗi chỗ một khác — không có đoạn thẳng hay nửa vòng tròn
 * cứng như bản đầu. Đoạn đường nối các bài đã học xong tô xanh payday blue, phần
 * còn lại xanh ngọc nhạt. Nút bài học là hình tròn 56px viền trắng với icon
 * Solid, tên bài nằm dưới; bài đã học màu payday blue, chưa học màu xám.
 * Học tuần tự: chỉ bài chưa xong đầu tiên mở, bài sau khoá (server chặn cả API).
 * Trắc nghiệm cuối mô-đun đã làm thì gắn ngôi sao ghi số câu đúng.
 *
 * Đường vẽ bằng SVG theo đúng bề ngang thật của khung (đo lại khi đổi cỡ),
 * nên đường cong không bị kéo méo như khi co giãn viewBox.
 */
import { api, el, screenScale, spriteIcon, toast, UI_SPRITE, uiIcon } from '/shared/client.js';
import { t } from '../i18n.js';
import { openModuleQuiz } from './quiz.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// Khoảng cách giữa hai hàng tính theo TỪNG bài: nửa nút + khoảng nút–chữ + chiều
// cao thật của tên bài (1–3 dòng) + một khoảng chừa cho đoạn đường vòng về nút
// dưới (các số `--lrn-*` trong CSS). Tên ngắn thì hàng thấp, một màn hình thấy
// được nhiều bài hơn. Chỉ Ekko Lover dùng kiểu này; concept khác dùng hàng đều
// `--lrn-row`.
const cssNumber = (name, fallback) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || fallback;
// Lề hai bên và khúc quanh tính theo bề rộng THẬT của tên bài (CSS
// `--lrn-label-w`: 170px, Simple mode 190px), đo lúc vẽ — xem `draw()`.
// Vị trí ngang của các bài ở giữa (0 = sát trái, 1 = sát phải trong vùng cho
// phép) và độ vươn của khúc quanh so với nút xa nhất hai bên — lặp theo chu kỳ
// để đường uốn không đều, như một lối mòn.
const SWAY = [0.62, 0.3, 0.7, 0.42, 0.55, 0.26, 0.66, 0.38];
const REACH = [96, 84, 112, 90, 104, 86, 118, 92];
const SIDE = 24;          // khúc quanh không vươn sát mép hơn mức này
const TOP = 40;           // tâm nút đầu tiên cách đỉnh khung đường
const BOTTOM_PAD = 16;    // dưới tên bài của nút cuối

// Icon Solid của từng bài, lần lượt theo thứ tự trên lộ trình (đúng bộ icon
// trong Figma). Trắc nghiệm luôn dùng notification-square.
const LESSON_ICONS = ['check-list', 'target-02', 'whiteboard', 'clipboard', 'tips', 'save-money-dollar',
  'savings', 'money-bag-02', 'money-saving-jar', 'bank', 'chart-breakout-square', 'building-05', 'shield-02', 'shield-user'];
const solidIcon = (name) => spriteIcon(`${name}-solid`, 28, UI_SPRITE);

export default function exploreLover(ctx, { entries }) {
  // Gom chặng theo mô-đun: [{ module, stops: [entry…] }].
  const groups = [];
  for (const entry of entries) {
    if (entry.type === 'module') groups.push({ module: entry, stops: [] });
    else groups.at(-1)?.stops.push(entry);
  }

  // Heo chỉ đứng ở MỘT chỗ trên cả lộ trình: trước bài đang tới lượt; hết bài
  // để học thì trước bài trắc nghiệm đầu tiên đã mở mà chưa làm.
  const here = entries.find((e) => e.type === 'lesson' && e.current)
    || entries.find((e) => e.type === 'quiz' && !e.locked && !e.completed);

  let lessonIndex = 0;
  const iconsOf = (stops) => stops.map((stop) => (stop.type === 'quiz' ? 'notification-square' : LESSON_ICONS[lessonIndex++ % LESSON_ICONS.length]));

  // Ekko Lover: một con đường liền qua mọi mô-đun (bài cuối của mô-đun này nối
  // thẳng vào bài đầu của mô-đun sau), tên mô-đun là MỘT thanh dính ở đầu màn,
  // đổi theo mô-đun đang cuộn tới. Các concept dựng trên Ekko Lover (Colors,
  // Simple mode) giữ kiểu mỗi mô-đun một đoạn đường riêng.
  const board = ctx.world?.concept === 'lover'
    ? continuousMap(ctx, groups, here, iconsOf)
    : el('div.lrnmap', {}, groups.map(({ module, stops }) => moduleSection(ctx, module, stops, iconsOf(stops), stops.indexOf(here))));
  requestAnimationFrame(() => scrollToCurrent(board));
  return el('div.screen__body.lrnbody', {}, [board]);
}

const moduleHead = (module) => el(`div.lrnhead${module.locked ? '.is-locked' : ''}`, {}, [
  module.locked ? uiIcon('square-lock-02', 20) : null,
  el('span', {}, module.title),
]);

/**
 * Bản đồ liền của Ekko Lover. Thanh tên mô-đun dính ở đầu và đổi nội dung khi
 * bài đầu tiên của mô-đun kế tiếp cuộn lên chạm tới nó — không còn thanh nào
 * chen giữa đường, nên đường đi một mạch từ bài đầu tới bài cuối.
 */
function continuousMap(ctx, groups, here, iconsOf) {
  const filled = groups.filter((g) => g.stops.length);
  const stops = filled.flatMap((g) => g.stops);
  const icons = iconsOf(stops);
  // Nhãn gọn: bài chưa học chỉ có icon; bài đã học ghi vị trí "Mô đun 1 - Bài 1"
  // (trắc nghiệm: "Mô đun 1 - Trắc nghiệm"). Riêng bài đang học (chỗ chú heo
  // đứng) hiện tên đầy đủ. Tên đầy đủ của mọi bài vẫn ở aria-label.
  const labels = filled.flatMap(({ module, stops: list }) => {
    let lesson = 0;
    return list.map((stop) => {
      if (stop.type !== 'quiz') lesson += 1;
      if (stop === here) return stop.type === 'quiz' ? t('Trắc nghiệm kiến thức') : stop.title;
      if (!stop.completed) return '';
      return stop.type === 'quiz'
        ? t('Mô đun {m} - Trắc nghiệm', { m: module.order_index })
        : t('Mô đun {m} - Bài {n}', { m: module.order_index, n: lesson });
    });
  });
  const starts = [];
  let index = 0;
  for (const g of filled) { starts.push({ module: g.module, index }); index += g.stops.length; }

  const road = buildRoad(ctx, stops, icons, stops.indexOf(here), 0, labels);
  const head = el('div.lrnhead.lrnhead--live', { role: 'heading', 'aria-level': '2' });
  let shown = null;
  const show = (module) => {
    if (!module || module === shown) return;
    shown = module;
    head.className = `lrnhead lrnhead--live${module.locked ? ' is-locked' : ''}`;
    head.replaceChildren(...moduleHead(module).childNodes);
  };
  show(starts[0]?.module);

  // Mô-đun hiện tại = mô-đun cuối cùng có bài đầu đã lên tới (hoặc qua) đáy thanh tên.
  const scroller = document.getElementById('scroll');
  const nodes = road.querySelectorAll('.lrnstop');
  const update = () => {
    if (!head.isConnected) { scroller?.removeEventListener('scroll', update); return; }
    const line = head.getBoundingClientRect().bottom + 8;
    let current = starts[0];
    for (const s of starts) {
      if (nodes[s.index].getBoundingClientRect().top <= line) current = s;
      else break;
    }
    show(current?.module);
  };
  scroller?.addEventListener('scroll', update, { passive: true });
  requestAnimationFrame(() => requestAnimationFrame(update));

  return el('div.lrnmap.lrnmap--continuous', {}, [head, road]);
}

function moduleSection(ctx, module, stops, icons, hereIndex = -1) {
  const sway = (module.order_index || 0) * 3;   // mỗi mô-đun uốn một kiểu
  const header = moduleHead(module);
  if (!stops.length) return el('section.lrnmodule', {}, [header]);
  return el('section.lrnmodule', {}, [header, buildRoad(ctx, stops, icons, hereIndex, sway)]);
}

/**
 * Một đoạn đường qua `stops`: nút, đường SVG, đoạn đã đi và chú heo.
 * `labels` (tuỳ chọn) thay tên bài dưới nút; chuỗi rỗng = chỉ hiện icon.
 */
function buildRoad(ctx, stops, icons, hereIndex, sway, labels = null) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'lrnroad__svg');
  svg.setAttribute('aria-hidden', 'true');
  const rest = document.createElementNS(SVG_NS, 'path');
  rest.setAttribute('class', 'lrnroad__rest');
  const walked = document.createElementNS(SVG_NS, 'path');
  walked.setAttribute('class', 'lrnroad__walked');
  svg.append(rest, walked);

  const nodes = stops.map((entry, i) => stopNode(ctx, entry, icons[i], labels ? labels[i] : undefined));
  // Chiều cao tạm (mỗi hàng 150px) cho tới khi `draw()` đo được tên bài.
  const road = el('div.lrnroad', { style: { height: `${TOP + stops.length * 150}px` } }, [svg, ...nodes]);

  // Đường đậm đi tới chặng XA NHẤT đã hoàn thành và kéo tới luôn bài kế tiếp
  // nếu bài đó đã mở — học xong bài trước là con đường tới bài sau sáng lên.
  // Bài trắc nghiệm không chặn việc học tiếp, nên một bài trắc nghiệm bỏ qua
  // (nút vẫn xám) không làm đứt đường của các bài đã học phía sau nó. Từ bài
  // kế tiếp trở đi là đường nhạt.
  let reached = -1;
  stops.forEach((stop, i) => { if (stop.completed) reached = i; });
  const next = stops[reached + 1];
  const lit = reached >= 0 && next && !next.locked ? reached + 1 : reached;

  // Heo cấp độ hiện tại của người học đứng trên quãng đường giữa bài vừa học
  // xong và bài đang tới lượt — "bạn đang ở đây".
  const level = ctx.world?.level;
  const pig = lit > reached && hereIndex === reached + 1
    ? el('img.lrnroad__pig', {
      src: level?.character_image || '/assets/levels/pig-1.png',
      alt: t('Heo của bạn: {name}', { name: level?.name || '' }),
    })
    : null;
  if (pig) road.append(pig);

  const draw = () => {
    const width = road.clientWidth;
    if (!width) return;
    // Hai đầu mô-đun neo sát lề cho cân: bài đầu sát trái; nút cuối (trắc
    // nghiệm) nằm đối diện khúc quanh cuối — quanh bên phải thì nút sát trái,
    // quanh bên trái thì sát phải. Bài ở giữa đứng quanh giữa, lệch mỗi bài một
    // khác, trong khoảng còn chỗ cho khúc quanh hai bên.
    const last = stops.length - 1;
    // Tâm nút không sát mép hơn nửa tên bài (+4); khúc quanh cách tâm nút ít
    // nhất nửa tên bài + nửa bề rộng đường (10) + 10, để đường không cắt chữ.
    // Đọc từ CSS chứ không đo nút: nút chỉ có icon thì hẹp hơn tên bài.
    const half = (parseFloat(getComputedStyle(road).getPropertyValue('--lrn-label-w')) || 170) / 2;
    const EDGE = half + 4;
    const TURN_MIN = half + 20;
    const lo = Math.max(EDGE, SIDE + TURN_MIN);
    const hi = Math.min(width - EDGE, width - SIDE - TURN_MIN);
    const clear = cssNumber('--lrn-clear', 14);
    const LABEL_GAP = cssNumber('--lrn-gap', 12);   // nút → tên bài
    const NODE_HALF = cssNumber('--lrn-node', 56) / 2;
    const FAR_K = cssNumber('--lrn-far-k', 0.3);
    const FAR_FROM = cssNumber('--lrn-far-from', 0.5);
    const labelH = nodes.map((node) => node.querySelector('.lrnstop__label')?.offsetHeight || 0);
    // Nút chỉ có icon (Ekko Lover: bài chưa học) không có chữ để tránh: được
    // lệch xa hơn và khúc quanh quanh nó chỉ cần tránh chính nút tròn.
    const iconly = nodes.map((node) => node.classList.contains('is-iconly'));
    const ICON_TURN = NODE_HALF + 30;
    const loI = SIDE + ICON_TURN;
    const hiI = width - SIDE - ICON_TURN;
    const xs = stops.map((_, i) => {
      const [a, b] = iconly[i] ? [loI, hiI] : [lo, hi];
      if (i === 0) return iconly[i] ? a : EDGE;
      if (i === last) return (last - 1) % 2 === 0 ? (iconly[i] ? a : EDGE) : (iconly[i] ? b : width - EDGE);
      return a + (b - a) * SWAY[(i + sway) % SWAY.length];
    });
    // Hàng đều (`--lrn-row`, mặc định) hoặc — riêng Ekko Lover — theo từng tên bài.
    const fixedRow = cssNumber('--lrn-row', 0);
    let y = TOP;
    const points = xs.map((x, i) => {
      if (i > 0 && fixedRow) y += fixedRow;
      else if (i > 0) {
        // Bài sau ở xa về phía bên kia (thường là nút trắc nghiệm neo sát lề):
        // đoạn đường vòng về phải băng ngang dài ngay dưới tên bài, nên chừa
        // thêm chỗ đúng cho hàng đó, không nới mọi hàng.
        const far = Math.max(0, Math.abs(x - xs[i - 1]) - half * FAR_FROM) * FAR_K;
        y += NODE_HALF + LABEL_GAP + labelH[i - 1] + clear + far + NODE_HALF;
      }
      return { x, y };
    });
    road.style.height = `${y + NODE_HALF + LABEL_GAP + labelH[last] + BOTTOM_PAD}px`;
    nodes.forEach((node, i) => { node.style.left = `${points[i].x}px`; node.style.top = `${points[i].y}px`; });
    svg.setAttribute('viewBox', `0 0 ${width} ${road.clientHeight}`);
    const turns = points.slice(1).map((_, i) => (iconly[i] && iconly[i + 1] ? ICON_TURN : TURN_MIN));
    const segments = roadSegments(points, width, sway, turns);
    rest.setAttribute('d', pathOf(points[0], segments));
    walked.setAttribute('d', lit > 0 ? pathOf(points[0], segments.slice(0, lit)) : '');
    if (pig) {
      const { x, y } = segments[reached].mid;
      pig.style.left = `${Math.min(width - 28, Math.max(28, x))}px`;
      pig.style.top = `${y}px`;
    }
  };
  requestAnimationFrame(draw);
  new ResizeObserver(draw).observe(road);
  return road;
}

/**
 * Đường mòn qua các nút. Quãng i đi sang phải nếu i chẵn, sang trái nếu i lẻ,
 * quanh rồi quay về nút sau. Khúc quanh chỉ vươn quá nút xa nhất một đoạn vừa
 * đủ (REACH, nhưng không dưới `turns[i]` — nửa tên bài + 20, hoặc nửa nút + 30
 * khi cả hai đầu chỉ có icon), không bám mép màn hình.
 *
 * Ekko Lover dùng khúc quanh tròn đều (đoạn ngang + hai cung phần tư), vì các
 * hàng của nó sát nhau: một bezier đơn khi đó quay đầu gắt như kẹp tóc.
 *
 * Các concept khác: mỗi quãng là MỘT bezier bậc ba, hai tay nắm cùng chĩa về phía khúc quanh,
 * dài 4/3 khoảng cách tới đỉnh khúc quanh (với bezier, điểm giữa đường cong
 * khi đó chạm đúng đỉnh) — nên cả quãng là một vòng cung liền, không có điểm
 * gãy. Ở nút, tay nắm hơi chúc xuống theo tỉ lệ độ dài, để hai phía một nút
 * cùng hướng và đường đi qua nút mềm, không cắt tên bài bên dưới.
 * @returns {{ d: string, mid: {x:number, y:number} }[]} một đoạn " C …" cho mỗi quãng
 */
function roadSegments(points, width, sway, turns) {
  const SLANT = 0.1;
  const HANDLE = 4 / 3;
  // Ekko Lover (`--lrn-round: 1`): khúc quanh tròn đều thay cho một bezier đơn.
  const ROUND = cssNumber('--lrn-round', 0) > 0;
  const out = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dir = i % 2 === 0 ? 1 : -1;
    // Vươn ít nhất `turnMin` (nửa tên bài + nửa đường + 10) để đường không cắt chữ.
    const reach = Math.max(REACH[(i + sway) % REACH.length], turns[i]);
    const x = dir > 0
      ? Math.min(width - SIDE, Math.max(a.x, b.x) + reach)
      : Math.max(SIDE, Math.min(a.x, b.x) - reach);
    if (ROUND) {
      // Khúc quanh tròn đều: đi ngang ra gần đỉnh, quay đầu bằng hai cung phần
      // tư bán kính r (≈ nửa khoảng cách hai hàng), rồi đi ngang về nút sau.
      // Cong đều nên mượt hơn hẳn một bezier đơn khi hai hàng sát nhau.
      const dy = b.y - a.y;
      const r = Math.max(4, Math.min(dy / 2, Math.abs(x - a.x), Math.abs(x - b.x)));
      const sx = x - dir * r;
      const k = 0.5523 * r;     // tay nắm xấp xỉ cung tròn
      out.push({
        d: ` L ${sx} ${a.y} C ${sx + dir * k} ${a.y}, ${x} ${a.y + r - k}, ${x} ${a.y + r}`
          + ` L ${x} ${b.y - r} C ${x} ${b.y - r + k}, ${sx + dir * k} ${b.y}, ${sx} ${b.y} L ${b.x} ${b.y}`,
        mid: { x, y: (a.y + b.y) / 2 },
      });
      continue;
    }
    const ha = (x - a.x) * HANDLE;
    const hb = (x - b.x) * HANDLE;
    const c1 = { x: a.x + ha, y: a.y + Math.abs(ha) * SLANT };
    const c2 = { x: b.x + hb, y: b.y - Math.abs(hb) * SLANT };
    out.push({
      d: ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
      // Điểm giữa đường cong (t = 0,5) — chính là đỉnh khúc quanh, xa tên bài.
      mid: { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 },
    });
  }
  return out;
}

const pathOf = (start, segments) => `M ${start.x} ${start.y}${segments.map((seg) => seg.d).join('')}`;

function stopNode(ctx, entry, icon, override) {
  const quiz = entry.type === 'quiz';
  const label = override ?? (quiz ? t('Trắc nghiệm kiến thức') : entry.title);
  // Chỉ bài đã học mới xanh payday blue; bài chưa học — kể cả bài đang tới
  // lượt — màu xám, bài tới lượt nổi lên bằng vòng sáng quanh nút.
  const tone = entry.completed ? 'done' : 'todo';
  return el(`button.lrnstop.is-${tone}${entry.current ? '.is-current' : ''}${entry.locked ? '.is-locked' : ''}${label ? '' : '.is-iconly'}`, {
    type: 'button',
    'aria-label': quiz ? t('Trắc nghiệm · Mô-đun {n}', { n: entry.moduleOrder }) : entry.title,
    onclick: () => openStop(ctx, entry),
  }, [
    el('span.lrnstop__circle', {}, [
      solidIcon(icon),
      quiz && entry.completed && entry.result
        ? el('span.lrnstop__star', { 'aria-label': t('{correct}/{total} đúng', { correct: entry.result.correct, total: entry.result.total }) }, String(entry.result.correct))
        : null,
      entry.locked ? el('span.lrnstop__lock', {}, uiIcon('square-lock-02', 16)) : null,
    ]),
    label ? el('span.lrnstop__label', {}, label) : null,
  ]);
}

/**
 * Chạm vào chặng là vào thẳng: bài học mở trình học, trắc nghiệm mở bài thi —
 * không qua bảng trung gian. Chặng còn khoá chỉ báo lý do bằng một dòng nhắc.
 */
async function openStop(ctx, entry) {
  if (entry.locked) return toast(lockedNote(entry), 'error');
  if (entry.type !== 'quiz') return ctx.openLesson(entry.id);
  const module = await api.get(`/api/learn/modules/${encodeURIComponent(entry.moduleSlug)}`);
  return openModuleQuiz(module, ctx);
}

/** Câu nhắc khi chạm vào chặng còn khoá — hai lý do khoá cần hai câu khác nhau. */
const lockedNote = (entry) => (entry.locked && entry.lockReason === 'level'
  ? t('Mô-đun này mở khoá ở cấp cao hơn.')
  : entry.type === 'quiz'
    ? t('Học hết bài trong mô đun này để mở phần trắc nghiệm.')
    : t('Học xong bài phía trên đã, rồi bài này mới mở.'));


function scrollToCurrent(board) {
  const scroller = document.getElementById('scroll');
  if (!scroller) return;

  const target = board.querySelector('.lrnstop.is-current')
    || board.querySelector('.lrnstop.is-todo:not(.is-locked)');
  if (!target) {
    scroller.scrollTop = scroller.scrollHeight;
    return;
  }

  const offset = (target.getBoundingClientRect().top - scroller.getBoundingClientRect().top) / screenScale();
  scroller.scrollTop += offset - scroller.clientHeight * 0.45;
}
