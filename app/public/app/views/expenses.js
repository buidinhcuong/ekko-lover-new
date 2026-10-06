/** Ghi chép chi tiêu: fast manual entry, plus the same log Ekko bot writes to. */
import { api, dataIcon, el, formatDay, guard, mount, singleFlight, spriteIcon, toast, uiIcon, vnd } from '/shared/client.js';
import { closeSheet, confirmSheet, moneyInput, readMoney, sheet, swipeRow } from '../ui.js';
import { getLang, t } from '../i18n.js';
import { micIcon, openVoiceNote } from '../voice.js';
import { readReceipt, shrinkImage } from '../receiptLocal.js';

const LOVER_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
// Nhãn đầy đủ chỉ dùng cho dòng highlight "ngày chi nhiều nhất" — trong biểu
// đồ vẫn giữ chữ tắt T2..CN cho gọn, không đủ chỗ ghi hết "Thứ Hai".
const FULL_DAY_LABEL = { T2: 'Thứ 2', T3: 'Thứ 3', T4: 'Thứ 4', T5: 'Thứ 5', T6: 'Thứ 6', T7: 'Thứ 7', CN: 'Chủ Nhật' };

/** Cộng ngày trên chuỗi YYYY-MM-DD, không lệ thuộc múi giờ thiết bị. */
function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const monthLabel = (month) => {
  const [y, m] = month.split('-');
  if (getLang() === 'en') {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)));
  }
  return `Tháng ${Number(m)}/${y}`;
};

const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
};

export default async function expensesView(ctx) {
  const container = el('div');
  let month = ctx.world.today.slice(0, 7);
  const rerender = async (nextMonth = month) => {
    month = nextMonth;
    mount(container, await body(ctx, month, rerender));
  };
  mount(container, await body(ctx, month, rerender));
  return container;
}

async function body(ctx, month, rerender) {
  const currentMonth = ctx.world.today.slice(0, 7);
  const isCurrent = month === currentMonth;

  // Xem tháng hiện tại thì cần dữ liệu tuần (biểu đồ 7 ngày + sổ chi tuần này);
  // xem một tháng khác thì thay vào đó cần dữ liệu THÁNG HIỆN TẠI để so sánh —
  // hai thứ này không dùng cùng lúc nên chỉ gọi đúng cái đang cần.
  const [monthData, weekData, categories, income, currentMonthData] = await Promise.all([
    api.get(`/api/expenses?month=${month}`),
    isCurrent ? api.get('/api/expenses?range=week') : Promise.resolve(null),
    api.get('/api/categories'),
    isCurrent ? api.get(`/api/expenses/income?month=${month}`) : Promise.resolve(null),
    isCurrent ? Promise.resolve(null) : api.get(`/api/expenses?month=${currentMonth}`),
  ]);

  const monthNav = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' } }, [
    el('button.iconbtn', { onclick: () => rerender(shiftMonth(month, -1)), 'aria-label': t('Tháng trước') }, [spriteIcon('chevron-left-01-stroke', 20)]),
    el('div', { style: { flex: '1', textAlign: 'center' } }, [
      el('div', { style: { fontSize: 'var(--font-size-text-lg)', fontWeight: 'var(--font-weight-semibold)' } }, monthLabel(month)),
      isCurrent ? el('div.muted', {}, t('Tháng hiện tại')) : null,
    ]),
    el('button.iconbtn', { onclick: () => rerender(shiftMonth(month, 1)), 'aria-label': t('Tháng sau') }, [spriteIcon('chevron-right-01-stroke', 20)]),
  ]);

  const actions = el('div.expenseactions', {}, [
    el('button.expenseaction.expenseaction--income', {
      onclick: () => openAddIncome(ctx, rerender),
    }, [el('span.expenseaction__icon', {}, uiIcon('money-bag-02', 24)), t('Thu nhập')]),
    el('button.expenseaction.expenseaction--expense', {
      onclick: () => openAdd(ctx, categories, rerender),
    }, [el('span.expenseaction__icon', {}, uiIcon('invoice-01', 24)), t('Chi tiêu')]),
  ]);

  // Ba trường hợp: (1) tháng hiện tại — giữ nguyên bảng trung tâm + sổ chi
  // tuần; (2) tháng khác nhưng không có khoản chi nào — báo rõ "chưa có dữ
  // liệu" thay vì để lộ số liệu tuần/tháng hiện tại gây hiểu lầm là của tháng
  // đang xem; (3) tháng khác có dữ liệu — thay bằng hai biểu đồ so sánh với
  // tháng hiện tại (tổng tiền, và theo từng nhóm chi tiêu).
  let sections;
  if (isCurrent) {
    sections = [
      centralPanel(ctx, monthData, weekData, income),
      weekSection(ctx, weekData, categories, rerender),
    ];
  } else if (monthData.totals.total === 0) {
    sections = [emptyMonthPanel(month)];
  } else {
    sections = [
      compareTotalCard(month, monthData.totals.total, currentMonth, currentMonthData.totals.total),
      compareGroupsCard(month, monthData, currentMonth, currentMonthData),
    ];
  }

  // Simple mode: ghi chép bằng giọng nói là cách chính, đặt ngay đầu màn.
  const voice = ctx.world.concept === 'simple' && isCurrent
    ? el('button.simplehome__voice.expview__voice', {
      type: 'button', onclick: () => openVoiceNote(ctx, { onSaved: () => rerender() }),
    }, [
      el('span.simplehome__voicemic', {}, [micIcon(36)]),
      el('span.simplehome__voicetext', {}, [
        el('strong', {}, t('Nói để ghi chi tiêu')),
        el('span', {}, t('Bấm rồi nói: “Cà phê ba mươi lăm nghìn”')),
      ]),
    ])
    : null;

  return el('div.expview', {}, [voice, monthNav, actions, ...sections]);
}

