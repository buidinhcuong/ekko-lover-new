/**
 * Màn chủ của concept Ekko Lover (và bản sao Ekko Lover Colors): hồ sơ cá nhân
 * — chú heo giữa vòng tiến độ XP, 5 nút chức năng, bên dưới là chi tiêu hôm
 * nay, ngân sách tháng, biểu đồ chi tiêu tuần và tin tức. Xem `loverHome`.
 * Concept Simple mode có màn chủ riêng ở `home-simple.js`.
 */
import { APP_SPRITE, api, dataIcon, el, guard, mount, screenScale, spriteIcon, toast, uiIcon, vnd, vndShort } from '/shared/client.js';
import { confirmSheet, swipeRow } from '../ui.js';
import { t } from '../i18n.js';
import { openNewsDetail } from './news.js';
import { dayCardHead, dayTotalFoot, monthWeeks, openEditExpense } from './expenses.js';
import simpleHome from './home-simple.js';
import { profileCard } from './badges.js';

/**
 * Thẻ một ngân sách ở màn chủ. Đọc từ trên xuống đúng thứ tự người dùng cần:
 * nhóm nào → đã chi bao nhiêu (số to nhất) trên hạn mức bao nhiêu → còn/vượt
 * bao nhiêu. Màu theo mức dùng: dưới 80% xanh, 80–100% vàng, vượt thì đỏ —
 * cùng một màu cho thanh, phần trăm và dòng còn/vượt để liếc là hiểu.
 */
function budgetCard(item) {
  const percent = item.planned > 0 ? Math.round((item.spent / item.planned) * 100) : 0;
  const tone = item.spent > item.planned ? 'over' : percent >= 80 ? 'warn' : 'ok';
  const left = item.planned - item.spent;
  return el(`div.loverhome__budgetitem.is-${tone}`, {}, [
    el('div.loverhome__budgethead', {}, [
      el('span.loverhome__budgeticon', {}, dataIcon(item.icon, 'package', 20)),
      el('span.loverhome__budgetname', {}, item.name),
      el('span.loverhome__budgetpercent', {}, `${percent}%`),
    ]),
    el('div.loverhome__budgetamountrow', {}, [
      el('div.loverhome__budgetamounts', {}, [
        el('strong', {}, vnd(item.spent)),
        el('span', {}, ` / ${vnd(item.planned)}`),
      ]),
      el('div.loverhome__budgetstatus', {}, left > 0
        ? t('Còn {amount}', { amount: vnd(left) })
        : left === 0 ? t('Hết hạn mức') : t('Vượt {amount}', { amount: vnd(-left) })),
    ]),
    el('div.loverhome__progressbar', {
      role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, percent)),
    }, [el('div.loverhome__progressfill', { style: { width: `${Math.min(100, percent)}%` } })]),
  ]);
}

export default function worldView(ctx) {
  // Simple mode có màn chủ riêng, rút gọn cho người dùng lớn tuổi.
  if (ctx.world.concept === 'simple') return simpleHome(ctx);
  return loverHome(ctx);
}

// ------------------------------------------------------------ concept "lover"
const LOVER_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** Cộng ngày trên chuỗi YYYY-MM-DD, không lệ thuộc múi giờ thiết bị. */
function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Cộng tháng trên chuỗi YYYY-MM, không lệ thuộc múi giờ thiết bị. */
function addMonthsKey(key, n) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/**
 * Một dòng trong "Ghi chép chi tiêu hôm nay" — vuốt để lộ Sửa/Xoá, cùng thiết
 * kế và cùng hàm sửa (`openEditExpense`) với màn Ghi chép chi tiêu, để hai nơi
 * nhất quán tuyệt đối chứ không phải hai cách làm khác nhau.
 */
function todayExpenseRow(ctx, expense, categories, rerender) {
  const content = el('div.row', {}, [
    el('span.row__icon', {
      style: {
        background: `color-mix(in srgb, ${expense.category_color || 'var(--bg-brand-500)'} 10%, transparent)`,
        color: expense.category_color || 'var(--text-brand-500)',
      },
    }, dataIcon(expense.category_icon, 'package', 20)),
    el('div.row__main', {}, [
      el('div.row__title', {}, expense.note || expense.category_name || t('Khoản chi')),
      el('div.row__sub', {}, expense.category_name || t('Khác')),
    ]),
    el('span.row__value', {}, `-${vnd(expense.amount)}`),
  ]);

  return swipeRow(content, [
    { label: t('Sửa'), tone: 'edit', onclick: () => openEditExpense(ctx, expense, categories, rerender) },
    {
      label: t('Xoá'),
      tone: 'danger',
      onclick: async () => {
        const ok = await confirmSheet({
          title: t('Xoá khoản chi'),
          message: t('Xoá {amount} - {what}?', {
            amount: vnd(expense.amount),
            what: expense.note || expense.category_name || '',
          }),
        });
        if (!ok) return;
        await guard(() => api.delete(`/api/expenses/${expense.id}`), t('Không xoá được'));
        toast(t('Đã xoá'));
        rerender();
      },
    },
  ]);
}

/**
 * Màn chủ của concept "Ekko Lover": hồ sơ cá nhân thay cho bản đồ đảo. Chú heo
 * toàn thân đứng giữa vòng tròn tiến độ XP, 4 nút chức năng thu gọn thành icon
 * bên phải — chạm lần một để lộ tên, chạm lần hai để mở đúng màn hình đó. Bên
 * dưới là ngân sách tháng và biểu đồ chi tiêu 7 ngày gần nhất, lấy thẳng từ dữ
 * liệu thật thay vì số mẫu.
 */
