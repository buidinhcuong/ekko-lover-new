/**
 * Đối tác "Tiết kiệm cùng Ekko" — dữ liệu mẫu minh hoạ (không kết nối ngân
 * hàng thật), Admin sửa lãi suất theo từng kỳ hạn cố định. Đổi lãi suất ở đây
 * không ảnh hưởng các khoản người dùng đã gửi trước đó (server chốt lãi suất
 * tại thời điểm gửi, xem `createEkkoDeposit` trong server/services/savings.js).
 */
import { el } from '/shared/client.js';
import { cellIcon, confirmAction, modal, numberField, table, textField } from '../ui.js';

const TERMS = [3, 5, 6, 9, 12];

export default async function savings(ctx) {
  const rows = await ctx.api.get('/api/admin/savings_channels');

  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', {}, [
        el('h1', {}, 'Tiết kiệm cùng Ekko'),
        el('p', {}, 'Đối tác và lãi suất mẫu cho màn "Gửi tiết kiệm cùng Ekko" trong app. Không kết nối ngân hàng thật — chỉ để minh hoạ và tính lãi dự kiến.'),
      ]),
      el('button.ekko-btn.ekko-btn--primary.ekko-btn--md', { onclick: () => edit(ctx, null) }, '+ Thêm đối tác'),
    ]),

    table(
      [{ label: '' }, { label: 'Đối tác' }, { label: 'Lãi suất theo kỳ hạn (%/năm)' }, { label: 'Thứ tự', align: 'right' }, { label: '' }],
      rows,
      (row) => el('tr', {}, [
        el('td', {}, [row.logo?.startsWith('/') ? el('img.thumb', { src: row.logo, alt: '' }) : cellIcon(row.logo, 'bank')]),
        el('td', {}, [el('strong', {}, row.name)]),
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
    name: textField({ label: 'Tên đối tác', value: row?.name, required: true }),
    logo: textField({ label: 'Logo (/assets/...)', value: row?.logo?.startsWith('/') ? row.logo : '', placeholder: '/assets/banks/ten-doi-tac.png', hint: 'Dán đường dẫn ảnh logo. Để trống thì app dùng icon ngân hàng.' }),
    order_index: numberField({ label: 'Thứ tự hiển thị', value: row?.order_index ?? 0 }),
  };
  const rateFields = Object.fromEntries(TERMS.map((term) => [term, numberField({
    label: `Kỳ hạn ${term} tháng (%/năm)`,
    value: row?.rates?.[term] ?? '',
    hint: 'Để trống nếu đối tác này không nhận kỳ hạn này.',
  })]));

  modal({
    title: isNew ? 'Thêm đối tác tiết kiệm' : `Sửa: ${row.name}`,
    width: 640,
    rows: [
      [fields.name.node, fields.logo.node],
      [fields.order_index.node],
      TERMS.slice(0, 3).map((term) => rateFields[term].node),
      TERMS.slice(3).map((term) => rateFields[term].node),
    ],
    onSave: async () => {
      const rates = {};
      for (const term of TERMS) {
        const value = rateFields[term].get();
        if (value !== null) rates[term] = value;
      }
      if (!Object.keys(rates).length) { ctx.notify('Cần ít nhất một kỳ hạn có lãi suất', 'error'); return false; }

      const body = { name: fields.name.get(), logo: fields.logo.get(), order_index: fields.order_index.get() ?? 0, rates };
      try {
        if (isNew) await ctx.api.post('/api/admin/savings_channels', body);
        else await ctx.api.patch(`/api/admin/savings_channels/${row.id}`, body);
        ctx.notify(isNew ? 'Đã thêm đối tác' : 'Đã lưu đối tác', 'success');
        await ctx.reload();
      } catch (err) { ctx.notify(err.message, 'error'); return false; }
      return true;
    },
  });
}

async function remove(ctx, row) {
  if (!await confirmAction(`Xoá đối tác "${row.name}"? Các khoản người dùng đã gửi qua đối tác này vẫn giữ nguyên (chỉ mất ở màn chọn đối tác mới).`)) return;
  try {
    await ctx.api.delete(`/api/admin/savings_channels/${row.id}`);
    ctx.notify('Đã xoá đối tác', 'success');
    await ctx.reload();
  } catch (err) { ctx.notify(err.message, 'error'); }
}