/** Tháng đang xem (không phải tháng hiện tại) chưa có khoản chi nào. */
function emptyMonthPanel(month) {
  return el('div.empty', {}, [
    el('img', { src: '/assets/lessons/ghi-chep-3-phut.svg', alt: '' }),
    el('h3', {}, t('Chưa có dữ liệu')),
    el('p.muted', {}, t('Bạn chưa ghi khoản chi nào trong {month}.', { month: monthLabel(month) })),
  ]);
}

/** Một hàng trong thẻ so sánh: nhãn + số tiền bên trên, thanh ngang bên dưới. */
function compareRow(label, amount, maxTotal, tone) {
  return el('div', { style: { marginTop: tone === 'current' ? '10px' : '0' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-text-sm)', marginBottom: '4px' } }, [
      el('span', { class: tone === 'current' ? 'muted' : '', style: { fontWeight: tone === 'view' ? '600' : '400' } }, label),
      el('b', {}, vnd(amount)),
    ]),
    el('div.bar', {}, [
      el(`div.bar__fill${tone === 'current' ? '.bar__fill--muted' : ''}`, { style: { width: `${Math.round((amount / maxTotal) * 100)}%` } }),
    ]),
  ]);
}

/** So sánh tổng chi tiêu của tháng đang xem với tháng hiện tại. */
function compareTotalCard(month, monthTotal, currentMonth, currentTotal) {
  const maxTotal = Math.max(1, monthTotal, currentTotal);
  const delta = currentTotal > 0 ? Math.round(((monthTotal - currentTotal) / currentTotal) * 100) : null;

  return el('div.card', {}, [
    el('div.card__head', {}, [el('h3', {}, t('So sánh tổng chi tiêu'))]),
    compareRow(monthLabel(month), monthTotal, maxTotal, 'view'),
    compareRow(t('Tháng hiện tại'), currentTotal, maxTotal, 'current'),
    delta === null ? null : el('p.muted', { style: { marginTop: '10px', fontSize: 'var(--font-size-text-sm)' } }, delta === 0
      ? t('Bằng tháng hiện tại.')
      : delta > 0
        ? t('Cao hơn {percent}% so với tháng hiện tại.', { percent: delta })
        : t('Thấp hơn {percent}% so với tháng hiện tại.', { percent: Math.abs(delta) })),
  ]);
}

/** So sánh chi tiêu theo từng nhóm (Nhu cầu/Mong muốn/Sự cố) giữa hai tháng. */
function compareGroupsCard(month, monthData, currentMonth, currentMonthData) {
  const viewGroups = groupByLevel1(monthData.byCategory);
  const curGroups = groupByLevel1(currentMonthData.byCategory);

  const byCode = new Map();
  for (const g of viewGroups) byCode.set(g.code, { code: g.code, label: g.label, icon: g.icon, view: g.total, current: 0 });
  for (const g of curGroups) {
    if (byCode.has(g.code)) byCode.get(g.code).current = g.total;
    else byCode.set(g.code, { code: g.code, label: g.label, icon: g.icon, view: 0, current: g.total });
  }
  const groups = [...byCode.values()].sort((a, b) => (b.view + b.current) - (a.view + a.current));
  if (!groups.length) return null;

  return el('div.card', {}, [
    el('div.card__head', {}, [el('h3', {}, t('So sánh theo nhóm chi tiêu'))]),
    ...groups.map((g, i) => el('div', { style: { marginTop: i === 0 ? '0' : '18px' } }, [
      el('div.withicon', { style: { fontSize: 'var(--font-size-text-sm)', fontWeight: 'var(--font-weight-semibold)', marginBottom: '6px' } }, [dataIcon(g.icon, 'package', 16), g.label]),
      compareRow(monthLabel(month), g.view, Math.max(1, g.view, g.current), 'view'),
      compareRow(t('Tháng hiện tại'), g.current, Math.max(1, g.view, g.current), 'current'),
    ])),
  ]);
}

/**
 * Bảng dữ liệu trung tâm: tổng chi tháng này (trái) đối lên biểu đồ so sánh 7
 * ngày của tuần hiện tại (phải), highlight ngày chi nhiều nhất, rồi progress
 * bar chi tháng chia theo nhóm level 1 — bấm vào mới lộ level 2 (màn riêng).
 */
function centralPanel(ctx, monthData, weekData, income) {
  const days = LOVER_DAYS.map((label, i) => {
    const day = addDaysKey(weekData.from, i);
    const total = weekData.expenses.filter((e) => e.spent_on === day).reduce((sum, e) => sum + e.amount, 0);
    return { day, label, total };
  });
  const maxTotal = Math.max(1, ...days.map((d) => d.total));
  const busiest = days.reduce((a, b) => (b.total > a.total ? b : a), days[0]);

  const groups = groupByLevel1(monthData.byCategory);
  const groupsTotal = Math.max(1, ...groups.map((g) => g.total), monthData.totals.total);

  return el('div.expcentral', {}, [
    el('div.expcentral__top', {}, [
      el('div', {}, [
        el('div.expcentral__label', {}, t('Tổng chi tiêu trong tháng')),
        el('div.expcentral__amount', {}, vnd(monthData.totals.total)),
        income.amount > 0 ? (() => {
          const remaining = income.amount - monthData.totals.total;
          return el(`div.expcentral__remaining${remaining < 0 ? '.is-over' : ''}`, {}, remaining >= 0
            ? t('Còn lại {amount}', { amount: vnd(remaining) })
            : t('Vượt thu nhập {amount}', { amount: vnd(-remaining) }));
        })() : null,
      ]),
      lineChart(days, maxTotal, busiest),
    ]),
    busiest.total > 0 ? el('div.expcentral__highlight', {}, [
      uiIcon('fire', 16), t('Ngày chi tiêu nhiều nhất: {day}: {amount}', { day: FULL_DAY_LABEL[busiest.label] || busiest.label, amount: vnd(busiest.total) }),
    ]) : null,
    groups.length ? el('button.expcentral__groups', { onclick: () => ctx.navigate('/expenses/groups') }, [
      el('div.expcentral__groupshead', {}, [t('Chi tháng này theo nhóm'), el('small', {}, `${t('Xem chi tiết')} →`)]),
      ...groups.map((g) => el('div.expcentral__grouprow', {}, [
        el('div.expcentral__grouplabel', {}, [
          el('span.withicon', {}, [dataIcon(g.icon, 'package', 16), g.label]),
          el('small', {}, vnd(g.total)),
        ]),
        el('div.bar', {}, [el('div.bar__fill', { style: { width: `${Math.round((g.total / groupsTotal) * 100)}%` } })]),
      ])),
    ]) : null,
  ]);
}

