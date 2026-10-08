/**
 * Lập ngân sách: đặt hạn mức chi tối đa cho từng nhóm trong MỘT tháng dương
 * lịch, rồi xem thanh tiến độ chạy đúng theo số liệu thật của Ghi chép chi
 * tiêu. Không còn khái niệm "thu nhập" hay "phân bổ" như bản cũ — mỗi dòng
 * ngân sách độc lập, gắn với một nhóm chi tiêu con hoặc cả một nhóm level 1.
 */
import { api, dataIcon, el, formatDay, guard, mount, spriteIcon, toast, uiIcon, vnd, vndShort } from '/shared/client.js';
import { bar, celebrateRewards, closeSheet, confirmSheet, moneyInput, readMoney, sheet, swipeRow } from '../ui.js';
import { getLang, t } from '../i18n.js';

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

/** Cùng ngưỡng màu cho mọi thanh tiến độ ngân sách trong app. */
function toneFor(item) {
  if (item.percent > 100) {
    if (item.editedDirection === 'up') return 'over-up';
    if (item.editedDirection === 'down') return 'over-down';
    return 'over';
  }
  return item.percent > 80 ? 'warn' : '';
}

/**
 * Nhóm chi tiêu theo nhóm level 1 (Nhu cầu → Mong muốn → Sự cố, theo thứ tự
 * server trả). "Sự cố" chỉ có một nhóm chi tiêu con trùng tên nó.
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

export default async function budgetView(ctx, month = ctx.world.today.slice(0, 7)) {
  const container = el('div');
  const rerender = async (nextMonth = month) => {
    month = nextMonth;
    mount(container, await budgetBody(ctx, nextMonth, rerender));
  };
  mount(container, await budgetBody(ctx, month, rerender));
  return container;
}

async function budgetBody(ctx, month, rerender) {
  const [data, categories] = await Promise.all([
    api.get(`/api/budget/limits?month=${month}`),
    api.get('/api/categories'),
  ]);
  const today = ctx.world.today.slice(0, 7);
  const isCurrent = month === today;

  const header = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' } }, [
    el('button.iconbtn', { onclick: () => rerender(shiftMonth(month, -1)), 'aria-label': t('Tháng trước') }, [spriteIcon('chevron-left-01-stroke', 20)]),
    el('div', { style: { flex: '1', textAlign: 'center' } }, [
      el('div', { style: { fontSize: 'var(--font-size-text-lg)', fontWeight: 'var(--font-weight-semibold)' } }, monthLabel(month)),
      isCurrent ? el('div.muted', {}, t('Tháng hiện tại')) : null,
    ]),
    el('button.iconbtn', { onclick: () => rerender(shiftMonth(month, 1)), 'aria-label': t('Tháng sau') }, [spriteIcon('chevron-right-01-stroke', 20)]),
  ]);

  if (!data.exists) {
    return el('div', {}, [
      header,
      el('div.empty', {}, [
        el('img', { src: '/assets/lessons/ban-ngan-sach-dau-tien.svg', alt: '' }),
        el('h3', {}, t('Chưa có ngân sách cho tháng này')),
        el('p.muted', {}, t('Đặt một hạn mức chi cho từng nhóm, rồi theo dõi ngay trên thanh tiến độ mỗi khi bạn ghi một khoản chi.')),
        el('button.btn', { style: { marginTop: '16px' }, onclick: () => openAddSheet(ctx, month, rerender, categories, []) }, t('Thêm ngân sách')),
      ]),
    ]);
  }

  const { totals, items } = data;
  // Một dòng riêng lẻ có thể đã gần hết hạn mức (>=80%) dù tỉ lệ % TỔNG vẫn
  // thấp — ví dụ khi các dòng chênh lệch lớn về số tiền. Nên tông màu và
  // dòng cảnh báo ở đây phải xét cả `nearCount`/`overCount` theo từng dòng,
  // không chỉ riêng `totals.percent`.
  const overallTone = totals.overCount > 0 ? 'over' : (totals.nearCount > 0 || totals.percent > 80) ? 'warn' : '';
  const warnLine = totals.overCount > 0
    ? t('{n} ngân sách đang vượt', { n: totals.overCount })
    : totals.nearCount > 0
      ? t('{n} ngân sách sắp đạt hạn mức', { n: totals.nearCount })
      : '';

  const summary = el(`div.card${overallTone ? `.card--${overallTone}` : ''}`, {}, [
    el('div.stat-row', {}, [
      el('span.stat-big', {}, vnd(totals.spent)),
      el('small', {}, t('/ {amount} đã đặt hạn mức', { amount: vnd(totals.amount) })),
    ]),
    el('div', { style: { marginTop: '10px' } }, [bar(totals.percent, overallTone)]),
    el('div.stat-row', { style: { marginTop: '12px' } }, [
      el('small', {}, totals.remaining >= 0
        ? t('Còn lại {amount}', { amount: vnd(totals.remaining) })
        : t('Vượt {amount}', { amount: vnd(-totals.remaining) })),
      el(`small${overallTone ? `.text-${overallTone}` : ''}`, {}, warnLine),
    ]),
    el('button.btn.btn--ghost.btn--block', { style: { marginTop: '14px' }, onclick: () => openAddSheet(ctx, month, rerender, categories, items) }, `+ ${t('Thêm ngân sách')}`),
  ]);

  const rowsCard = el('div.card.budgetrows', { style: { paddingTop: '0' } }, items.map((item) => budgetRow(item, ctx, month, rerender)));

  const comparison = !isCurrent ? await comparisonSection(month, ctx) : null;

  return el('div', {}, [
    header,
    summary,
    el('div.section-title', {}, [t('Theo nhóm'), el('span', {}, t('{n} ngân sách', { n: items.length }))]),
    rowsCard,
    comparison,
  ]);
}

function budgetRow(item, ctx, month, rerender) {
  const content = el('div', { style: { padding: '12px 0' } }, [
    el('div.stat-row', {}, [
      el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-text-sm)', fontWeight: 'var(--font-weight-medium)' } }, [
        dataIcon(item.icon, 'package', 20),
        item.categoryId ? item.name : `${item.name} · ${t('cả nhóm')}`,
      ]),
      el('small', {}, `${vndShort(item.spent)} / ${vndShort(item.amount)}`),
    ]),
    el('div', { style: { marginTop: '8px' } }, [bar(item.percent, toneFor(item))]),
    item.over
      ? el('div', { style: { fontSize: 'var(--font-size-text-xs)', color: 'var(--text-error)', marginTop: '6px' } },
        t('Vượt {amount}', { amount: vnd(-item.remaining) }))
      : null,
  ]);

  return swipeRow(content, [
    { label: t('Sửa'), tone: 'edit', onclick: () => openEditSheet(ctx, item, month, rerender) },
    { label: t('Xoá'), tone: 'danger', onclick: () => deleteLine(ctx, item, month, rerender) },
  ], {
    // Chạm vào dòng: xem nhanh các khoản đã chi của nhóm trong tháng (BUG-011).
    // Vuốt trái vẫn là Sửa / Xoá như cũ.
    onTap: () => openSpentSheet(ctx, item, month),
    tapLabel: t('Xem các khoản đã chi: {name}', { name: item.name }),
  });
}

/**
 * Xem nhanh các khoản đã chi thuộc một dòng ngân sách trong tháng đang xem:
 * dòng theo nhóm chi tiêu, hoặc theo cả nhóm lớn (Nhu cầu / Mong muốn…).
 */
