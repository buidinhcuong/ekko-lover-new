/**
 * App shell: session bootstrap, world state store, hash router and HUD.
 *
 * There is no tab bar: the island map is the hub and every other screen is a
 * spoke reached from it, so the HUD carries a single back control instead.
 *
 * Views are plain functions `(ctx) => HTMLElement`. `ctx.refreshWorld()` pulls
 * the HUD numbers again after anything that can earn XP.
 */
import { api, ApiError, el, guard, mount, screenScale, setApiLang, setLocale, setOverlayRoot, setScrollRoot, singleFlight, spriteIcon, toast, uiIcon, vnd } from '/shared/client.js';
import { celebrateRewards, claimRedirectActive, closeSheet, isImeEnter } from './ui.js';
import { openBot } from './bot.js';
import { getLang, languageSwitch, onLangChange, t } from './i18n.js';
import { conceptBase } from '/shared/concepts.js';
import { buildTabbar, TAB_ROUTES } from './tabbar.js';
import { loverMascot } from './mascot.js';
import { maybeShowLoverIntro } from './onboarding.js';
import { renderAuth } from './auth.js';

import worldView from './views/world.js';
import exploreView from './views/explore.js';
import budgetView from './views/budget.js';
import goalsView from './views/goals.js';
import plansView from './views/plans.js';
import expensesView from './views/expenses.js';
import { monthGroupsView, weeklyReportView } from './views/expense-reports.js';
import savingsView from './views/savings.js';
import badgesView, { challengesView, levelView } from './views/badges.js';
import newsListView from './views/news.js';
import teamView from './views/team.js';
import { openLesson } from './views/lesson.js';

const root = document.getElementById('app');
const screen = document.getElementById('screen');
const scroller = document.getElementById('scroll');

// The screen anchors every floating layer; the inner element does the scrolling.
setOverlayRoot(screen);
setScrollRoot(scroller);

// `data-device` on .device is the single switch for the chassis colour.
const chassis = document.querySelector('.device__chassis');
const variant = document.querySelector('.device')?.dataset.device || 'black';
if (chassis) chassis.src = `/assets/device/iphone-${variant}.png`;

// Trên máy tính khung iPhone dựng cố định 450 × 920 và được thu phóng nguyên
// khối cho vừa cửa sổ (style.css · device), nên chữ và khung giữ một tỉ lệ ở
// mọi cỡ màn hình. Không có khung (điện thoại thật, cửa sổ hẹp) thì giữ 1.
const FRAME_QUERY = window.matchMedia('(min-width: 768px) and (min-height: 480px)');
function fitDevice() {
  const scale = FRAME_QUERY.matches ? Math.min(1, (window.innerHeight - 40) / 920, (window.innerWidth - 40) / 450) : 1;
  document.documentElement.style.setProperty('--dev-scale', String(Math.max(0.3, scale)));
}
fitDevice();
window.addEventListener('resize', fitDevice);
FRAME_QUERY.addEventListener?.('change', fitDevice);

// Số, ngày, và nội dung do server trả về cũng phải theo ngôn ngữ đang chọn.
setLocale(getLang());
setApiLang(getLang());

export const store = {
  user: null,
  world: null,
};

const ROUTES = {
  '': worldView,
  '/': worldView,
  '/explore': exploreView,
  '/budget': budgetView,
  '/goals': goalsView,
  '/plans': plansView,
  '/expenses': expensesView,
  '/expenses/report': weeklyReportView,
  '/expenses/groups': monthGroupsView,
  '/savings': savingsView,
  '/badges': badgesView,
  '/level': levelView,
  '/challenges': challengesView,
  '/team': teamView,
  '/news': newsListView,
};

// --- context handed to every view ---------------------------------------
const ctx = {
  get world() { return store.world; },
  get user() { return store.user; },
  navigate,
  openLesson: (lessonId) => openLesson(lessonId, ctx),
  /** Đăng ký cách nút "←" lùi một bước bên trong màn đang mở (null = rời màn). */
  setInnerBack(fn) { innerBack = fn; },
  openBot: () => openBot(ctx),
  async refreshWorld() {
    store.world = await api.get('/api/me/world');
    renderHud();
    // Chấm báo lời mời / lời nhắc trên tab Heo Dream Team.
    document.querySelector('.ekkotabbar')?.update?.(currentPath, store.world);
    return store.world;
  },
};

