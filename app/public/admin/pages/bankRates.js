/**
 * Lãi suất tiết kiệm THAM KHẢO của ngân hàng thật, cho widget so sánh ở màn
 * Tiết kiệm trong app. Không có API công khai miễn phí nào cho lãi suất ngân
 * hàng VN, nên đây là số liệu Admin tự nhập/cập nhật định kỳ — khác hẳn
 * "Tiết kiệm cùng Ekko" (đối tác demo riêng cho luồng gửi tiết kiệm).
 */
import { el } from '/shared/client.js';
import { cellIcon, confirmAction, modal, numberField, selectField, table, textField } from '../ui.js';

const TERMS = [3, 6, 12];
const GROUPS = [['state', 'Nhà nước'], ['joint_stock', 'Cổ phần']];
const groupLabel = (code) => GROUPS.find(([c]) => c === code)?.[1] || code;

export default async function bankRates(ctx) {
  const rows = await ctx.api.get('/api/admin/bank_interest_rates');

  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', {}, [
        el('h1', {}, 'Lãi suất ngân hàng'),
        el('p', {}, 'Số liệu tham khảo cho widget so sánh lãi suất ở màn Tiết kiệm trong app. Không kết nối API ngân hàng thật — cập nhật tay theo báo chí tổng hợp định kỳ.'),
      ]),
      el('button.ekko-btn.ekko-btn--primary.ekko-btn--md', { onclick: () => edit(ctx, null) }, '+ Thêm ngân hàng'),
    ]),

    table(
      [{ label: '' }, { label: 'Ngân hàng' }, { label: 'Nhóm' }, { label: 'Lãi suất theo kỳ hạn (%/năm)' }, { label: 'Thứ tự', align: 'right' }, { label: '' }],
      rows,
      (row) => el('tr', {}, [
        el('td', {}, [row.logo?.startsWith('/') ? el('img.thumb', { src: row.logo, alt: '' }) : cellIcon(row.logo, 'bank')]),
        el('td', {}, [el('strong', {}, row.name)]),
        el('td', {}, [el('span.ekko-badge.ekko-badge--sm.ekko-badge--neutral', {}, groupLabel(row.group_code))]),
        el('td', {}, [el('span.cellmeta', {},
          TERMS.filter((term) => row.rates[term] != null).map((term) => `${term}th: ${row.rates[term]}%`).join(' · ') || '(chưa có lãi suất nào)')]),
        el('td.num', {}, String(row.order_index)),
        el('td', {}, [el('div.actions', {}, [
          el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { onclick: () => edit(ctx, row) }, 'Sửa'),
          el('button.ekko-btn.ekko-btn--danger.ekko-btn--sm', { onclick: () => remove(ctx, row) }, 'Xoá'),
        ])]),
      ]),
    ),
  ]);
}

function edit(ctx, row) {
  const isNew = !row;
  const fields = {
    name: textField({ label: 'Tên ngân hàng', value: row?.name, required: true }),
    group_code: selectField({ label: 'Nhóm', value: row?.group_code || 'state', options: GROUPS }),
    logo: textField({ label: 'Logo (/assets/...)', value: row?.logo?.startsWith('/') ? row.logo : '', placeholder: '/assets/banks/ten-ngan-hang.png', hint: 'Dán đường dẫn ảnh logo. Để trống thì app dùng icon ngân hàng.' }),
    order_index: numberField({ label: 'Thứ tự hiển thị', value: row?.order_index ?? 0 }),
  };
  const rateFields = Object.fromEntries(TERMS.map((term) => [term, numberField({
    label: `Kỳ hạn ${term} tháng (%/năm)`,
    value: row?.rates?.[term] ?? '',
    hint: 'Để trống nếu chưa có số liệu cho kỳ hạn này.',
  })]));

  modal({
    title: isNew ? 'Thêm ngân hàng' : `Sửa: ${row.name}`,
    width: 640,
    rows: [
      [fields.name.node, fields.group_code.node],
      [fields.logo.node, fields.order_index.node],
      TERMS.map((term) => rateFields[term].node),
    ],
    onSave: async () => {
      const rates = {};
      for (const term of TERMS) {
        const value = rateFields[term].get();
        if (value !== null) rates[term] = value;
      }
      if (!Object.keys(rates).length) { ctx.notify('Cần ít nhất một kỳ hạn có lãi suất', 'error'); return false; }

      const body = {
        name: fields.name.get(),
        group_code: fields.group_code.get(),
        logo: fields.logo.get(),
        order_index: fields.order_index.get() ?? 0,
        rates,
      };
      try {
        if (isNew) await ctx.api.post('/api/admin/bank_interest_rates', body);
        else await ctx.api.patch(`/api/admin/bank_interest_rates/${row.id}`, body);
        ctx.notify(isNew ? 'Đã thêm ngân hàng' : 'Đã lưu ngân hàng', 'success');
        await ctx.reload();
      } catch (err) { ctx.notify(err.message, 'error'); return false; }
      return true;
    },
  });
}

async function remove(ctx, row) {
  if (!await confirmAction(`Xoá "${row.name}" khỏi bảng so sánh lãi suất?`)) return;
  try {
    await ctx.api.delete(`/api/admin/bank_interest_rates/${row.id}`);
    ctx.notify('Đã xoá', 'success');
    await ctx.reload();
  } catch (err) { ctx.notify(err.message, 'error'); }
}