async function openSpentSheet(ctx, item, month) {
  const data = await guard(() => Promise.all([api.get(`/api/expenses?month=${month}`), api.get('/api/categories')]), t('Không tải được các khoản chi'));
  if (!data) return;
  const [monthData, categories] = data;
  const groupOf = new Map(categories.map((c) => [c.id, c.group_code]));
  const list = (monthData.list || monthData.expenses || []).filter((e) => (item.categoryId
    ? e.category_id === item.categoryId
    : groupOf.get(e.category_id) === item.groupCode));
  const total = list.reduce((sum, e) => sum + e.amount, 0);

  const rows = list.length
    ? list.map((e) => el('div.row.spentrow', {}, [
      el('span.row__icon', {
        style: {
          background: `color-mix(in srgb, ${e.category_color || 'var(--bg-brand-500)'} 10%, transparent)`,
          color: e.category_color || 'var(--text-brand-500)',
        },
      }, dataIcon(e.category_icon, 'package', 20)),
      el('div.row__main', {}, [
        el('div.row__title', {}, e.note || e.category_name || t('Khoản chi')),
        el('div.row__sub', {}, `${formatDay(e.spent_on)}${item.categoryId ? '' : ` · ${e.category_name || t('Khác')}`}`),
      ]),
      el('b.spentrow__amount', {}, `-${vnd(e.amount)}`),
    ]))
    : [el('p.muted', { style: { textAlign: 'center', padding: '16px 0' } }, t('Chưa có khoản chi nào trong {month}.', { month: monthLabel(month) }))];

  sheet({
    title: item.categoryId ? item.name : `${item.name} · ${t('cả nhóm')}`,
    body: [
      el('div.spentsum', {}, [
        el('div.stat-row', {}, [
          el('span', {}, t('Đã chi {month}', { month: monthLabel(month) })),
          el('b', {}, `${vnd(total)} / ${vnd(item.amount)}`),
        ]),
        el('div', { style: { marginTop: '8px' } }, [bar(item.percent, toneFor(item))]),
        el('small.muted', {}, t('{n} khoản · mới nhất ở trên', { n: list.length })),
      ]),
      el('div.spentlist', {}, rows),
    ],
    footer: el('div.sheet__body', { style: { borderTop: '1px solid var(--border-secondary)' } }, [
      el('button.btn.btn--ghost.btn--block', { type: 'button', onclick: () => { closeSheet(); ctx.navigate('/expenses'); } }, t('Mở Ghi chép chi tiêu')),
    ]),
  });
}