// Ngăn xếp đường đi trong app — để nút "←" quay lại đúng MÀN TRƯỚC ĐÓ, không
// phải lúc nào cũng nhảy thẳng về trang chủ. `navigate()` (đi tới) đẩy màn
// đang xem vào ngăn xếp trước khi chuyển; `goBack()` chỉ lấy ra, không đẩy gì
// thêm, nên các lần bấm "←" liên tiếp lùi lại đúng từng bước đã đi qua.
let navStack = [];

export function navigate(route) {
  let target = route.startsWith('#') ? route.slice(1) : route;
  // Vừa bấm "Đến nhận thưởng": màn đang mở chuyển trang ngay sau đó cũng về Huy hiệu.
  if (target !== '/badges' && claimRedirectActive()) target = '/badges';
  if (location.hash.slice(1) === target) { render(); return; }
  navStack.push(currentPath);
  location.hash = target;
}

window.addEventListener('ekko:navigate', (event) => navigate(event.detail));

/**
 * Một màn có nhiều bước bên trong (vd. Mục tiêu: danh sách → chi tiết → sửa)
 * đăng ký ở đây cách lùi một bước nội bộ; nút "←" gọi nó trước khi rời màn.
 * Trả về `false` (hoặc chưa đăng ký) thì lùi về màn trước như thường. Xoá mỗi
 * lần chuyển màn.
 */
let innerBack = null;

export function goBack() {
  if (innerBack && innerBack() !== false) return;
  const prev = navStack.pop() ?? '/';
  location.hash = prev;
}

// --- chrome --------------------------------------------------------------
let hudNode = null;
let bodyNode = null;
let currentPath = '/';

function streakPill(streak) {
  if (streak.status === 'frozen') {
    return el('span.pill.pill--frozen', {
      title: t('Còn {n} ngày trước khi mất chuỗi', { n: streak.freezeDaysLeft }),
    }, [uiIcon('snow', 16), ` ${streak.count}`]);
  }
  return el('span.pill.pill--streak', {
    title: streak.countedToday ? t('Hôm nay đã được tính') : t('Hôm nay chưa được tính'),
  }, [uiIcon('fire', 16), ` ${streak.count}`]);
}

function renderHud() {
  if (!hudNode || !store.world) return;
  const { level, progress, streak, concept } = store.world;
  const atHome = currentPath === '/' || currentPath === '';

  // Concept "Ekko Lover" đã có hồ sơ heo + vòng tiến độ to ngay trong màn
  // chủ, nên HUD ở đây chỉ lặp lại đúng những gì đã thấy — ẩn hẳn tại màn chủ
  // của concept này. Các màn con (Khám phá, Ngân sách…) vẫn cần HUD vì đó là
  // nơi duy nhất có nút quay lại.
  // Gắn mã concept lên <html> để CSS riêng của từng concept (vd. bảng màu của
  // Ekko Lover Colors) bám vào được.
  document.documentElement.dataset.concept = concept || '';
  if (conceptBase(concept) === 'lover' && atHome) {
    hudNode.style.display = 'none';
    mount(hudNode);
    return;
  }
  hudNode.style.display = '';

  mount(hudNode,
    // The island map is the hub, so every other screen needs one tap back to it.
    atHome || isTabRoot() ? null : el('button.hud__back', { type: 'button', onclick: goBack, 'aria-label': t('Quay lại') }, spriteIcon('arrow-left-02-stroke', 20)),
    // Ekko Lover: bấm heo trên thanh đầu mở trang Cấp độ heo; concept khác giữ trang Huy hiệu.
    el('button.hud__level', {
      onclick: () => navigate(concept === 'lover' ? '/level' : '/badges'),
      'aria-label': concept === 'lover' ? t('Xem cấp độ heo và hoạt động gần đây') : t('Xem tiến độ và huy hiệu'),
    }, [
      el('span.hud__avatar', {}, [el('img', { src: level?.character_image || '/assets/levels/pig-1.png', alt: '' })]),
      el('span.hud__meta', {}, [
        el('span.hud__name', {}, `${t('Cấp {n}', { n: level?.order_index ?? 1 })} · ${level?.name ?? ''}`),
        // Phần XP tự kiếm + phần bạn cùng Dream Team kiếm hộ (màu riêng).
        el('span.hud__xpbar', {}, [
          el('span.hud__xpfill', { style: { width: `${Math.max(0, progress.percent - (progress.teamPercent || 0))}%` } }),
          progress.teamPercent ? el('span.hud__xpfill.hud__xpfill--team', { style: { width: `${progress.teamPercent}%` } }) : null,
        ]),
        el('span.hud__xptext', {}, progress.xpForNextLevel
          ? `${progress.xpIntoLevel}/${progress.xpForNextLevel} XP`
          : t('{xp} XP · cấp tối đa', { xp: progress.xp })),
      ]),
    ]),
    streakPill(streak),
  );
}