/**
 * Line chart 7 ngày, gọn cho khung nhỏ bên phải bảng trung tâm. Chạm vào một
 * điểm hiện bong bóng tên ngày + số tiền — giống cách chạm-hiện-số ở biểu đồ
 * màn chủ Ekko Lover, vì `title` không có tác dụng trên máy chạm.
 */
function lineChart(days, maxTotal, busiest) {
  const W = 132;
  const H = 46;
  const PAD_X = 8;
  const points = days.map((d, i) => ({
    ...d,
    x: PAD_X + (i * (W - PAD_X * 2)) / (days.length - 1),
    y: 4 + (H - 8) * (1 - d.total / maxTotal),
  }));

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'expcentral__linesvg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  let line = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const midX = (a.x + b.x) / 2;
    line += ` C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
  }
  const area = `${line} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`;

  const areaPath = document.createElementNS(ns, 'path');
  areaPath.setAttribute('class', 'expcentral__linearea');
  areaPath.setAttribute('d', area);
  const linePath = document.createElementNS(ns, 'path');
  linePath.setAttribute('class', 'expcentral__lineline');
  linePath.setAttribute('d', line);
  svg.append(areaPath, linePath);

  for (const p of points) {
    const isMax = p.day === busiest.day && busiest.total > 0;
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('class', `expcentral__linedot${isMax ? ' is-max' : ''}`);
    dot.setAttribute('cx', p.x);
    dot.setAttribute('cy', p.y);
    dot.setAttribute('r', isMax ? 3.2 : 2);
    svg.append(dot);
  }

  const tip = el('div.expcentral__linetip');
  let hideTimer = null;
  const showTip = (p) => {
    clearTimeout(hideTimer);
    tip.textContent = `${p.label}: ${vnd(p.total)}`;
    tip.style.left = `${(p.x / W) * 100}%`;
    tip.style.top = `${(p.y / H) * 100}%`;
    tip.classList.add('is-visible');
    hideTimer = setTimeout(() => tip.classList.remove('is-visible'), 2200);
  };

  const hits = el('div.expcentral__linehits', {}, points.map((p) => el('button', {
    style: { left: `${(p.x / W) * 100}%` },
    'aria-label': `${p.label}: ${vnd(p.total)}`,
    onclick: (e) => { e.stopPropagation(); showTip(p); },
  })));

  return el('div.expcentral__linewrap', {}, [
    svg,
    hits,
    tip,
    el('div.expcentral__linelabels', {}, days.map((d) => el('span', {}, d.label))),
  ]);
}

/** Gộp byCategory (level 2, đã có group_code/group_label từ server) lên level 1. */
function groupByLevel1(byCategory) {
  const GROUP_ICON = { needs: 'shopping-basket-01', wants: 'shopping-bag-01', incident: 'alert-02' };
  const byCode = new Map();
  for (const c of byCategory) {
    const code = c.group_code || 'other';
    if (!byCode.has(code)) byCode.set(code, { code, label: c.group_label || t('Khác'), icon: GROUP_ICON[code] || 'package', total: 0 });
    byCode.get(code).total += c.total;
  }
  return [...byCode.values()].sort((a, b) => b.total - a.total);
}

const MIN_DAYS_SHOWN = 3;

/**
 * Ghi chép chi tiêu trong tuần: mỗi ngày một thẻ, gộp cả tiêu đề (ngày, thứ,
 * tổng) và danh sách khoản chi trong CÙNG một khối — không tách rời như bản
 * cũ, để giống đúng cách trình bày sổ chi tiêu quen mắt (số ngày to, thứ +
 * tháng/năm bên cạnh, tổng ngày ở phải).
 *
 * Luôn hiện ít nhất `MIN_DAYS_SHOWN` ngày gần nhất, kể cả ngày chưa ghi gì —
 * chỉ vài ngày có dữ liệu thì trang trông trống trải, không toát ra được cảm
 * giác "sổ ghi chép" đang chạy liên tục mỗi ngày. Ngày trống vẫn hiện thẻ,
 * chỉ thay danh sách khoản chi bằng một dòng nhắc nhẹ.
 */
function weekSection(ctx, weekData, categories, rerender) {
  const { expenses } = weekData;
  const byDay = new Map(groupByDay(expenses));

  // Lùi dần từ hôm nay để bù đủ số ngày tối thiểu — không giới hạn theo đầu
  // tuần (`weekData.from`) vì đây chỉ là ngày trống cần vẽ thêm, không cần dữ
  // liệu thật nào để hiện.
  const days = new Set(byDay.keys());
  for (let i = 0; days.size < MIN_DAYS_SHOWN; i += 1) {
    days.add(addDaysKey(ctx.world.today, -i));
  }
  const sortedDays = [...days].sort((a, b) => (a < b ? 1 : -1));

  return el('div', {}, [
    el('div.expweek__head', {}, [
      el('h2', {}, t('Ghi chép chi tiêu trong tuần')),
      el('button.loverhome__link', { onclick: () => ctx.navigate('/expenses/report') }, `${t('Báo cáo chi tiết')} →`),
    ]),
    el('div', {}, sortedDays.map((day) => dayCard(ctx, day, byDay.get(day) || [], categories, rerender))),
  ]);
}

/**
 * Đầu thẻ một ngày: thứ bên trái (đậm), ngày đầy đủ dạt sang phải.
 * Nền xám nhạt để tách khỏi các dòng chi bên dưới và khác màu dải tổng ở đáy.
 * Dùng chung cho thẻ ngày ở Ghi chép chi tiêu và thẻ "hôm nay" ở màn chủ.
 */
export function dayCardHead(day) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const locale = getLang() === 'en' ? 'en-US' : 'vi-VN';
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(date);
  const pad = (n) => String(n).padStart(2, '0');
  return el('div.expdaycard__head', {}, [
    el('span.expdaycard__weekday', {}, weekday),
    el('span.expdaycard__date', {}, `${pad(d)}/${pad(m)}/${y}`),
  ]);
}

function dayCard(ctx, day, list, categories, rerender) {
  const total = list.reduce((sum, e) => sum + e.amount, 0);

  return el('div.expdaycard', {}, [
    dayCardHead(day),
    list.length
      ? el('div.expdaycard__rows', {}, list.map((expense) => expenseRow(ctx, expense, categories, rerender)))
      : el('p.expdaycard__empty', {}, t('Chưa ghi khoản chi nào')),
    list.length ? dayTotalFoot(total, list.length) : null,
  ]);
}

/**
 * Dải tổng ở chân thẻ ngày. Trước đây tổng nằm cùng hàng tiêu đề, cùng cỡ, cùng
 * màu với từng khoản chi — nhìn lướt thì tưởng là thêm một khoản nữa. Đặt dưới
 * cùng, trên nền riêng, số in đậm màu nhấn: đọc hết các khoản rồi mới tới tổng,
 * đúng thứ tự một tờ hoá đơn.
 */
export function dayTotalFoot(total, count) {
  return el('div.expdaycard__foot', {}, [
    el('span.expdaycard__footlabel', {}, [
      t('Tổng chi trong ngày'),
      el('span.expdaycard__footcount', {}, ` · ${t('{count} khoản', { count })}`),
    ]),
    el('strong.expdaycard__foottotal', {}, `-${vnd(total)}`),
  ]);
}

function groupByDay(expenses) {
  const map = new Map();
  for (const expense of expenses) {
    if (!map.has(expense.spent_on)) map.set(expense.spent_on, []);
    map.get(expense.spent_on).push(expense);
  }
  return [...map.entries()];
}

/** Vuốt hàng sang trái để lộ Sửa/Xoá — không còn nút xoá hiện sẵn ngoài hàng nữa. */
function expenseRow(ctx, expense, categories, rerender) {
  const content = el('div.row', {}, [
    // Màu nhóm do Admin đặt (dữ liệu), pha loãng 10% bằng color-mix; thiếu màu
    // thì lùi về token thương hiệu.
    el('span.row__icon', {
      style: {
        background: `color-mix(in srgb, ${expense.category_color || 'var(--bg-brand-500)'} 10%, transparent)`,
        color: expense.category_color || 'var(--text-brand-500)',
      },
    }, dataIcon(expense.category_icon, 'package', 20)),
    el('div.row__main', {}, [
      el('div.row__title', {}, expense.note || expense.category_name || t('Khoản chi')),
      el('div.row__sub', {}, [
        expense.category_name || t('Khác'),
        expense.source === 'bot' ? ` · ${t('qua Ekko bot')}` : '',
        expense.recurring_id ? ` · ${t('lặp lại hàng tháng')}` : '',
      ].join('')),
    ]),
    expense.receipt_url
      ? el('button.row__receipt', {
        'aria-label': t('Xem ảnh hoá đơn'),
        onclick: (e) => {
          e.stopPropagation();
          sheet({
            title: t('Ảnh hoá đơn'),
            body: [el('img.receipt__img', { src: expense.receipt_url, alt: t('Ảnh hoá đơn') })],
          });
        },
      }, [el('img', { src: expense.receipt_url, alt: '', loading: 'lazy' })])
      : null,
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
 * Ô chọn ảnh hoá đơn: **chụp mới** hoặc **lấy ảnh có sẵn trong máy**.
 *
 * Hai ô `input[type=file]` riêng chứ không phải một: chỉ ô có `capture` mới mở
 * thẳng máy ảnh trên điện thoại, còn ô không có `capture` mới cho vào thư viện.
 * Gộp làm một thì trên một số máy người dùng không vào được thư viện.
 */
export function receiptPicker(onPick) {
  const chup = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
  const chon = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });

  const handle = async (input) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      onPick(await shrinkImage(file, 1280, 0.72, { unreadable: t('Không đọc được tệp ảnh'), notImage: t('Tệp này không phải ảnh') }));
    } catch (err) {
      toast(err.message || t('Không đọc được ảnh'), 'error');
    }
  };
  chup.addEventListener('change', () => handle(chup));
  chon.addEventListener('change', () => handle(chon));

  return el('div.receipt__pick', {}, [
    el('button.btn.btn--ghost.withicon', { onclick: () => chup.click() }, [uiIcon('camera-01', 20), t('Chụp hoá đơn')]),
    el('button.btn.btn--ghost.withicon', { onclick: () => chon.click() }, [uiIcon('image-01', 20), t('Chọn ảnh có sẵn')]),
    chup,
    chon,
  ]);
}

/**
 * Ngày để điền vào form từ ngày đọc được trên hoá đơn.
 *
 * Chỉ nhận ngày **trong tháng đang xem**. Sổ chi tiêu chỉ có ba khoảng Hôm nay /
 * Tuần này / Tháng này, nên một tờ hoá đơn cũ (ảnh chụp lại hoá đơn năm 2022) mà
 * ghi đúng ngày của nó thì khoản chi biến mất khỏi mọi khoảng xem — người dùng
 * tưởng app nuốt mất. Ngoài tháng này thì để ngày hôm nay và nói rõ ngày trên hoá
 * đơn là ngày nào; ô ngày vẫn sửa được nếu họ thật sự muốn ghi lùi.
 *
 * @returns {{date: string, receiptDate: string|null}} receiptDate khác null nghĩa là đã phải đổi
 */
export function dateFromReceipt(read, today) {
  const found = read?.spentOn;
  if (!found) return { date: today, receiptDate: null };
  if (found.slice(0, 7) === today.slice(0, 7) && found <= today) return { date: found, receiptDate: null };
  return { date: today, receiptDate: found };
}

/**
 * Nhóm chi tiêu theo đúng thứ tự server trả (Nhu cầu → Mong muốn → Sự cố, xem
 * `order_index` ở seed). "Sự cố" cố tình chỉ có một nhóm chi tiêu duy nhất
 * trùng tên nó, nên chọn nhóm level 1 này là xong luôn — khỏi cần chọn thêm.
 */
function groupCategories(categories) {
  const groups = [];
  const byCode = new Map();
  for (const c of categories) {
    const code = c.group_code || 'other';
    if (!byCode.has(code)) {
      const group = { code, label: c.group_label || t('Khác'), items: [] };
      byCode.set(code, group);
      groups.push(group);
    }
    byCode.get(code).items.push(c);
  }
  return groups;
}

/**
 * Đoán phân loại tầng 2 trong một nhóm tầng 1 từ ghi chú, bằng đúng danh sách
 * từ khoá Ekko bot dùng (`keywords` của từng category): từ khoá khớp dài nhất
 * thắng, chỉ khớp ở ranh giới từ và không phân biệt dấu — cùng luật với
 * `guessCategory` bên server.
 *
 * @returns {object|null} null khi ghi chú không chứa từ khoá nào của nhóm
 */
function guessInGroup(note, items) {
  const plain = (text) => String(text || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  const source = plain(note);
  if (!source) return null;
  let best = null;
  let bestLength = 0;
  for (const category of items) {
    for (const keyword of String(category.keywords || '').split(',')) {
      const needle = plain(keyword);
      if (!needle || needle.length <= bestLength) continue;
      const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(source)) {
        best = category;
        bestLength = needle.length;
      }
    }
  }
  return best;
}

/** Nhóm "Khác" của một nhóm tầng 1 — chỗ rơi vào khi ghi chú không gợi ý được gì. */
const otherInGroup = (items) => items.find((c) => /_other$/.test(c.code)) || null;

/**
 * Nhóm chi tiêu cho một hoá đơn vừa đọc: AI đoán thì lấy của AI; không có thì
 * đoán theo từ khoá trên hoá đơn (cùng từ khoá Ekko bot dùng); vẫn không ra
 * thì "Khác" của nhóm Mong muốn — luôn có sẵn một lựa chọn để người dùng đổi.
 */
export function pickReceiptCategory(read, text, categories) {
  return (read?.categoryId && categories.find((c) => c.id === read.categoryId))
    || guessInGroup(`${read?.note || ''}\n${text || ''}`, categories)
    || categories.find((c) => c.code === 'wants_other')
    || null;
}

/**
 * Popup Ghi một khoản chi. `prefill` (tuỳ chọn) = { receipt, read, text }: mở
 * sẵn với ảnh hoá đơn đã đọc — Ekko bot dùng cho nút "Sửa trước khi ghi".
 */
export function openAdd(ctx, categories, rerender, prefill = null) {
  const amountInput = moneyInput('', t('VD: 35.000'));
  amountInput.autofocus = true;
  const noteInput = el('input.input', { placeholder: t('VD: cà phê sáng'), maxlength: '120' });
  const dateInput = el('input.input', { type: 'date', value: ctx.world.today });

  // Khác với Ngân sách (được phép bỏ qua tầng 2 để áp cho cả nhóm), một khoản
  // chi luôn phải gắn với đúng MỘT nhóm chi tiêu cụ thể — nên không có sẵn lựa
  // chọn nào lúc mở form, người dùng phải chạm chọn thật, trừ khi hoá đơn quét
  // được đã đoán ra category (xem receiptBlock), hoặc nhóm chỉ có một nhóm con
  // duy nhất ("Sự cố").
  const groups = groupCategories(categories);
  let pickedGroup = null;
  let picked = null;

  // Tầng 2 người dùng tự chạm chọn thì giữ nguyên; chưa chạm thì ghi chú quyết
  // định thay — gõ "cà phê" là chip "Cà phê & giải trí" tự sáng lên.
  let pickedByHand = false;
  const subChips = el('div.chips');
  const autoHint = el('div.field__hint', { style: { display: 'none' } }, t('Tự chọn theo ghi chú — chạm để đổi'));
  // Tách hẳn thành field riêng, ẩn/hiện theo lựa chọn tầng 1 — giống màn Lập
  // ngân sách, để hai tầng phân loại không dính vào nhau.
  const subField = el('div.field', { style: { display: pickedGroup && pickedGroup.items.length > 1 ? '' : 'none' } }, [
    el('span', {}, t('Phân loại tầng 2')), subChips, autoHint,
  ]);

  /** Chọn tầng 2 theo ghi chú, chỉ khi người dùng chưa tự chọn. */
  const autoPick = () => {
    if (pickedByHand || !pickedGroup || pickedGroup.items.length <= 1) return;
    const guess = guessInGroup(noteInput.value, pickedGroup.items);
    picked = guess?.id ?? null;
    drawSubChips();
  };
  noteInput.addEventListener('input', autoPick);

  const groupChips = el('div.chips', {}, groups.map((group) => el('button.chip', {
    'aria-pressed': String(group.code === pickedGroup?.code),
    onclick: (event) => {
      pickedGroup = group;
      // "Sự cố" chỉ có một nhóm chi tiêu — chọn nhóm level 1 là chọn luôn nhóm
      // chi tiêu đó, không cần lộ ra một hàng chip chỉ có một lựa chọn.
      picked = group.items.length === 1 ? group.items[0].id : null;
      pickedByHand = false;
      [...groupChips.children].forEach((child) => child.setAttribute('aria-pressed', 'false'));
      event.currentTarget.setAttribute('aria-pressed', 'true');
      drawSubChips();
      autoPick();
    },
  }, group.label)));

  const drawSubChips = () => {
    if (!pickedGroup || pickedGroup.items.length <= 1) {
      subField.style.display = 'none';
      return mount(subChips);
    }
    subField.style.display = '';
    autoHint.style.display = picked && !pickedByHand ? '' : 'none';
    mount(subChips, pickedGroup.items.map((category) => el('button.chip', {
      'aria-pressed': String(category.id === picked),
      onclick: (event) => {
        picked = category.id;
        pickedByHand = true;
        autoHint.style.display = 'none';
        [...subChips.children].forEach((child) => child.setAttribute('aria-pressed', 'false'));
        event.currentTarget.setAttribute('aria-pressed', 'true');
      },
    }, [dataIcon(category.icon, 'package', 16), category.name])));
  };
  drawSubChips();

  /** Chọn sẵn nhóm chi tiêu mà hoá đơn đoán ra, như thể người dùng đã chạm chọn. */
  const applyCategory = (categoryId) => {
    const group = groups.find((g) => g.items.some((c) => c.id === categoryId));
    if (!group) return;
    pickedGroup = group;
    picked = categoryId;
    pickedByHand = true;
    [...groupChips.children].forEach((child, i) => child.setAttribute('aria-pressed', String(groups[i] === group)));
    drawSubChips();
  };

  // --- ghi bằng ảnh hoá đơn --------------------------------------------------
  // Chụp mới hoặc chọn ảnh trong máy → máy chủ đọc → điền thẳng vào form đang
  // mở. Đọc được hay không, ảnh vẫn được đính kèm khi Lưu; đọc hỏng thì người
  // dùng gõ tay như thường, không mất đường ghi.
  let receiptData = null;
  const receiptBlock = el('div.receiptblock');
  const drawReceipt = (status = null, tone = '') => {
    if (!receiptData) {
      return mount(receiptBlock,
        el('div.receiptblock__label', {}, t('Ghi bằng ảnh hoá đơn')),
        receiptPicker(onReceipt));
    }
    return mount(receiptBlock, el('div.receiptblock__preview', {}, [
      el('img.receiptblock__thumb', { src: receiptData, alt: t('Ảnh hoá đơn') }),
      el(`div.receiptblock__status${tone ? `.is-${tone}` : ''}`, {}, status || t('Đã đính kèm ảnh hoá đơn')),
      el('button.iconbtn.receiptblock__remove', {
        type: 'button', 'aria-label': t('Bỏ ảnh hoá đơn'),
        onclick: () => { receiptData = null; drawReceipt(); },
      }, uiIcon('cancel-01', 20)),
    ]));
  };

  /**
   * Đọc ảnh: hỏi dịch vụ AI của máy chủ trước (đọc tốt nhất); không được —
   * chưa bật, hết hạn mức, lỗi mạng — thì tự đọc ngay trên máy. Số tiền và
   * phân loại luôn được điền sẵn nếu tìm ra tổng tiền; phân loại lấy từ AI,
   * không có thì đoán theo từ khoá trên hoá đơn, vẫn không ra thì để tạm
   * "Khác" của nhóm Mong muốn cho người dùng đổi.
   */
  async function onReceipt(dataUrl) {
    receiptData = dataUrl;
    const { read, text } = await readReceipt(dataUrl, (stage) => {
      if (receiptData === dataUrl) drawReceipt(stage === 'server' ? t('Đang đọc hoá đơn…') : t('Đang đọc hoá đơn trên máy…'), 'busy');
    });
    if (receiptData !== dataUrl) return;   // người dùng đã bỏ/đổi ảnh trong lúc chờ
    fillFromReceipt(read, text);
  }

  function fillFromReceipt(read, text) {
    if (!read?.amount) {
      drawReceipt(t('Chưa đọc được số tiền trên hoá đơn, bạn nhập tay nhé'), 'warn');
      return;
    }
    amountInput.value = Number(read.amount).toLocaleString(getLang() === 'en' ? 'en-US' : 'vi-VN');
    if (read.note && !noteInput.value.trim()) noteInput.value = read.note;
    const { date, receiptDate } = dateFromReceipt(read, ctx.world.today);
    dateInput.value = date;
    const category = pickReceiptCategory(read, text, categories);
    if (category) applyCategory(category.id);

    if (receiptDate) {
      drawReceipt(t('Đọc được {amount}. Hoá đơn đề ngày {day}, mình để ngày hôm nay — sửa ở ô Ngày chi nếu cần.',
        { amount: vnd(read.amount), day: formatDay(receiptDate) }), 'warn');
    } else if (read.confidence === 'cao') {
      drawReceipt(t('Đọc được {amount}. Kiểm lại rồi bấm Lưu nhé.', { amount: vnd(read.amount) }), 'ok');
    } else {
      drawReceipt(t('Đọc được {amount} nhưng chưa chắc lắm — bạn xem lại giúp.', { amount: vnd(read.amount) }), 'warn');
    }
  }
  if (prefill?.receipt) {
    receiptData = prefill.receipt;
    fillFromReceipt(prefill.read, prefill.text);
  } else {
    drawReceipt();
  }

  let recurring = false;
  const recurringCheck = el('input', { type: 'checkbox', onchange: (e) => { recurring = e.target.checked; } });

  // singleFlight: bấm "Lưu" hai lần liên tiếp không được ghi thành hai khoản.
  const save = singleFlight(async () => {
    const amount = readMoney(amountInput);
    if (!amount || amount <= 0) return toast(t('Nhập số tiền lớn hơn 0'), 'error');
    if (!pickedGroup) return toast(t('Chọn một phân loại tầng 1'), 'error');
    // Bỏ trống tầng 2: đoán theo ghi chú, không ra thì xếp vào "Khác" của nhóm
    // — thà ghi được vào nhóm chung còn hơn bắt người dùng dừng lại chọn.
    if (!picked) picked = (guessInGroup(noteInput.value, pickedGroup.items) || otherInGroup(pickedGroup.items))?.id ?? null;
    if (!picked) return toast(t('Chọn một phân loại tầng 2'), 'error');

    const result = await guard(() => api.post('/api/expenses', {
      amount, categoryId: picked, note: noteInput.value.trim() || null, spentOn: dateInput.value,
      recurring, receipt: receiptData || undefined,
    }), t('Không ghi được khoản chi'));
    if (!result) return;

    closeSheet();
    if (result.alerts?.length) {
      toast({ title: result.alerts[0].title, body: result.alerts[0].text }, 'warning');
    } else {
      toast(t('Đã ghi {amount}', { amount: vnd(amount) }), 'success');
    }
    await ctx.refreshWorld();
    rerender();
  });

  sheet({
    title: t('Ghi một khoản chi'),
    body: [
      receiptBlock,
      el('label.field', {}, [el('span', {}, t('Số tiền')), amountInput]),
      el('div.field', {}, [el('span', {}, t('Phân loại tầng 1')), groupChips]),
      subField,
      el('label.field', {}, [el('span', {}, t('Ghi chú')), noteInput]),
      el('label.field', {}, [el('span', {}, t('Ngày chi')), dateInput]),
      el('label.field--check', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } }, [
        recurringCheck,
        el('span.withicon', {}, [uiIcon('repeat', 16), t('Lặp lại hàng tháng')]),
      ]),
      el('button.btn.btn--block', { style: { marginTop: '16px' }, onclick: save }, t('Lưu')),
    ],
  });
}

/**
 * Sửa một khoản chi đã ghi — chạm vào hàng trong danh sách tuần mở ra đây.
 * Cùng cấu trúc tầng 1/tầng 2 như form ghi mới, nhưng có sẵn lựa chọn hiện
 * tại (khoản chi nào cũng đã có nhóm hợp lệ rồi, không cần bắt chọn lại).
 */
export function openEditExpense(ctx, expense, categories, rerender) {
  const amountInput = moneyInput(expense.amount, t('VD: 35.000'));
  amountInput.autofocus = true;
  const noteInput = el('input.input', { placeholder: t('VD: cà phê sáng'), maxlength: '120', value: expense.note || '' });
  const dateInput = el('input.input', { type: 'date', value: expense.spent_on });

  const groups = groupCategories(categories);
  const initialCategory = categories.find((c) => c.id === expense.category_id);
  let pickedGroup = groups.find((g) => g.items.some((c) => c.id === initialCategory?.id)) || null;
  let picked = initialCategory?.id ?? null;

  const subChips = el('div.chips');
  const subField = el('div.field', { style: { display: pickedGroup && pickedGroup.items.length > 1 ? '' : 'none' } }, [
    el('span', {}, t('Phân loại tầng 2')), subChips,
  ]);

  const groupChips = el('div.chips', {}, groups.map((group) => el('button.chip', {
    'aria-pressed': String(group.code === pickedGroup?.code),
    onclick: (event) => {
      pickedGroup = group;
      picked = group.items.length === 1 ? group.items[0].id : null;
      [...groupChips.children].forEach((child) => child.setAttribute('aria-pressed', 'false'));
      event.currentTarget.setAttribute('aria-pressed', 'true');
      drawSubChips();
    },
  }, group.label)));

  const drawSubChips = () => {
    if (!pickedGroup || pickedGroup.items.length <= 1) {
      subField.style.display = 'none';
      return mount(subChips);
    }
    subField.style.display = '';
    mount(subChips, pickedGroup.items.map((category) => el('button.chip', {
      'aria-pressed': String(category.id === picked),
      onclick: (event) => {
        picked = category.id;
        [...subChips.children].forEach((child) => child.setAttribute('aria-pressed', 'false'));
        event.currentTarget.setAttribute('aria-pressed', 'true');
      },
    }, [dataIcon(category.icon, 'package', 16), category.name])));
  };
  drawSubChips();

  const save = singleFlight(async () => {
    const amount = readMoney(amountInput);
    if (!amount || amount <= 0) return toast(t('Nhập số tiền lớn hơn 0'), 'error');
    if (!pickedGroup) return toast(t('Chọn một phân loại tầng 1'), 'error');
    if (!picked) return toast(t('Chọn một phân loại tầng 2'), 'error');

    const result = await guard(() => api.patch(`/api/expenses/${expense.id}`, {
      amount, categoryId: picked, note: noteInput.value.trim() || null, spentOn: dateInput.value,
    }), t('Không lưu được thay đổi'));
    if (!result) return;

    closeSheet();
    toast(t('Đã lưu thay đổi'), 'success');
    await ctx.refreshWorld();
    rerender();
  });

  sheet({
    title: t('Sửa khoản chi'),
    body: [
      el('label.field', {}, [el('span', {}, t('Số tiền')), amountInput]),
      el('div.field', {}, [el('span', {}, t('Phân loại tầng 1')), groupChips]),
      subField,
      el('label.field', {}, [el('span', {}, t('Ghi chú')), noteInput]),
      el('label.field', {}, [el('span', {}, t('Ngày chi')), dateInput]),
      el('button.btn.btn--block', { style: { marginTop: '16px' }, onclick: save }, t('Lưu thay đổi')),
    ],
  });
}

// `keywords` để đoán loại từ ghi chú (xem `guessInGroup`). Thu nhập không có
// bảng category ở server như chi tiêu nên từ khoá nằm luôn ở đây, kèm cả tiếng
// Anh vì bản tiếng Anh cũng gõ ghi chú. Tránh từ mất dấu dễ trùng từ khác:
// "bán" → "ban" trùng "bạn", "lãi" → "lai" trùng "lại", "tặng" → "tang" trùng "tăng".
const INCOME_CATEGORIES = [
  {
    code: 'regular', icon: 'briefcase-01', label: t('TN thường xuyên'),
    keywords: 'lương,tiền lương,lương tháng,phụ cấp,trợ cấp,lương hưu,tiền thuê nhà,cho thuê nhà,salary,wage,pension,allowance,rent',
  },
  {
    code: 'irregular', icon: 'exchange-01', label: t('TN không thường xuyên'),
    keywords: 'làm thêm,freelance,part time,parttime,dự án,hoa hồng,tiền công,bán hàng,bán đồ,cổ tức,tiền lãi,lãi tiết kiệm,lãi ngân hàng,side job,commission,dividend,interest',
  },
  {
    code: 'gift', icon: 'gift', label: t('Quà, thưởng'),
    keywords: 'quà,thưởng,thưởng tết,lì xì,mừng tuổi,tiền mừng,biếu,được cho,được tặng,quà tặng,bonus,gift,present',
  },
  { code: 'other', icon: 'package', label: t('Khác') },
];

/**
 * Ghi một khoản thu nhập — chỉ một tầng phân loại (4 lựa chọn cố định, không
 * có nhóm con như chi tiêu). Không chọn sẵn lúc mở form; gõ ghi chú thì loại
 * khớp từ khoá tự sáng lên, như tầng 2 ở form ghi chi tiêu.
 */
function openAddIncome(ctx, rerender) {
  const amountInput = moneyInput('', t('VD: 15.000.000'));
  amountInput.autofocus = true;
  const noteInput = el('input.input', { placeholder: t('VD: lương tháng 9'), maxlength: '120' });
  const dateInput = el('input.input', { type: 'date', value: ctx.world.today });

  let category = null;
  let pickedByHand = false;
  const autoHint = el('div.field__hint', { style: { display: 'none' } }, t('Tự chọn theo ghi chú — chạm để đổi'));
  const markChips = () => [...categoryChips.children].forEach((child, i) => {
    child.setAttribute('aria-pressed', String(INCOME_CATEGORIES[i].code === category));
  });
  const categoryChips = el('div.chips', {}, INCOME_CATEGORIES.map((c) => el('button.chip', {
    'aria-pressed': 'false',
    onclick: () => {
      category = c.code;
      pickedByHand = true;
      autoHint.style.display = 'none';
      markChips();
    },
  }, [uiIcon(c.icon, 16), c.label])));

  noteInput.addEventListener('input', () => {
    if (pickedByHand) return;
    category = guessInGroup(noteInput.value, INCOME_CATEGORIES)?.code ?? null;
    autoHint.style.display = category ? '' : 'none';
    markChips();
  });

  let recurring = false;
  const recurringCheck = el('input', { type: 'checkbox', onchange: (e) => { recurring = e.target.checked; } });

  const save = singleFlight(async () => {
    const amount = readMoney(amountInput);
    if (!amount || amount <= 0) return toast(t('Nhập số tiền lớn hơn 0'), 'error');
    // Bỏ trống phân loại: đoán theo ghi chú, không ra thì xếp vào "Khác".
    if (!category) category = guessInGroup(noteInput.value, INCOME_CATEGORIES)?.code ?? 'other';

    const result = await guard(() => api.post('/api/income', {
      amount, category, note: noteInput.value.trim() || null, receivedOn: dateInput.value, recurring,
    }), t('Không ghi được thu nhập'));
    if (!result) return;

    closeSheet();
    toast(t('Đã ghi {amount}', { amount: vnd(amount) }), 'success');
    await ctx.refreshWorld();
    rerender();
  });

  sheet({
    title: t('Ghi thu nhập'),
    body: [
      el('label.field', {}, [el('span', {}, t('Số tiền')), amountInput]),
      el('div.field', {}, [el('span', {}, t('Phân loại')), categoryChips, autoHint]),
      el('label.field', {}, [el('span', {}, t('Ghi chú')), noteInput]),
      el('label.field', {}, [el('span', {}, t('Ngày nhận')), dateInput]),
      el('label.field--check', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } }, [
        recurringCheck,
        el('span.withicon', {}, [uiIcon('repeat', 16), t('Lặp lại hàng tháng')]),
      ]),
      el('button.btn.btn--block', { style: { marginTop: '16px' }, onclick: save }, t('Lưu')),
    ],
  });
}