async function deleteLine(ctx, item, month, rerender) {
  const ok = await confirmSheet({
    title: t('Xoá ngân sách này?'),
    message: t('{name} sẽ không còn hạn mức trong {month}.', { name: item.name, month: monthLabel(month) }),
  });
  if (!ok) return;

  const result = await guard(() => api.delete(`/api/budget/limits/${item.id}?month=${month}`), t('Không xoá được ngân sách'));
  if (!result) return;
  toast(t('Đã xoá ngân sách'), 'success');
  await ctx.refreshWorld();
  rerender(month);
}

/**
 * So sánh một tháng lịch sử với tháng hiện tại, theo từng nhóm level 1 — chỉ
 * hiện khi đang xem một tháng khác tháng hiện tại và tháng đó có dữ liệu.
 */
async function comparisonSection(month, ctx) {
  const groups = await api.get(`/api/budget/comparison?month=${month}`);
  if (!groups.length) return null;

  const max = Math.max(1, ...groups.flatMap((g) => [g.history, g.current]));
  const today = ctx.world.today.slice(0, 7);

  return el('div', {}, [
    el('div.section-title', {}, t('So với tháng hiện tại')),
    el('div.card', {}, [
      el('div', { style: { display: 'flex', gap: '16px', marginBottom: '10px', fontSize: 'var(--font-size-text-xs)' } }, [
        el('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [el('span.compare__swatch.compare__swatch--history', {}), monthLabel(month)]),
        el('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [el('span.compare__swatch.compare__swatch--current', {}), monthLabel(today)]),
      ]),
      ...groups.map((g) => el('div.compare__row', {}, [
        el('div.compare__label', {}, g.groupLabel),
        el('div.compare__bars', {}, [
          el('div.compare__bar.compare__bar--history', { style: { width: `${Math.round((g.history / max) * 100)}%` } }, vndShort(g.history)),
          el('div.compare__bar.compare__bar--current', { style: { width: `${Math.round((g.current / max) * 100)}%` } }, vndShort(g.current)),
        ]),
      ])),
    ]),
  ]);
}

/**
 * Ngân sách lặp lại tự động (repeatNext) có thể đã điền sẵn một dòng cho
 * nhóm/nhóm con này ở tháng đang xem — cho người dùng xem trước dòng đang có
 * rồi tự quyết định thay thế hay giữ nguyên, chứ không chặn cứng như một lỗi.
 */
function replaceExistingSheet(existing, newAmount) {
  return new Promise((resolve) => {
    let settled = false;
    const answer = (value) => { settled = true; closeSheet(); resolve(value); };

    sheet({
      title: t('Tháng này đã có ngân sách cho nhóm này'),
      body: [
        el('p.muted', { style: { marginTop: '0' } }, t('Có thể do bạn đã đặt lặp lại từ tháng trước. Xem trước ngân sách đang có, rồi chọn thay thế bằng thiết lập mới hoặc giữ nguyên.')),
        el('div.card', {}, [
          el('div.stat-row', {}, [
            el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'var(--font-weight-semibold)' } }, [
              dataIcon(existing.icon, 'package', 20),
              existing.categoryId ? existing.name : `${existing.name} · ${t('cả nhóm')}`,
            ]),
            existing.repeatNext ? el('small.withicon', {}, [uiIcon('repeat', 16), t('tự lặp lại')]) : null,
          ]),
          el('div.stat-row', { style: { marginTop: '10px' } }, [
            el('small', {}, t('Hạn mức đang có')),
            el('b', {}, vnd(existing.amount)),
          ]),
          el('div.stat-row', { style: { marginTop: '6px' } }, [
            el('small', {}, t('Hạn mức mới')),
            el('b', {}, vnd(newAmount)),
          ]),
          el('div.stat-row', { style: { marginTop: '6px' } }, [
            el('small', {}, t('Đã chi trong tháng')),
            el('small', {}, vnd(existing.spent)),
          ]),
        ]),
      ],
      footer: el('div.sheet__body', { style: { display: 'flex', gap: '12px', borderTop: '1px solid var(--border-secondary)' } }, [
        el('button.btn.btn--ghost', { style: { flex: '1' }, onclick: () => answer(false) }, t('Giữ nguyên')),
        el('button.btn', { style: { flex: '1' }, onclick: () => answer(true) }, t('Thay thế')),
      ]),
      onClose: () => { if (!settled) resolve(false); },
    });
  });
}