// Ba tính năng này đã có ô nhập/nút hành động riêng của chúng ngay trong màn
// hình (ví dụ nút Thêm ngân sách, form thêm việc), nên thanh ghi nhanh + nút
// Ekko bot nổi ở đáy màn chỉ gây rối, không liên quan tới việc đang làm ở đó.
const HIDE_CHROME_ON = new Set(['/explore', '/budget', '/goals', '/plans', '/savings']);

function renderChrome() {
  const hide = HIDE_CHROME_ON.has(currentPath);
  // Simple mode ghi chép bằng nút "Nói để ghi" to ở màn chủ và màn Ghi chép,
  // nên không cần thêm ô gõ nhỏ nổi ở đáy màn.
  const simple = store.world?.concept === 'simple';
  document.querySelector('.quickbar')?.style.setProperty('display', hide || simple ? 'none' : '');
  document.querySelector('.botfab')?.style.setProperty('display', hide ? 'none' : '');
  // Tabbar của app Ekko (chỉ để demo) hiện ở màn chủ của Ekko Lover và Ekko
  // Lover Colors; class trên <html> đẩy thanh ghi nhanh, nút bot / mascot và
  // đáy màn chủ lên theo.
  document.documentElement.classList.toggle('has-tabbar', isTabRoot());
  document.querySelector('.ekkotabbar')?.update?.(currentPath, store.world);
  // Mascot đậu vào / rời tabbar ngay, không đợi (mascot.js).
  window.dispatchEvent(new Event('ekko:chrome'));
}

/**
 * Tabbar Heo cá nhân / Heo Dream Team (tabbar.js) ở hai màn gốc của Ekko Lover;
 * mascot đậu vào nút tròn giữa thanh. Các màn con không có tabbar, mascot nổi
 * như cũ.
 */
const isTabRoot = () => store.world?.concept === 'lover' && TAB_ROUTES.includes(currentPath || '/');

/**
 * Màn chủ Ekko Lover sau khi ghi nhanh: đứng lại chỗ đang xem (vẽ lại màn
 * kéo về đầu trang) rồi trượt tới khối "Ghi chép chi tiêu hôm nay", chừa chỗ
 * cho thanh tab đang dính ở đầu màn để khối không bị che.
 */
function revealTodayExpenses(from) {
  const block = bodyNode?.querySelector('.loverhome__todayblock');
  if (!block) return;
  const k = screenScale();
  const dock = bodyNode.querySelector('.loverhome__tabdock');
  const stickTop = dock ? (parseFloat(getComputedStyle(dock).top) || 0) + dock.offsetHeight : 0;
  scroller.scrollTo({ top: from });
  const top = scroller.scrollTop + (block.getBoundingClientRect().top - scroller.getBoundingClientRect().top) / k - stickTop - 20;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  scroller.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
}

// --- routing -------------------------------------------------------------
/**
 * Check-in Giáo dục tài chính (Ekko Lover): lần đầu vào màn chính trong ngày
 * được cộng XP. Chạy TRƯỚC khi vẽ màn chính để thẻ hồ sơ hiện luôn XP mới.
 * Server tự chặn lần thứ hai trong ngày; app chỉ khỏi gọi lại khi đã biết hôm
 * nay check-in rồi. Lỗi thì bỏ qua — không chặn màn chính vì một phần thưởng.
 */
let checkedInDay = null;
async function checkIn() {
  const today = store.world?.today;
  if (store.world?.concept !== 'lover' || !today || checkedInDay === today) return null;
  checkedInDay = today;
  try {
    const result = await api.post('/api/me/checkin', {});
    if (result.xp) await ctx.refreshWorld();
    return result;
  } catch {
    checkedInDay = null;   // lỗi mạng: lần sau vào màn chính thử lại
    return null;
  }
}

/**
 * Heo Dream Team: bạn cùng đội nhắc giữ streak hôm nay — mở màn chủ là đánh dấu
 * đã xem (màn Dream Team cũng đánh dấu khi mở).
 */
