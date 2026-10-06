/** Tin tức / mẹo tài chính: carousel ở màn chủ của concept "Ekko Lover". */
import { el } from '/shared/client.js';
import { assetField, cellIcon, confirmAction, drawer, numberField, statusToggle, table, textAreaField, textField } from '../ui.js';

export default async function news(ctx) {
  const rows = await ctx.api.get('/api/admin/news');

  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', {}, [
        el('h1', {}, 'Tin tức'),
        el('p', {}, 'Mẹo tài chính ngắn hiện trong carousel vuốt ngang ở màn chủ của concept "Ekko Lover". Chỉ bài đã bật mới hiện cho người học.'),
      ]),
      el('div.page-head__actions', {}, [
        el('button.ekko-btn.ekko-btn--primary.ekko-btn--md', { onclick: () => edit(ctx, null, rows) }, '+ Thêm tin'),
      ]),
    ]),

    table(
      [{ label: '' }, { label: 'Tiêu đề' }, { label: 'Nhãn' }, { label: 'Đọc', align: 'right' }, { label: 'Trạng thái' }, { label: '' }],
      rows,
      (row) => el('tr', {}, [
        el('td', {}, row.image
          ? el('img', { src: row.image, alt: '', style: { width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px' } })
          : cellIcon('news')),
        el('td', {}, [
          el('strong', {}, row.title),
          row.summary ? el('span.cellmeta', {}, row.summary) : null,
        ]),
        el('td', {}, row.category ? el('code', { style: { fontSize: 'var(--font-size-text-xs)' } }, row.category) : ''),
        el('td.num', {}, `${row.read_minutes} phút`),
        el('td', {}, [statusToggle(ctx, { entity: 'news', id: row.id, field: 'is_published', value: row.is_published, on: 'Đang hiện', off: 'Đã ẩn', name: row.title })]),
        el('td', {}, [el('div.actions', {}, [
          el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { onclick: () => edit(ctx, row, rows) }, 'Sửa'),
          el('button.ekko-btn.ekko-btn--tertiary.ekko-btn--sm', { onclick: () => remove(ctx, row) }, 'Xoá'),
        ])]),
      ]),
    ),
  ]);
}

function edit(ctx, row, rows) {
  const isNew = !row;
  const fields = {
    title: textField({ label: 'Tiêu đề', value: row?.title, placeholder: 'VD: Cách quản lý chi tiêu', required: true }),
    summary: textAreaField({ label: 'Tóm tắt', value: row?.summary, rows: 2, placeholder: 'Một câu ngắn hiện dưới tiêu đề.' }),
    category: textField({ label: 'Nhãn nhỏ', value: row?.category || 'Mẹo', hint: 'Hiện phía trên tiêu đề, vd "Mẹo", "Kiến thức".' }),
    image: assetField({ label: 'Ảnh minh hoạ', value: row?.image, uploader: ctx.uploader }),
    body: textAreaField({ label: 'Nội dung đầy đủ', value: row?.body, rows: 8, placeholder: 'Nội dung hiện ở màn xem chi tiết. Để trống dòng giữa các đoạn.' }),
    read_minutes: numberField({ label: 'Thời gian đọc (phút)', value: row?.read_minutes ?? 3 }),
    order_index: numberField({ label: 'Thứ tự hiển thị', value: row?.order_index ?? (Math.max(0, ...rows.map((r) => r.order_index)) + 1) }),
  };

  drawer({
    title: isNew ? 'Thêm tin' : `Sửa: ${row.title}`,
    fields: Object.values(fields),
    onSave: async () => {
      const body = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.get()]));
      if (!body.title?.trim()) {
        ctx.notify('Cần nhập tiêu đề', 'error');
        return false;
      }
      try {
        if (isNew) await ctx.api.post('/api/admin/news', { ...body, is_published: 1 });
        else await ctx.api.patch(`/api/admin/news/${row.id}`, body);
        ctx.notify('Đã lưu tin', 'success');
        await ctx.reload();
      } catch (err) {
        ctx.notify(err.message, 'error');
        return false;
      }
      return true;
    },
  });
}

async function remove(ctx, row) {
  if (!await confirmAction(`Xoá tin "${row.title}"?`)) return;
  try {
    await ctx.api.delete(`/api/admin/news/${row.id}`);
    ctx.notify('Đã xoá tin');
    await ctx.reload();
  } catch (err) {
    ctx.notify(err.message, 'error');
  }
}
