/**
 * Hai màn "mở rộng" của Ghi chép chi tiêu — xem views/expenses.js:
 *
 * - `weeklyReportView` ("Báo cáo chi tiết" cạnh danh sách tuần): các hạng mục
 *   chi tiêu (level 2) trong 7 ngày vừa rồi, cộng một progress bar riêng so
 *   chi tiêu CẢ THÁNG với thu nhập tháng — thu nhập này người dùng tự gõ tay
 *   (chưa có sổ thu nhập thật), chỉ để tạo động lực, không nhập cũng không
 *   sao vì trọng tâm màn này vẫn là ghi chép/phân tích chi tiêu.
 * - `monthGroupsView` (bấm vào progress bar ở bảng trung tâm): chi cả tháng,
 *   mở rộng từ level 1 xuống level 2.
 */
import { api, dataIcon, el, guard, mount, toast, vnd } from '/shared/client.js';
import { bar, moneyInput, readMoney } from '../ui.js';
import { t } from '../i18n.js';

const GROUP_ICON = { needs: 'shopping-basket-01', wants: 'shopping-bag-01', incident: 'alert-02' };

/** Pie chart theo hạng mục (level 2), cùng `pieChart()`/`oceanColor()` dùng
 * cho phần theo nhóm (level 1) bên dưới — thay cho thanh ngang chia lát cũ,
 * đọc tỉ trọng từng hạng mục rõ hơn khi có nhiều hạng mục nhỏ chen nhau. */
function categoryLegend(byCategory) {
  const top = byCategory.slice(0, 8);
  const total = top.reduce((sum, c) => sum + c.total, 0) || 1;
  return el('div.expgroup__pierow', { style: { marginTop: '16px' } }, [
    pieChart(top, total),
    el('div.expgroup__pielegend', {}, top.map((c, i) => el('div.expgroup__pielegenditem', {}, [
      el('i', { style: { background: oceanColor(i) } }),
      el('div.expgroup__pielegendtext', {}, [
        el('span.withicon', {}, [dataIcon(c.icon, 'package', 16), c.name]),
        el('small', {}, `${vnd(c.total)} · ${Math.round((c.total / total) * 100)}%`),
      ]),
    ]))),
  ]);
}

export async function weeklyReportView(ctx) {
  const month = ctx.world.today.slice(0, 7);
  const container = el('div');

  const rerender = async () => {
    const [week, monthData, income] = await Promise.all([
      api.get('/api/expenses?range=week'),
      api.get('/api/expenses?range=month'),
      api.get(`/api/expenses/income?month=${month}`),
    ]);
    mount(container, weeklyReportBody(ctx, week, monthData, income, month, rerender));
  };
  await rerender();
  return container;
}

/**
 * Gắn liền với card tổng: có thu nhập rồi thì hiện gauge % ngay trên đầu (kèm
 * link "Sửa" nhỏ để đổi số); chưa có thì một câu gợi ý nhẹ nhàng + ô nhập,
 * không đóng khung cảnh báo — đây là một gợi ý, không phải một việc bắt buộc.
 */
function incomeBlock(month, income, spentMonth, rerender) {
  const node = el('div');
  let editing = income.amount === 0;

  const incomeInput = moneyInput(income.amount || '', t('VD: 15.000.000'));
  const saveIncome = async () => {
    const amount = readMoney(incomeInput);
    const result = await guard(() => api.put('/api/expenses/income', { month, amount }), t('Không lưu được'));
    if (!result) return;
    toast(t('Đã lưu thu nhập tháng'), 'success');
    rerender();
  };

  const draw = () => {
    if (editing) {
      mount(node, [
        el('p.expreport__incomehint', {}, t('Hãy nhập thu nhập của bạn tại đây để biết được bạn chi tiêu bao nhiêu phần trong thu nhập.')),
        el('div.expreport__income', {}, [incomeInput, el('button.btn.btn--sm', { onclick: saveIncome }, t('Lưu'))]),
      ]);
      return;
    }
    const percent = Math.round((spentMonth / income.amount) * 100);
    const tone = percent > 100 ? 'over' : percent > 80 ? 'warn' : '';
    // Thu nhập lấy từ các khoản đã ghi (nút "Thu nhập"): không cho sửa ở đây —
    // ghi thêm / xoá khoản thu nhập mới đổi được con số này.
    const fromEntries = income.source === 'entries';
    mount(node, [el('div.gauge', {}, [
      el('div.gauge__row', {}, [
        el('span.gauge__label', {}, t('Đã dùng {percent}% so với thu nhập tháng', { percent })),
        fromEntries ? null : el('button.linkbtn', { onclick: () => { editing = true; draw(); } }, t('Sửa')),
      ]),
      bar(percent, tone),
      el('small.muted', {}, fromEntries
        ? t('Thu nhập tháng {amount}, theo các khoản thu nhập đã ghi', { amount: vnd(income.amount) })
        : t('Thu nhập tháng {amount}', { amount: vnd(income.amount) })),
    ])]);
  };
  draw();
  return node;
}

function weeklyReportBody(ctx, week, monthData, income, month, rerender) {
  return el('div', {}, [
    el('div.card', {}, [
      el('div.stat-row', {}, [
        el('span.stat-big', {}, vnd(week.totals.total)),
        el('small', {}, t('7 ngày vừa rồi')),
      ]),
      el('div.stat-row', { style: { marginTop: '10px' } }, [
        el('small', {}, t('Hôm nay: {amount}', { amount: vnd(week.totals.today) })),
        el('small', {}, t('{count} khoản', { count: week.totals.count })),
      ]),
      el('div', { style: { marginTop: '14px' } }, [incomeBlock(month, income, monthData.totals.total, rerender)]),
      week.byCategory.length ? categoryLegend(week.byCategory) : null,
    ]),
  ]);
}