async function showTeamNudges() {
  const nudges = store.world?.team?.nudges || [];
  if (store.world?.concept !== 'lover' || !nudges.length) return;
  // Lời nhắc hiện thành dòng màu vàng ở màn chủ (views/world.js) — ở đây chỉ
  // đánh dấu đã xem để tắt chấm đỏ trên tab Heo Dream Team.
  store.world.team.nudges = [];
  renderChrome();
  try { await api.post('/api/team/nudges/seen', {}); } catch { /* lần sau báo lại cũng không sao */ }
}

async function render() {
  closeSheet();
  innerBack = null;
  const hash = location.hash.slice(1) || '/';
  const [path] = hash.split('?');
  const view = ROUTES[path] || ROUTES['/'];

  currentPath = path === '' ? '/' : path;
  renderHud();
  renderChrome();

  mount(bodyNode, el('div.screen__body', {}, [
    el('div.skeleton', { style: { height: '160px', marginBottom: '12px' } }),
    el('div.skeleton', { style: { height: '96px' } }),
  ]));

  try {
    const checkin = currentPath === '/' ? await checkIn() : null;
    const node = await view(ctx);
    // The world view brings its own edge-to-edge shell; everything else gets
    // the standard screen padding.
    mount(bodyNode, node.classList.contains('screen__body') ? node : el('div.screen__body', {}, [node]));
    scroller.scrollTo({ top: 0 });
    // Lần đầu tới màn chủ của Ekko Lover: mở 3 màn giới thiệu tính năng chính.
    if (currentPath === '/' && conceptBase(store.world?.concept) === 'lover') maybeShowLoverIntro(store.world);
    if (checkin?.xp) {
      toast({ title: t('Check-in hôm nay +{xp} XP', { xp: checkin.xp }), body: t('Quay lại mỗi ngày để nhận thêm nhé!') }, 'success');
    }
    if (currentPath === '/') showTeamNudges();
  } catch (err) {
    mount(bodyNode, el('div.empty', {}, [
      el('img', { src: '/assets/mascot/bot-9.png', alt: '' }),
      el('h3', {}, t('Chưa tải được màn hình này')),
      el('p.muted', {}, err instanceof ApiError ? err.message : t('Kiểm tra kết nối rồi thử lại nhé.')),
      el('button.btn', { onclick: render, style: { marginTop: '12px' } }, t('Thử lại')),
    ]));
  }
}

// --- bootstrap -----------------------------------------------------------
async function boot() {
  try {
    const me = await api.get('/api/me');
    store.user = me.user;
    store.world = me.world;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return renderSignedOut();
    throw err;
  }

  hudNode = el('header.hud');
  bodyNode = el('main.screen');

  mount(root, hudNode, bodyNode);
  screen.append(...buildChrome());
  // Thanh công cụ của bản demo (về trang preview, đổi người dùng mẫu / concept,
  // VI / EN) — chỉ hiện ở bản demo; bản chạy thật (NODE_ENV=production) người
  // dùng không thấy.
  const demo = await api.get('/api/auth/config').then((c) => Boolean(c.demo)).catch(() => false);
  // Nút đổi ngôn ngữ gắn vào <body>, tức là NGOÀI khung điện thoại.
  if (demo) document.body.append(languageSwitch());
  // Mở thẳng /app/ (không qua trang xem trước) thì thêm nút về trang chính,
  // khỏi phải gõ lại địa chỉ. Trong khung xem trước đã có thanh chuyển trang.
  if (demo && window.self === window.top) {
    const label = t('Về trang chính');
    document.body.append(el('a.homelink', { href: '/', title: label, 'aria-label': label }, uiIcon('home-01', 20)));
    // Hai người dùng mẫu của bản demo, ngay cạnh nút về trang chính: mỗi lần
    // bấm là dựng lại từ đầu (xem server/services/personas.js).
    // Kế bên là ba concept: đổi giao diện cho cả bản demo bằng một cú bấm.
    document.body.append(el('div.personaswitch', {}, [
      el('div.personaswitch__group', { role: 'group', 'aria-label': t('Đổi người dùng mẫu') }, [
        personaLink('new', 'plant-02', t('Người dùng mới: heo cấp 1, chưa học, chưa có dữ liệu')),
        personaLink('mid', 'mortarboard-01', t('Người dùng đang học: học được khoảng 30% số bài, đã có dữ liệu')),
        personaLink('veteran', 'crown', t('Người dùng lâu năm: học hết bài, heo cấp 10, đủ dữ liệu')),
      ]),
      el('span.personaswitch__sep', { 'aria-hidden': 'true' }),
      el('div.personaswitch__group', { role: 'group', 'aria-label': t('Đổi concept') },
        DEMO_CONCEPTS.map((c) => conceptLink(c))),
    ]));
  }
  startStatusClock();

  window.addEventListener('hashchange', render);
  onLangChange(relanguage);
  await render();

  // A returning member whose streak is frozen should hear about it once.
  const streak = store.world.streak;
  if (streak.status === 'frozen') {
    toast({
      title: t('Chuỗi {n} ngày đang đóng băng', { n: streak.count }),
      body: t('Còn {n} ngày để cứu chuỗi.', { n: streak.freezeDaysLeft }),
    }, 'info');
  }
}