// Bọc một container + rerender riêng — cần để phần "Ghi chép chi tiêu hôm
// nay" sửa/xoá xong có chỗ vẽ lại đúng màn này, không phải điều hướng lại.
//
// `container` mang sẵn đúng class `screen__body` router (main.js) cần thấy
// để KHÔNG bọc thêm một lớp div nữa — thiếu class này, router tự thêm một
// `div.screen__body` mặc định (flex:1 + đệm to) bọc NGOÀI, đẩy shell thật sự
// (cùng flex:none/padding đã tính riêng bên dưới) xuống thành cháu thay vì
// con, và cái flex:1 + đệm thừa của lớp bọc ngoài đó chính là khoảng trắng
// kéo-hoài-không-hết ở đáy màn. `loverHomeBody` vì vậy chỉ trả về đúng phần
// `.loverhome` (nội dung), không tự bọc thêm shell của riêng nó nữa.
async function loverHome(ctx) {
  const container = el('div.screen__body.screen__body--flush.loverhome-shell');
  // Lời nhắc quay lại học hiện ngẫu nhiên (khoảng một nửa số lần vào màn chủ),
  // chốt một lần cho mỗi lần vào — vẽ lại màn (sau khi ghi nhanh, sửa/xoá) không
  // làm nó lúc hiện lúc mất.
  const options = { showNudge: Math.random() < NUDGE_CHANCE };
  const rerender = async () => mount(container, await loverHomeBody(ctx, rerender, options));
  mount(container, await loverHomeBody(ctx, rerender, options));
  return container;
}

/** Xác suất hiện lời nhắc "quay lại hành trình" mỗi lần vào màn chủ Ekko Lover. */
const NUDGE_CHANCE = 0.5;