function openAddSheet(ctx, month, rerender, categories, existingItems = []) {
  const amountInput = moneyInput('', t('VD: 3.000.000'));
  amountInput.autofocus = true;

  const groups = groupCategories(categories);
  let pickedGroup = null;
  let pickedCategoryId = null;

  const subChips = el('div.chips');
  // Tách hẳn thành field riêng, ẩn/hiện theo lựa chọn tầng 1 — chứ không nối
  // liền dưới các chip tầng 1, để hai tầng phân loại không dính vào nhau.
  const subField = el('div.field', { style: { display: 'none' } }, [el('span', {}, t('Phân loại tầng 2')), subChips]);

  const groupChips = el('div.chips', {}, groups.map((group) => el('button.chip', {
    'aria-pressed': 'false',
    onclick: (event) => {
      pickedGroup = group;
      pickedCategoryId = group.items.length === 1 ? group.items[0].id : null;
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
      'aria-pressed': String(category.id === pickedCategoryId),
      onclick: (event) => {
        pickedCategoryId = category.id;
        [...subChips.children].forEach((child) => child.setAttribute('aria-pressed', 'false'));
        event.currentTarget.setAttribute('aria-pressed', 'true');
      },
    }, [dataIcon(category.icon, 'package', 16), category.name])));
  };

  let notify80 = false;
  const notifyCheck = el('input', { type: 'checkbox', onchange: (e) => { notify80 = e.target.checked; } });
  let repeatNext = false;
  const repeatCheck = el('input', { type: 'checkbox', onchange: (e) => { repeatNext = e.target.checked; } });
  const noteInput = el('input.input', { placeholder: t('VD: giữ chi tiêu ăn uống trong tầm kiểm soát'), maxlength: '120' });
  const setOnInput = el('input.input', { type: 'date', value: ctx.world.today });

  const save = async () => {
    const amount = readMoney(amountInput);
    if (!amount || amount <= 0) return toast(t('Nhập số tiền lớn hơn 0'), 'error');
    if (!pickedGroup) return toast(t('Chọn một phân loại tầng 1'), 'error');

    if (pickedGroup.items.length > 1 && !pickedCategoryId) {
      const applyToGroup = await confirmSheet({
        title: t('Áp dụng cho cả nhóm?'),
        message: t('Bạn chưa chọn nhóm chi tiêu con. Áp dụng ngân sách này cho cả nhóm "{group}"?', { group: pickedGroup.label }),
        confirmLabel: t('Áp dụng cả nhóm'),
        tone: 'primary',
      });
      if (!applyToGroup) return;
    }

    // Ngân sách đặt lặp lại có thể đã tự điền một dòng cho đúng nhóm/nhóm con
    // này ở tháng đang xem — hỏi lại thay vì chặn cứng như một lỗi.
    const existing = existingItems.find((item) => (pickedCategoryId
      ? item.categoryId === pickedCategoryId
      : !item.categoryId && item.groupCode === pickedGroup.code));

    if (existing) {
      const replace = await replaceExistingSheet(existing, amount);
      if (!replace) return;

      const result = await guard(() => api.patch(`/api/budget/limits/${existing.id}`, {
        amount, notify80, repeatNext, note: noteInput.value.trim() || null, setOn: setOnInput.value,
      }), t('Không lưu được ngân sách'));
      if (!result) return;

      closeSheet();
      toast(t('Đã thay thế ngân sách'), 'success');
      await ctx.refreshWorld();
      rerender(month);
      return;
    }

    const result = await guard(() => api.post('/api/budget/limits', {
      month, groupCode: pickedGroup.code, categoryId: pickedCategoryId, amount,
      notify80, repeatNext, note: noteInput.value.trim() || null, setOn: setOnInput.value,
    }), t('Không lưu được ngân sách'));
    if (!result) return;

    closeSheet();
    toast(t('Đã lưu ngân sách'), 'success');
    await celebrateRewards(result.rewards, { title: t('Ngân sách đã sẵn sàng') });
    await ctx.refreshWorld();
    rerender(month);
  };

  sheet({
    title: t('Thêm ngân sách {month}', { month: monthLabel(month) }),
    body: [
      el('label.field', {}, [el('span', {}, t('Tổng ngân sách trong tháng')), amountInput]),
      el('div.field', {}, [el('span', {}, t('Phân loại tầng 1')), groupChips]),
      subField,
      el('label.field--check', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } }, [
        notifyCheck, el('span', {}, t('Gửi thông báo khi đạt 80% ngân sách')),
      ]),
      el('label.field', {}, [el('span', {}, t('Ghi chú')), noteInput]),
      el('label.field', {}, [el('span', {}, t('Ngày đặt ngân sách')), setOnInput]),
      el('label.field--check', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } }, [
        repeatCheck, el('span.withicon', {}, [uiIcon('repeat', 16), t('Lặp lại vào tháng dương lịch sau')]),
      ]),
      el('button.btn.btn--block', { style: { marginTop: '16px' }, onclick: save }, t('Lưu ngân sách')),
    ],
  });
}