/** Ba concept của bản demo, cùng icon với nút trên trang preview (preview.js). */
const DEMO_CONCEPTS = [
  { code: 'lover', icon: () => uiIcon('piggy-bank', 20), label: 'Concept 1 · Ekko Lover' },
  { code: 'lover-colors', icon: () => uiIcon('paint-board', 20), label: 'Concept 2 · Ekko Lover Colors' },
  { code: 'simple', icon: () => spriteIcon('zoom-in-area-stroke', 20), label: 'Concept 3 · Simple mode' },
];

function conceptLink({ code, icon, label }) {
  const active = store.world?.concept === code;
  return el(`a.homelink.personaswitch__btn${active ? '.is-active' : ''}`, {
    href: `/dev/concept?code=${code}&redirect=/app/`, title: label, 'aria-label': label, 'aria-current': active ? 'true' : null,
  }, icon());
}

function personaLink(key, icon, label) {
  const active = store.user?.persona === key;
  return el(`a.homelink.personaswitch__btn${active ? '.is-active' : ''}`, {
    href: `/dev/persona?as=${key}`, title: label, 'aria-label': label, 'aria-current': active ? 'true' : null,
  }, uiIcon(icon, 20));
}

/**
 * Đổi ngôn ngữ khi app đang chạy. Ba thứ phải dựng lại: định dạng số/ngày, phần
 * chrome viết một lần lúc khởi động (thanh ghi nhanh, nút bot), và màn hình
 * hiện tại. Nội dung bài học lấy lại từ server vì server dịch theo `lang`.
 */
async function relanguage() {
  setLocale(getLang());
  setApiLang(getLang());
  closeSheet();

  document.querySelector('.quickbar')?.remove();
  document.querySelector('.botfab')?.remove();
  document.querySelector('.ekkotabbar')?.remove();
  screen.append(...buildChrome());
  renderChrome();

  await ctx.refreshWorld();
  await render();
}

/**
 * Phần nổi ở đáy màn: thanh ghi nhanh, nút Ekko bot, tabbar (demo). Ekko Lover
 * thay nút bot bằng mascot: thanh ghi nhanh ẩn, ấn giữ / rê lên mascot 2 giây
 * mới trượt ra (xem mascot.js).
 */
function buildChrome() {
  const bar = buildQuickBar();
  const fab = store.world?.concept === 'lover'
    ? loverMascot(bar, () => openBot(ctx))
    : el('button.botfab', { onclick: () => openBot(ctx), 'aria-label': t('Mở Ekko bot') }, [
      el('img', { src: '/assets/mascot/ekko-bot.png', alt: '' }),
    ]);
  return store.world?.concept === 'lover' ? [bar, fab, buildTabbar(navigate)] : [bar, fab];
}

/**
 * Always-on quick expense entry. The member types the way they speak
 * ("cà phê 35k") and the server's Vietnamese parser turns it into a ledger
 * entry, so logging a coffee costs one line instead of a four-field form.
 */