export async function monthGroupsView(ctx) {
  const monthData = await api.get('/api/expenses?range=month');
  const { byCategory, totals } = monthData;

  const byGroup = new Map();
  for (const c of byCategory) {
    const code = c.group_code || 'other';
    if (!byGroup.has(code)) byGroup.set(code, { code, label: c.group_label || t('Khác'), icon: GROUP_ICON[code] || 'package', total: 0, items: [] });
    const group = byGroup.get(code);
    group.total += c.total;
    group.items.push(c);
  }
  const groups = [...byGroup.values()].sort((a, b) => b.total - a.total);
  const monthTotal = totals.total || 1;

  if (!groups.length) {
    return el('div.empty', {}, [
      el('h3', {}, t('Chưa có khoản chi nào tháng này')),
    ]);
  }

  return el('div', {}, [
    el('div.card', { style: { marginBottom: '16px' } }, [
      el('div.stat-row', {}, [
        el('span.stat-big', {}, vnd(totals.total)),
        el('small', {}, t('tháng này')),
      ]),
    ]),
    ...groups.map((group) => {
      const groupTotal = group.total || 1;
      const items = [...group.items].sort((a, b) => b.total - a.total);
      return el('div.expgroup__l1', {}, [
        el('div.expgroup__l1head', {}, [
          el('span.withicon', {}, [dataIcon(group.icon, 'package', 16), group.label]),
          el('span', {}, `${vnd(group.total)} · ${Math.round((group.total / monthTotal) * 100)}%`),
        ]),
        bar(Math.round((group.total / monthTotal) * 100)),
        // Từ 2 nhóm con trở lên mới đáng vẽ pie — "Sự cố" chỉ có đúng một nhóm
        // con trùng tên nó, vẽ pie ra sẽ chỉ là một vòng tròn 100% vô nghĩa.
        items.length > 1
          ? el('div.expgroup__pierow', {}, [
            pieChart(items, groupTotal),
            el('div.expgroup__pielegend', {}, items.map((item, i) => el('div.expgroup__pielegenditem', {}, [
              el('i', { style: { background: oceanColor(i) } }),
              el('div.expgroup__pielegendtext', {}, [
                el('span.withicon', {}, [dataIcon(item.icon, 'package', 16), item.name]),
                el('small', {}, `${vnd(item.total)} · ${Math.round((item.total / groupTotal) * 100)}%`),
              ]),
            ]))),
          ])
          : null,
      ]);
    }),
  ]);
}

/**
 * Pie/donut đơn giản bằng kỹ thuật stroke-dasharray trên <circle> — khỏi phải
 * tính cung tròn bằng tay. Bỏ hẳn màu riêng của từng nhóm chi tiêu (vốn để
 * phân biệt trên các màn khác) — ở đây tô theo một bảng nền xanh biển đậm
 * nhạt ("deep ocean", tối→sáng theo đúng thứ tự lát to→nhỏ), điểm thêm một
 * chút Lime (xanh lá — màu nhấn thương hiệu, cặp đôi kinh điển với Payday
 * Blue) và một chút cam cho đỡ đơn điệu, chứ không rải đều màu tuỳ ý. Chạm
 * vào một lát hiện bong bóng tên + số tiền, giống cách chạm-hiện-số đã dùng ở
 * các biểu đồ khác trong app (title không có tác dụng trên máy chạm).
 */
const OCEAN_PALETTE = [
  'var(--ekko-midnight)', 'var(--payday-blue-600)', 'var(--payday-blue-500)',
  'var(--ekko-lime)', 'var(--payday-blue-400)', 'var(--secondary-colors-teal)',
];
const oceanColor = (index) => OCEAN_PALETTE[index % OCEAN_PALETTE.length];

function pieChart(items, total) {
  const size = 132;
  const r = 44;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'expgroup__pie');

  const track = document.createElementNS(ns, 'circle');
  track.setAttribute('cx', cx); track.setAttribute('cy', cy); track.setAttribute('r', r);
  track.setAttribute('class', 'expgroup__pietrack');
  svg.append(track);

  const tip = el('div.expgroup__pietip');
  let hideTimer = null;
  const showTip = (item) => {
    clearTimeout(hideTimer);
    tip.textContent = `${item.name}: ${vnd(item.total)}`;
    tip.classList.add('is-visible');
    hideTimer = setTimeout(() => tip.classList.remove('is-visible'), 2200);
  };

  let offset = 0;
  items.forEach((item, i) => {
    const frac = total > 0 ? item.total / total : 0;
    if (!frac) return;
    const dash = frac * circumference;
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', r);
    circle.setAttribute('class', 'expgroup__pieslice');
    circle.setAttribute('stroke', oceanColor(i));
    circle.setAttribute('stroke-dasharray', `${dash} ${circumference - dash}`);
    circle.setAttribute('stroke-dashoffset', String(-offset));
    circle.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    circle.addEventListener('click', (e) => { e.stopPropagation(); showTip(item); });
    svg.append(circle);
    offset += dash;
  });
  return el('div.expgroup__piewrap', {}, [svg, tip]);
}