function openEditSheet(ctx, item, month, rerender) {
  const amountInput = moneyInput(item.amount, t('VD: 3.000.000'));
  amountInput.autofocus = true;
  let notify80 = item.notify80;
  const notifyCheck = el('input', { type: 'checkbox', checked: notify80, onchange: (e) => { notify80 = e.target.checked; } });
  let repeatNext = item.repeatNext;
  const repeatCheck = el('input', { type: 'checkbox', checked: repeatNext, onchange: (e) => { repeatNext = e.target.checked; } });
  const noteInput = el('input.input', { value: item.note || '', maxlength: '120' });

  const save = async () => {
    const amount = readMoney(amountInput);
    if (!amount || amount <= 0) return toast(t('Nhập số tiền lớn hơn 0'), 'error');

    const result = await guard(() => api.patch(`/api/budget/limits/${item.id}`, {
      amount, notify80, repeatNext, note: noteInput.value.trim() || null,
    }), t('Không lưu được ngân sách'));
    if (!result) return;

    closeSheet();
    toast(t('Đã lưu ngân sách'), 'success');
    await ctx.refreshWorld();
    rerender(month);
  };

  sheet({
    title: item.name,
    body: [
      el('label.field', {}, [el('span', {}, t('Hạn mức tháng')), amountInput]),
      el('label.field--check', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } }, [
        notifyCheck, el('span', {}, t('Gửi thông báo khi đạt 80% ngân sách')),
      ]),
      el('label.field', {}, [el('span', {}, t('Ghi chú')), noteInput]),
      el('label.field--check', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } }, [
        repeatCheck, el('span.withicon', {}, [uiIcon('repeat', 16), t('Lặp lại vào tháng dương lịch sau')]),
      ]),
      el('button.btn.btn--block', { style: { marginTop: '16px' }, onclick: save }, t('Lưu thay đổi')),
    ],
  });
}