function buildQuickBar() {
  const input = el('input', {
    type: 'text',
    enterkeyhint: 'done',
    autocomplete: 'off',
    placeholder: t('Ghi nhanh: cà phê 35k'),
    'aria-label': t('Ghi nhanh một khoản chi'),
  });
  const send = el('button.quickbar__send', { 'aria-label': t('Lưu khoản chi') }, '↑');
  const bar = el('div.quickbar', {}, [input, send]);

  const sync = () => bar.classList.toggle('is-ready', input.value.trim().length > 0);
  input.addEventListener('input', sync);

  /**
   * Hai lớp chống ghi trùng, vì một lần "ghi" của người dùng có thể phát ra hai
   * lần gọi (bấm hai lần, hoặc bộ gõ tiếng Việt gửi Enter hai lần):
   *
   * 1. `singleFlight` chặn lần gọi thứ hai khi lần đầu còn đang chạy.
   * 2. Ô nhập được dọn NGAY khi đã lấy được nội dung, nên lần gọi đến sau khi
   *    lần đầu xong cũng không còn gì để gửi. Gửi lỗi thì trả chữ lại cho người
   *    dùng, không để họ gõ lại.
   *
   * `.is-busy` chỉ làm mờ và khoá chuột, không khoá bàn phím, nên nó không thay
   * được hai lớp trên.
   */
  const submit = singleFlight(async () => {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    sync();
    bar.classList.add('is-busy');
    const result = await guard(() => api.post('/api/expenses/quick', { text }));
    bar.classList.remove('is-busy');
    if (!result) {
      input.value = text;   // guard already surfaced why
      sync();
      return;
    }

    const { expense, category, alerts } = result;
    // Khoản chi đã lưu; cảnh báo chỉ thay chỗ của lời xác nhận, không chặn việc ghi.
    if (alerts?.length) {
      toast({ title: alerts[0].title, body: alerts[0].text }, 'warning');
    } else if (result.expenses?.length > 1) {
      // Một câu nhiều khoản ("phở 45k, cà phê 25k"): báo tổng và số khoản đã ghi.
      toast({
        title: t('Đã ghi {n} khoản · {amount}', { n: result.expenses.length, amount: vnd(result.total) }),
        body: result.expenses.map((e) => e.note).filter(Boolean).join(', '),
      }, 'success');
    } else {
      toast({
        title: t('Đã ghi {amount}', { amount: vnd(expense.amount) }),
        body: category?.name || t('Khác'),
      }, 'success');
    }

    await ctx.refreshWorld();
    // Only pays out on the first entry of the day, so this stays rare.
    await celebrateRewards(result.rewards, { title: t('Đã ghi vào sổ') });
    // Ekko Lover: ghi xong thì ở lại màn đang xem (vẽ lại để thấy ngay khoản vừa
    // ghi, vd. ở "Ghi chép chi tiêu hôm nay" của màn chủ) và thu ô ghi nhanh về
    // sau mascot. Concept khác: mở luôn màn Ghi chép chi tiêu để thấy dòng vừa
    // ghi; nếu đã ở đúng màn đó thì `navigate()` chỉ render lại.
    if (store.world?.concept === 'lover') {
      bar.dispatchEvent(new CustomEvent('quickbar:saved'));
      const atHome = currentPath === '/';
      const from = scroller.scrollTop;
      await render();
      // Ở màn chủ: trượt tới "Ghi chép chi tiêu hôm nay" để thấy ngay khoản vừa ghi.
      if (atHome) revealTodayExpenses(from);
    } else {
      navigate('/expenses');
    }
  });

  send.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    // Bộ gõ tiếng Việt dùng Enter để chốt chữ đang gõ dở, lần Enter đó không
    // phải là "gửi" (Safari: isComposing = false nhưng keyCode = 229).
    if (event.key !== 'Enter' || isImeEnter(event)) return;
    event.preventDefault();
    submit();
  });

  return bar;
}

/** Keeps the mockup's status-bar clock honest instead of freezing it at 9:41. */
function startStatusClock() {
  const node = document.getElementById('statusTime');
  if (!node) return;
  const tick = () => {
    node.textContent = new Intl.DateTimeFormat(getLang() === 'en' ? 'en-GB' : 'vi-VN', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date());
  };
  tick();
  setInterval(tick, 20000);
}

/**
 * Chưa đăng nhập: bản thử nghiệm nội bộ hiện màn đăng nhập / đăng ký bằng email
 * (auth.js); bản chạy thật (SSO) nhắc mở từ app Ekko.
 */
async function renderSignedOut() {
  let authConfig = null;
  try { authConfig = await api.get('/api/auth/config'); } catch { /* mạng lỗi: coi như chỉ có SSO */ }
  renderAuth(root, authConfig);
}

boot().catch((err) => {
  console.error(err);
  mount(root, el('div.empty', { style: { minHeight: '70vh', display: 'grid', alignContent: 'center' } }, [
    el('h3', {}, t('Không khởi động được')),
    el('p.muted', {}, String(err.message || err)),
  ]));
});