async function loverHomeBody(ctx, rerender, { showNudge = false } = {}) {
  const { level, progress, streak } = ctx.world;
  // Chức năng Super admin đã tắt (Admin → Chức năng): không gọi API của nó (server
  // cũng chặn), dùng dữ liệu rỗng rồi ẩn hẳn phần tương ứng bên dưới.
  const on = (code) => ctx.world.modules?.[code] !== false;
  const when = (code, call, empty) => (on(code) ? call() : Promise.resolve(empty));
  const [budget, week, news, recap, savingsRecap, categories] = await Promise.all([
    when('budget', () => api.get('/api/budget'), { items: [] }),
    when('expenses', () => api.get('/api/expenses?range=week'), { expenses: [] }),
    when('news', () => api.get('/api/news'), []),
    when('budget', () => api.get('/api/budget/recap'), { hasData: false }),
    when('savings', () => api.get('/api/savings/recap'), { hasData: false }),
    api.get('/api/categories'),
  ]);

  // Icon lấy đúng bộ đang dùng trong Figma ("Ekko - User Interface", màn
  // Home - 74), xuất ra `assets/icons/app-icons.svg`. Icon vẽ nét chứ không
  // phải emoji nên ăn màu theo `color` của tab — trắng trên nền thẻ xanh.
  const BUTTONS = [
    { icon: 'books-02', label: t('Học tập'), route: '/explore', module: 'learning' },
    { icon: 'analytics-02', label: t('Mục tiêu'), route: '/goals', module: 'goals' },
    { icon: 'briefcase-dollar', label: t('Ngân sách'), route: '/budget', module: 'budget' },
    { icon: 'note', label: t('Ghi chép'), route: '/expenses', module: 'expenses' },
    { icon: 'savings', label: t('Tiết kiệm'), route: '/savings', module: 'savings' },
  ].filter((b) => on(b.module));

  // 5 tab luôn hiện icon + tên, nằm trong thẻ xanh ngay trên hàng hồ sơ — khác
  // kiểu nút cũ phải chạm hai lần mới điều hướng. Một khoanh trắng (indicator)
  // trượt tới tab vừa chạm để phản hồi tức thì, rồi mới điều hướng sau một
  // nhịp ngắn — đủ để mắt kịp thấy hiệu ứng trước khi màn hình đổi.
  let tabsNode;
  let indicatorNode;
  const renderTabs = () => {
    indicatorNode = el('div.loverhome__tabindicator');
    const tabNodes = BUTTONS.map((btn) => {
      const node = el('button.loverhome__tab', {
        // Mã chức năng (explore, goals…) để concept Ekko Lover Colors tô mỗi nút một màu.
        dataset: { tone: btn.route.slice(1) },
        'aria-label': btn.label,
        onclick: () => {
          [...tabsNode.querySelectorAll('.loverhome__tab')].forEach((n) => n.classList.remove('is-active'));
          node.classList.add('is-active');
          indicatorNode.style.opacity = '1';
          // Nút rộng hơn khoanh tròn: canh khoanh trắng vào giữa nút.
          indicatorNode.style.transform = `translateX(${node.offsetLeft + (node.offsetWidth - indicatorNode.offsetWidth) / 2}px)`;
          setTimeout(() => ctx.navigate(btn.route), 150);
        },
      }, [
        el('span.loverhome__tabcircle', {}, [spriteIcon(btn.icon, 24, btn.sprite || APP_SPRITE)]),
        el('span.loverhome__tablabel', {}, btn.label),
      ]);
      return node;
    });
    return el('div.loverhome__tabs', {}, [...tabNodes, indicatorNode]);
  };
  tabsNode = renderTabs();

  // Thanh nav nhân vật: heo nhỏ trong vòng XP, cấp độ và tên cạnh bên, chuỗi
  // ngày ở cuối — gọn một hàng như thanh Profile của màn Home trong Figma, thay
  // cho khối heo 140px trước đây. Vòng tròn vẫn giữ để tiến độ lên cấp đọc được
  // ngay, chỉ thu nhỏ theo cỡ avatar.
  const RING_R = 21;                          // bán kính trong viewBox 48×48
  const ringCircumference = 2 * Math.PI * RING_R;
  const avatar = el('div.loverhome__avatar', {}, [
    (() => {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 'loverhome__ring');
      svg.setAttribute('viewBox', '0 0 48 48');
      svg.setAttribute('aria-hidden', 'true');
      const bg = document.createElementNS(ns, 'circle');
      bg.setAttribute('class', 'loverhome__ringbg');
      bg.setAttribute('cx', '24'); bg.setAttribute('cy', '24'); bg.setAttribute('r', String(RING_R));
      const fill = document.createElementNS(ns, 'circle');
      fill.setAttribute('class', 'loverhome__ringfill');
      fill.setAttribute('cx', '24'); fill.setAttribute('cy', '24'); fill.setAttribute('r', String(RING_R));
      fill.style.strokeDasharray = String(ringCircumference);
      fill.style.strokeDashoffset = String(ringCircumference * (1 - (progress.percent || 0) / 100));
      svg.append(bg, fill);
      return svg;
    })(),
    el('img.loverhome__heoimg', {
      src: level?.character_image || '/assets/levels/pig-1.png',
      alt: t('Heo của bạn: {name}', { name: level?.name || '' }),
    }),
  ]);

  const streakPillNode = el(`span.loverhome__streak${streak.status === 'frozen' ? '.is-frozen' : ''}`, {
    title: streak.status === 'frozen'
      ? t('Còn {n} ngày trước khi mất chuỗi', { n: streak.freezeDaysLeft })
      : (streak.countedToday ? t('Hôm nay đã được tính') : t('Hôm nay chưa được tính')),
  }, [uiIcon(streak.status === 'frozen' ? 'snow' : 'fire', 16), ` ${streak.count}`]);

  // Cả thanh nav là một nút: bấm vào mở màn thông tin chi tiết & thành tích.
  const navbar = el('button.loverhome__navbar', {
    type: 'button',
    'aria-label': t('Xem thông tin và thành tích'),
    onclick: () => ctx.navigate('/badges'),
  }, [
    avatar,
    el('div.loverhome__navmeta', {}, [
      el('span.loverhome__navlevel', {}, [
        el('span.loverhome__lvlicon', { 'aria-hidden': 'true' }, uiIcon('flash', 16)),
        `${t('Cấp')} ${level?.order_index ?? 1}`,
      ]),
      el('span.loverhome__navname', {}, level?.name || ''),
    ]),
    streakPillNode,
    el('span.loverhome__navgo', { 'aria-hidden': 'true' }, spriteIcon('chevron-right-01-stroke', 20)),
  ]);

  // Thanh nav nhân vật đứng trên cùng — đúng chỗ của một thanh nav, như thanh
  // Profile đứng đầu màn Home trong Figma — rồi mới tới thẻ 5 tab.
  //
  // Đế dính của thẻ 5 tab là con TRỰC TIẾP của `.loverhome` chứ không gói chung
  // với thanh nav: `position: sticky` chỉ dính được trong phạm vi khối cha, gói
  // chung thì thẻ trôi đi ngay khi thanh nav cuộn khỏi màn hình.
  const tabcard = BUTTONS.length ? el('div.loverhome__tabdock', {}, [el('div.loverhome__tabcard', {}, [tabsNode])]) : null;

  // Chỉ tổng kết tháng đã kết thúc — không hiện trong lúc tháng vẫn đang
  // chạy, vì lúc đó "vượt ngân sách" chưa phải kết quả cuối cùng. Nút tắt đi
  // đổi chữ theo kết quả để có động lực bấm: vượt thì "Chiến đấu", trong hạn
  // thì "Tiếp tục" — chứ không chỉ là một nút "Đóng" trung tính.
  const recapBanner = recap.hasData && !recap.dismissed ? (() => {
    const over = recap.verdict === 'over';
    const node = el(`div.loverhome__recap${over ? '.loverhome__recap--over' : '.loverhome__recap--success'}`, {}, [
      el('span.loverhome__recaptext', {}, over
        ? [uiIcon('sad-01', 20), t('Cố lên, hãy làm lại vào tháng này')]
        : [uiIcon('party', 20), t('Chúc mừng, ngân sách thành công')]),
      el('button.loverhome__recapbtn', {
        onclick: async () => {
          node.remove();
          await guard(() => api.post('/api/budget/recap/dismiss', { month: recap.month }), t('Không lưu được'));
        },
      }, over ? t('Chiến đấu') : t('Tiếp tục')),
    ]);
    return node;
  })() : null;

  // Đầu tháng mới: tháng vừa kết thúc có thu nhập tự nhập và chi ít hơn thu
  // nhập thì hỏi có muốn bổ sung phần dư đó vào Quỹ tiết kiệm Ekko không —
  // hỏi thật (hai lựa chọn), không phải một banner chỉ có nút tắt như trên.
  const savingsRecapBanner = savingsRecap.hasData && !savingsRecap.dismissed ? (() => {
    const node = el('div.loverhome__savingsrecap', {}, [
      el('span.loverhome__savingsrecaptext', {}, [uiIcon('piggy-bank', 20), t('Tháng trước bạn còn dư {amount} chưa dùng hết. Bổ sung vào Quỹ tiết kiệm Ekko?', { amount: vnd(savingsRecap.remaining) })]),
      el('div.loverhome__savingsrecapactions', {}, [
        el('button', {
          onclick: async () => {
            node.remove();
            const result = await guard(
              () => api.post('/api/savings/recap/dismiss', { month: savingsRecap.month, add: true }),
              t('Không lưu được'),
            );
            if (result) toast(t('Đã bổ sung vào Quỹ tiết kiệm Ekko'), 'success');
          },
        }, t('Bổ sung')),
        el('button', {
          onclick: async () => {
            node.remove();
            await guard(() => api.post('/api/savings/recap/dismiss', { month: savingsRecap.month, add: false }), t('Không lưu được'));
          },
        }, t('Bỏ qua')),
      ]),
    ]);
    return node;
  })() : null;

  // Title tách hẳn ra ngoài khung thẻ trắng, dóng đúng cột với nội dung của
  // box màu (hồ sơ) phía trên — giống cách khối Tin tức/Ghi chép hôm nay đã
  // làm, chỉ riêng phần NỘI DUNG (danh sách ngân sách) mới còn nằm trong thẻ.
  // Bỏ khung thẻ trắng bọc ngoài — nội dung dóng thẳng theo đúng gutter của
  // màn hình (như title), không còn hai lớp lề (lề khung + lề item) nữa nên
  // progress bar cũng có nhiều chỗ để kéo dài ra hơn.
  const budgetSection = el('div.loverhome__block', {}, [
    el('div.loverhome__sectionhead', {}, [
      el('div.loverhome__sectiontitle', { dataset: { tone: 'budget' } }, [uiIcon('credit-card', 20), t('Ngân sách')]),
      el('button.loverhome__link', { onclick: () => ctx.navigate('/budget') }, `${t('Xem tất cả')} →`),
    ]),
    budget.items.length
      ? el('div.loverhome__budgetitems', {}, [...budget.items]
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 3)
        .map(budgetCard))
      : el('p.muted', {}, t('Chưa lập ngân sách tháng này.')),
  ]);

  // Vuốt ngang kiểu "hé lộ" — mỗi thẻ chỉ chiếm phần lớn khung, luôn thấy một
  // mẩu thẻ kế tiếp để người dùng biết còn tin phía sau mà vuốt tới. Cố tình
  // KHÔNG bọc trong khung thẻ trắng như các mục khác: một khối card bao quanh
  // làm cuộn ngang trong đó có cảm giác "cuộn lồng trong cuộn", không mịn bằng
  // để carousel tràn thẳng ra rìa màn hình. Chấm tròn đồng bộ theo vị trí cuộn;
  // trình duyệt tự lo phần "dính" từng thẻ nhờ `scroll-snap-type`.
  const newsSection = news.length ? (() => {
    const track = el('div.loverhome__newstrack', {}, news.map((item) => {
      const bookmark = el('button.loverhome__newsbookmark', { 'aria-label': t('Lưu tin') }, uiIcon('bookmark-01', 20));
      bookmark.addEventListener('click', (e) => e.stopPropagation());
      return el('button.loverhome__newscard', { onclick: () => openNewsDetail(item.id, ctx) }, [
        el('div.loverhome__newsimgwrap', {}, [
          item.image ? el('img.loverhome__newsimg', { src: item.image, alt: '', loading: 'lazy' }) : null,
          bookmark,
        ]),
        el('div.loverhome__newsbody', {}, [
          el('h3', {}, item.title),
          el('span.loverhome__newsmeta', {}, [item.category, `${item.read_minutes} ${t('phút')}`].filter(Boolean).join(' · ')),
        ]),
      ]);
    }));

    const dots = news.map((_, i) => el('span.loverhome__dot', { class: i === 0 ? 'is-active' : '' }));
    track.addEventListener('scroll', () => {
      const step = track.children[0]?.offsetWidth || track.clientWidth;
      const index = Math.round(track.scrollLeft / Math.max(1, step));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    }, { passive: true });

    return el('div.loverhome__newsblock', {}, [
      el('div.loverhome__sectionhead', {}, [
        el('div.loverhome__sectiontitle', { dataset: { tone: 'news' } }, [uiIcon('news', 20), t('Tin tức')]),
        el('button.loverhome__link', { onclick: () => ctx.navigate('/news') }, `${t('Xem tất cả')} →`),
      ]),
      el('div.loverhome__newswrap', {}, [track]),
      news.length > 1 ? el('div.loverhome__dots', {}, dots) : null,
    ]);
  })() : null;

  // -------------------------------------------------- biểu đồ chi tiêu tuần/tháng
  // "Tuần" gộp theo ngày (7 cột, tuần hiện tại); "Tháng" gộp theo từng THÁNG
  // dương lịch thật (6 cột, 6 tháng gần nhất kể cả tháng này) — không phải
  // chặng 7 ngày nội bộ tháng hiện tại như trước nữa. Mỗi cột là một cột chồng
  // theo nhóm chi tiêu (màu lấy đúng màu nhóm đã đặt ở Ghi chép chi tiêu), có
  // chú thích màu bên dưới. Cột trục dọc bên trái chỉ là mốc tham khảo (không
  // kẻ đường ngang), đủ để ước lượng độ cao mà không rối mắt.
  const addCategoryAmount = (map, e) => {
    const code = e.category_code || 'other';
    const prev = map.get(code);
    if (prev) prev.amount += e.amount;
    else map.set(code, { code, name: e.category_name || t('Khác'), color: e.category_color || 'var(--bg-grey-500)', amount: e.amount });
  };


  // Kỳ của biểu đồ: Tuần / Tháng (lùi ‹ tới › từng kỳ) hoặc Tuỳ chọn (khoảng ngày).
  let chartRange = 'week';
  let chartOffset = 0;
  let customRange = null;
  const chartBody = el('div.loverhome__chartbody');
  const chartNav = el('div.loverhome__chartnav');
  const chartSum = el('div.loverhome__chartsum');

  const renderChartData = (rawPoints) => {
    // Mỗi cột chỉ tách MÀU của mục chi nhiều nhất trong ngày/tháng đó; mọi mục
    // còn lại gộp thành một phần xám "Các mục khác" — đọc nhanh hơn một cột
    // chồng đủ màu của từng nhóm.
    const REST = 'rest';
    const points = rawPoints.map((p) => {
      const list = [...p.cats.values()].sort((a, b) => b.amount - a.amount);
      if (list.length <= 1) return p;
      const [top, ...others] = list;
      const rest = { code: REST, name: t('Các mục khác'), color: 'var(--grey-300)', amount: others.reduce((s, c) => s + c.amount, 0) };
      return { ...p, cats: new Map([[top.code, top], [REST, rest]]) };
    });
    const totals = points.map((p) => [...p.cats.values()].reduce((s, c) => s + c.amount, 0));
    const maxVal = Math.max(...totals, 1);
    const axis = [maxVal, (maxVal * 2) / 3, maxVal / 3, 0];

    // Thứ tự nhóm cố định theo tổng chi cả giai đoạn — mỗi nhóm luôn nằm cùng
    // một vị trí trong mọi cột, nhìn xuống mới so sánh được nhóm nào tăng giảm.
    const totalByCode = new Map();
    for (const p of points) {
      for (const c of p.cats.values()) totalByCode.set(c.code, (totalByCode.get(c.code) || 0) + c.amount);
    }
    // Phần xám "Các mục khác" luôn nằm trên, mục chi nhiều nhất nằm sát đáy cột.
    const order = [...totalByCode.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code)
      .sort((a, b) => (a === REST) - (b === REST));

    // Chạm vào một lát hay cả cột thì hiện một bong bóng nhỏ ngay phía trên,
    // báo đúng tên nhóm + số tiền — hover/title không có tác dụng trên máy
    // chạm, nên số tiền của từng lát phải lộ ra bằng một cú chạm thật.
    const tip = el('div.loverhome__charttip');
    let hideTipTimer = null;
    const showTip = (targetEl, label, amount) => {
      clearTimeout(hideTipTimer);
      tip.textContent = `${label}: ${vnd(amount)}`;
      // px của cửa sổ → px bên trong màn hình (khung máy có thể đang thu phóng).
      const k = screenScale();
      const plotBox = plot.getBoundingClientRect();
      const targetBox = targetEl.getBoundingClientRect();
      tip.style.left = `${(targetBox.left - plotBox.left + targetBox.width / 2) / k}px`;
      tip.style.top = `${(targetBox.top - plotBox.top) / k}px`;
      tip.classList.add('is-visible');
      hideTipTimer = setTimeout(() => tip.classList.remove('is-visible'), 2500);
    };

    const bars = points.map((p, i) => {
      const segs = order
        .map((code) => p.cats.get(code))
        .filter(Boolean)
        .map((c) => {
          const seg = el('div.loverhome__barseg', {
            // Chiều cao từng lát: phần của nhóm này TRONG TỔNG CỦA CHÍNH CỘT
            // (không phải so với max) — chồng lại vừa khít 100% cột dù cột
            // cao hay thấp.
            style: { height: `${Math.round((c.amount / totals[i]) * 100)}%`, background: c.color },
          });
          seg.addEventListener('click', (e) => { e.stopPropagation(); showTip(seg, c.name, c.amount); });
          return seg;
        });

      const barEl = el('div.loverhome__bar', {
        // Chiều cao cả cột: tổng ngày/tuần này so với max — cột thấp cho ngày
        // chi ít, y hệt bản một màu cũ.
        style: { height: `${Math.max(4, Math.round((totals[i] / maxVal) * 100))}%` },
      }, segs);
      // Cột không có lát nào (ngày/tuần không chi gì) vẫn chạm được, báo 0đ.
      if (!segs.length) barEl.addEventListener('click', () => showTip(barEl, p.title, 0));
      // Tổng của cột ghi sẵn ngay trên đầu cột ("53k", "1,2tr") để nhìn lướt là
      // thấy số mỗi ngày / mỗi tháng, không cần chạm. Không chi gì thì để trống.
      const height = Math.max(4, Math.round((totals[i] / maxVal) * 100));
      const total = totals[i] > 0
        ? el(`span.loverhome__bartotal${totals[i] === maxVal ? '.is-max' : ''}`, { style: { bottom: `${height}%` } }, vndShort(totals[i]))
        : null;
      return el('div.loverhome__barcol', {
        'aria-label': `${p.title}: ${vnd(totals[i])}`,
      }, [total, barEl]);
    });

    const plot = el('div.loverhome__chartplot', {}, [
      el('div.loverhome__bars', {}, bars),
      el('div.loverhome__barlabels', {}, points.map((p) => el('span', {}, p.label))),
      tip,
    ]);

    mount(chartBody, el('div', {}, [
      el('div.loverhome__chartrow', {}, [
        el('div.loverhome__chartaxis', {}, axis.map((v) => el('span', {}, vndShort(v)))),
        plot,
      ]),
      order.length ? el('div.loverhome__chartlegend', {}, order.map((code) => {
        const sample = points.map((p) => p.cats.get(code)).find(Boolean);
        return el('span.loverhome__legenditem', {}, [
          el('i', { style: { background: sample.color } }),
          sample.name,
        ]);
      })) : null,
    ]));
  };

  // --- kỳ xem: tính ngày bắt đầu / kết thúc + cách chia cột ------------------------
  const todayKey = ctx.world.today;
  const dayNum = (key) => Date.parse(`${key}T00:00:00Z`) / 86400000;
  const spanDays = (from, to) => dayNum(to) - dayNum(from) + 1;
  const mondayOf = (key) => addDaysKey(key, -((new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7));
  const endOfMonthKey = (month) => addDaysKey(`${addMonthsKey(month, 1)}-01`, -1);
  const ddmm = (key) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
  const periodOf = () => {
    if (chartRange === 'week') {
      const from = addDaysKey(mondayOf(todayKey), chartOffset * 7);
      return { from, to: addDaysKey(from, 6) };
    }
    if (chartRange === 'month') {
      const month = addMonthsKey(todayKey.slice(0, 7), chartOffset);
      return { from: `${month}-01`, to: endOfMonthKey(month), month };
    }
    return customRange;
  };
  // Kỳ liền trước cùng độ dài — để so sánh "nhiều / ít hơn kỳ trước".
  const previousOf = (p) => {
    if (chartRange === 'month') { const m = addMonthsKey(p.month, -1); return { from: `${m}-01`, to: endOfMonthKey(m) }; }
    const n = spanDays(p.from, p.to);
    return { from: addDaysKey(p.from, -n), to: addDaysKey(p.from, -1) };
  };
  const titleOf = (p) => {
    if (chartRange === 'week') {
      if (chartOffset === 0) return t('Tuần này');
      if (chartOffset === -1) return t('Tuần trước');
      return `${ddmm(p.from)} – ${ddmm(p.to)}`;
    }
    if (chartRange === 'month') {
      if (chartOffset === 0) return t('Tháng này');
      if (chartOffset === -1) return t('Tháng trước');
      return t('Tháng {n}', { n: `${Number(p.month.slice(5, 7))}/${p.month.slice(0, 4)}` });
    }
    return `${ddmm(p.from)}/${p.from.slice(0, 4)} – ${ddmm(p.to)}/${p.to.slice(0, 4)}`;
  };
  // Chia cột: tuần → 7 ngày; tháng → từng tuần trong tháng; tuỳ chọn → ngày (≤ 14
  // ngày), tuần (≤ 13 tuần) hoặc tháng.
  const barsOf = (p, data) => {
    const byDay = new Map();
    for (const e of data.expenses) {
      if (!byDay.has(e.spent_on)) byDay.set(e.spent_on, []);
      byDay.get(e.spent_on).push(e);
    }
    const bucket = (from, to, label, title) => {
      const cats = new Map();
      for (let k = from; k <= to; k = addDaysKey(k, 1)) (byDay.get(k) || []).forEach((e) => addCategoryAmount(cats, e));
      return { label, title, cats };
    };
    const n = spanDays(p.from, p.to);
    if (chartRange === 'week') return LOVER_DAYS.map((label, i) => bucket(addDaysKey(p.from, i), addDaysKey(p.from, i), label, `${label} ${ddmm(addDaysKey(p.from, i))}`));
    if (chartRange === 'custom' && n <= 14) return Array.from({ length: n }, (_, i) => { const k = addDaysKey(p.from, i); return bucket(k, k, ddmm(k), ddmm(k)); });
    if (chartRange === 'custom' && n > 91) {
      const out = [];
      for (let m = p.from.slice(0, 7); m <= p.to.slice(0, 7); m = addMonthsKey(m, 1)) {
        const f = `${m}-01` < p.from ? p.from : `${m}-01`;
        const e = endOfMonthKey(m) > p.to ? p.to : endOfMonthKey(m);
        out.push(bucket(f, e, `T${Number(m.slice(5, 7))}`, t('Tháng {n}', { n: `${Number(m.slice(5, 7))}/${m.slice(0, 4)}` })));
      }
      return out;
    }
    // Tháng: Tuần 1, Tuần 2… của tháng (mỗi tuần từ ngày – đến ngày).
    if (chartRange === 'month') return monthWeeks(p.from, p.to).map((w) => bucket(w.from, w.to, t('Tuần {n}', { n: w.n }), `${t('Tuần {n}', { n: w.n })} (${ddmm(w.from)} – ${ddmm(w.to)})`));
    // Tuỳ chọn dài: từng tuần (thứ Hai – Chủ nhật), cắt theo đầu / cuối kỳ.
    const out = [];
    for (let f = p.from; f <= p.to;) {
      const e0 = addDaysKey(mondayOf(f), 6);
      const e = e0 > p.to ? p.to : e0;
      out.push(bucket(f, e, `${Number(f.slice(8, 10))}–${Number(e.slice(8, 10))}`, `${ddmm(f)} – ${ddmm(e)}`));
      f = addDaysKey(e, 1);
    }
    return out;
  };

  const sumOf = (data) => data.expenses.reduce((n, e) => n + e.amount, 0);
  const fetchRange = (r) => api.get(`/api/expenses?from=${r.from}&to=${r.to}`);
  let chartSeq = 0;
  const loadChart = async () => {
    const seq = (chartSeq += 1);
    const p = periodOf();
    drawNav(p);
    chartBody.classList.add('is-loading');
    // Tuần này: dùng lại dữ liệu đã tải ở trên, khỏi gọi thêm API.
    const [data, prev] = await Promise.all([
      chartRange === 'week' && chartOffset === 0 ? Promise.resolve(week) : fetchRange(p),
      fetchRange(previousOf(p)).catch(() => null),
    ]).catch(() => [null, null]);
    if (seq !== chartSeq) return; // người dùng đã bấm sang kỳ khác
    chartBody.classList.remove('is-loading');
    if (!data) { mount(chartBody, el('p.muted', {}, t('Không tải được biểu đồ'))); return; }
    const total = sumOf(data);
    const before = prev ? sumOf(prev) : null;
    const diff = before ? Math.round(((total - before) / before) * 100) : null;
    chartSum.replaceChildren(...[
      el('span', {}, [t('Tổng chi'), ' ', el('b', {}, vnd(total))]),
      diff === null || total === 0 ? null : el(`span.loverhome__chartdiff${diff > 0 ? '.is-up' : diff < 0 ? '.is-down' : ''}`, {},
        diff === 0 ? t('bằng kỳ trước') : diff > 0 ? t('nhiều hơn {n}% so với kỳ trước', { n: diff }) : t('ít hơn {n}% so với kỳ trước', { n: -diff })),
    ].filter(Boolean));
    renderChartData(barsOf(p, data));
  };

  // Hàng điều hướng: ‹ kỳ trước · tên kỳ · kỳ sau ›; Tuỳ chọn thì hai ô ngày.
  const fromIn = el('input.loverhome__chartdate', { type: 'date', max: todayKey, 'aria-label': t('Từ ngày') });
  const toIn = el('input.loverhome__chartdate', { type: 'date', max: todayKey, 'aria-label': t('Đến ngày') });
  const applyCustom = () => {
    if (!fromIn.value || !toIn.value || fromIn.value > toIn.value) { toast(t('Chọn ngày bắt đầu trước ngày kết thúc'), 'error'); return; }
    if (spanDays(fromIn.value, toIn.value) > 366) { toast(t('Chỉ xem được tối đa 1 năm một lần'), 'error'); return; }
    customRange = { from: fromIn.value, to: toIn.value };
    loadChart();
  };
  function drawNav(p) {
    if (chartRange === 'custom') {
      fromIn.value = p.from; toIn.value = p.to;
      chartNav.replaceChildren(el('div.loverhome__chartrange', {}, [
        fromIn, el('span', { 'aria-hidden': 'true' }, '–'), toIn,
        el('button.loverhome__chartgo', { type: 'button', onclick: applyCustom }, t('Xem')),
      ]));
      return;
    }
    const step = (d) => { chartOffset += d; loadChart(); };
    chartNav.replaceChildren(
      el('button.loverhome__chartstep', { type: 'button', 'aria-label': chartRange === 'week' ? t('Tuần trước') : t('Tháng trước'), onclick: () => step(-1) }, '‹'),
      el('div.loverhome__chartperiod', {}, [el('b', {}, titleOf(p)), el('small', {}, `${ddmm(p.from)} – ${ddmm(p.to)}/${p.to.slice(0, 4)}`)]),
      el('button.loverhome__chartstep', {
        type: 'button', 'aria-label': chartRange === 'week' ? t('Tuần sau') : t('Tháng sau'),
        disabled: chartOffset >= 0, onclick: () => step(1),
      }, '›'),
    );
  }

  const periodPick = el('div.periodpick.loverhome__periodpick', {}, [
    { key: 'week', label: t('Tuần') },
    { key: 'month', label: t('Tháng') },
    { key: 'custom', label: t('Tuỳ chọn') },
  ].map((opt) => el('button', {
    type: 'button',
    'aria-pressed': String(chartRange === opt.key),
    onclick: (e) => {
      if (chartRange === opt.key) return;
      chartRange = opt.key;
      chartOffset = 0;
      // Tuỳ chọn mở sẵn 30 ngày gần nhất; người dùng đổi hai ô ngày rồi bấm Xem.
      if (opt.key === 'custom' && !customRange) customRange = { from: addDaysKey(todayKey, -29), to: todayKey };
      [...periodPick.children].forEach((btn) => btn.setAttribute('aria-pressed', String(btn === e.currentTarget)));
      loadChart();
    },
  }, opt.label)));

  loadChart();

  // Ghi chép chi tiêu HÔM NAY — lấy luôn từ dữ liệu tuần đã tải ở trên (khỏi
  // gọi thêm API), lọc theo đúng ngày hôm nay. Đặt phía TRÊN biểu đồ vì đây là
  // việc "vừa mới xảy ra", còn biểu đồ là cái nhìn tổng hợp lùi lại sau.
  // Dùng lại đúng kiểu thẻ ngày (thứ + ngày, các dòng chi, tổng ngày) của
  // màn Ghi chép chi tiêu, để hai nơi nhất quán.
  const todayExpenses = week.expenses.filter((e) => e.spent_on === ctx.world.today);
  const todayTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Thẻ ngày (`.expdaycard`) đã tự có khung/bóng đổ riêng — không bọc thêm
  // `.loverhome__section` để tránh "thẻ lồng thẻ", theo đúng cách khối Tin tức
  // cũng cố tình không bọc khung ở trên.
  const todaySection = el('div.loverhome__todayblock', {}, [
    el('div.loverhome__sectionhead', {}, [
      el('div.loverhome__sectiontitle', { dataset: { tone: 'expenses' } }, [uiIcon('note-edit', 20), t('Ghi chép chi tiêu hôm nay')]),
      el('button.loverhome__link', { onclick: () => ctx.navigate('/expenses') }, `${t('Xem tất cả')} →`),
    ]),
    el('div.expdaycard', {}, [
      dayCardHead(ctx.world.today),
      todayExpenses.length
        ? el('div.expdaycard__rows', {}, [
          ...todayExpenses.slice(0, 4).map((expense) => todayExpenseRow(ctx, expense, categories, rerender)),
          // Màn home chỉ để tối đa 4 dòng cho gọn — quá số đó thì mời xem hết
          // trong màn Ghi chép chi tiêu, không liệt kê dài vô hạn ở đây.
          todayExpenses.length > 4
            ? el('button.expdaycard__more', { onclick: () => ctx.navigate('/expenses') },
              t('+{n} khoản khác — xem chi tiết', { n: todayExpenses.length - 4 }))
            : null,
        ])
        : el('p.muted', { style: { padding: '0 var(--spacing-16) var(--spacing-14)' } }, t('Chưa ghi khoản chi nào hôm nay.')),
      todayExpenses.length ? dayTotalFoot(todayTotal, todayExpenses.length) : null,
    ]),
  ]);

  const chartSection = el('div.loverhome__block', {}, [
    el('div.loverhome__sectionhead', {}, [
      el('div.loverhome__sectiontitle', { dataset: { tone: 'chart' } }, [uiIcon('chart-increase', 20), t('Chi tiêu')]),
      periodPick,
    ]),
    el('div.loverhome__section', {}, [chartNav, chartSum, chartBody]),
  ]);

  // Chỉ trả về đúng nội dung — shell (`screen__body--flush.loverhome-shell`,
  // với padding đáy vừa đúng chiều cao thanh dưới cùng) nằm ở `container`
  // trong loverHome() phía trên rồi, không lặp lại ở đây nữa.
  // Tin tức xuống cuối: số liệu của chính người dùng (ngân sách, chi tiêu hôm
  // nay, biểu đồ) đọc trước, nội dung đọc thêm để sau.
  // Ekko Lover: đầu màn là thẻ hồ sơ đầy đủ thay cho thanh nav nhỏ. Bấm vào heo
  // mở trang Cấp độ heo (các cấp + hoạt động gần đây); riêng ô "Huy hiệu" mở
  // trang Huy hiệu.
  const head = ctx.world.concept === 'lover' ? (() => {
    const card = profileCard(ctx.world);
    card.classList.add('profilecard--home');
    const badgeStat = card.querySelector('[data-stat="badges"]');
    const challengeStat = card.querySelector('[data-stat="challenges"]');
    // Hai ô Huy hiệu / Thử thách là nút riêng; phần còn lại của thẻ (heo, cấp,
    // thanh tiến độ) mở Cấp độ heo. Vùng heo là nút cho bàn phím / trình đọc màn
    // hình, cả thẻ không đặt role=button để hai nút bên trong không bị nuốt.
    const head = card.querySelector('.profilecard__head');
    head.setAttribute('role', 'button');
    head.tabIndex = 0;
    head.setAttribute('aria-label', t('Xem cấp độ heo và hoạt động gần đây'));
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.navigate('/level'); }
    });
    card.addEventListener('click', (event) => {
      if (badgeStat?.contains(event.target)) return ctx.navigate('/badges');
      if (challengeStat?.contains(event.target)) return ctx.navigate('/challenges');
      ctx.navigate('/level');
    });
    if (badgeStat) badgeStat.setAttribute('aria-label', t('Xem huy hiệu'));
    if (challengeStat) challengeStat.setAttribute('aria-label', t('Xem thử thách'));
    return card;
  })() : navbar;

  // Heo Dream Team: bạn cùng đội nhắc giữ streak hôm nay — một dòng màu vàng
  // ngay dưới thẻ heo, hiện cả ngày tới khi giữ được streak. Bấm vào mở Học tập
  // (học một bài là giữ được chuỗi).
  const nudgedBy = ctx.world.team?.nudgedBy || [];
  const shortName = (name) => String(name || '').trim().split(/\s+/).slice(-2).join(' ');
  const streakNudge = ctx.world.concept === 'lover' && nudgedBy.length && !ctx.world.streak?.countedToday
    ? el('button.streaknudge', { type: 'button', onclick: () => ctx.navigate('/explore') }, [
      el('span.streaknudge__icon', { 'aria-hidden': 'true' }, uiIcon('fire', 18)),
      el('span.streaknudge__text', {}, nudgedBy.length === 1
        ? t('{name} nhắc bạn giữ streak hôm nay', { name: shortName(nudgedBy[0]) })
        : t('{n} bạn trong đội nhắc bạn giữ streak hôm nay', { n: nudgedBy.length })),
      el('span.streaknudge__go', { 'aria-hidden': 'true' }, spriteIcon('chevron-right-01', 18)),
    ])
    : null;

  // Ekko Lover: lời nhắc nhỏ một dòng ngay dưới thẻ heo, hiện ngẫu nhiên (xem
  // NUDGE_CHANCE). Bấm vào mở hành trình học tập, giống nút Học tập. Học hết
  // bài rồi thì không nhắc.
  const next = ctx.world.learning?.next;
  const resume = ctx.world.concept === 'lover' && next && showNudge && !streakNudge ? el('button.resumenudge', {
    type: 'button',
    onclick: () => ctx.navigate('/explore'),
  }, [
    el('span.resumenudge__icon', { 'aria-hidden': 'true' }, uiIcon('book-open-01', 20)),
    el('span.resumenudge__text', {}, t('Quay lại hành trình an sinh tài chính cùng Ekko nhé!')),
    el('span.resumenudge__go', { 'aria-hidden': 'true' }, spriteIcon('chevron-right-01', 20)),
  ]) : null;

  // EkkoFeed: công ty đã phản hồi góp ý — dòng vàng như lời nhắc streak, bấm mở EkkoFeed.
  const feedUnread = ctx.world.feed?.unreadReplies || 0;
  const feedNudge = ctx.world.concept === 'lover' && feedUnread
    ? el('button.streaknudge', { type: 'button', onclick: () => ctx.navigate('/feed') }, [
      el('span.streaknudge__icon', { 'aria-hidden': 'true' }, uiIcon('bubble-chat', 18)),
      el('span.streaknudge__text', {}, t('Công ty đã phản hồi góp ý của bạn')),
      el('span.streaknudge__go', { 'aria-hidden': 'true' }, spriteIcon('chevron-right-01', 18)),
    ])
    : null;

  // EkkoFeed: thanh ngang riêng, màu nổi bật, ngay dưới thẻ chức năng — để người lao
  // động dễ thấy, không lẫn vào 5 nút chức năng.
  const feedBar = ctx.world.concept === 'lover'
    ? el('button.feedbar', { type: 'button', onclick: () => ctx.navigate('/feed') }, [
      el('span.feedbar__icon', { 'aria-hidden': 'true' }, uiIcon('bubble-chat', 22)),
      el('span.feedbar__text', {}, [
        el('b', {}, t('Góp ý tới công ty')),
        el('small', {}, t('Chia sẻ hoặc góp ý điều cần giải quyết — ẩn danh nếu muốn')),
      ]),
      el('span.feedbar__go', { 'aria-hidden': 'true' }, spriteIcon('chevron-right-01', 20)),
    ])
    : null;

  return el('div.loverhome', {}, [
    head,
    on('team') ? streakNudge : null,
    on('feed') ? feedNudge : null,
    on('learning') ? resume : null,
    tabcard,
    on('feed') ? feedBar : null,
    savingsRecapBanner, recapBanner,
    on('expenses') ? todaySection : null,
    on('budget') ? budgetSection : null,
    on('expenses') ? chartSection : null,
    newsSection,
  ]);
}
