/**
 * Cấp độ heo: the pig ranks.
 *
 * A rank is: a number, an icon, a name, an XP threshold, an optional perk, and
 * the pig artwork — one shared image plus an optional one for members who pick
 * "Nữ" in their profile (empty = they see the shared image). Editing happens in a centred modal because the form reads
 * better in two columns than in the side drawer.
 */
import { el } from '/shared/client.js';
import { assetField, cellIcon, confirmAction, iconAction, iconField, modal, numberField, table, textAreaField, textField } from '../ui.js';

export default async function levels(ctx) {
  const rows = await ctx.api.get('/api/admin/levels');

  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', {}, [
        el('h1', {}, 'Cấp độ heo'),
        el('p', {}, `${rows.length} mục`),
      ]),
      el('div.page-head__actions', {}, [
        el('button.ekko-btn.ekko-btn--primary.ekko-btn--md', { onclick: () => edit(ctx, null, rows) }, ['+', ' Thêm mới']),
      ]),
    ]),

    thresholdWarning(rows),

    table(
      [{ label: '#' }, { label: 'Heo' }, { label: 'Heo nữ' }, { label: 'Tên' }, { label: 'Min XP' }, { label: 'Phúc lợi' }, { label: '' }],
      rows,
      (row) => el('tr', {}, [
        el('td', {}, String(row.order_index)),
        el('td', {}, [row.character_image ? el('img.thumb', { src: row.character_image, alt: '' }) : '—']),
        el('td', {}, [row.character_image_female
          ? el('img.thumb', { src: row.character_image_female, alt: '' })
          : el('span', { style: { color: 'var(--text-tertiary)' }, title: 'Chưa có ảnh: người dùng nữ thấy ảnh heo chung' }, '—')]),
        el('td', {}, [
          el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } }, [
            row.emoji ? cellIcon(row.emoji, 'piggy-bank') : null,
            row.name,
          ]),
        ]),
        el('td', {}, String(row.xp_required)),
        el('td', { style: { maxWidth: '260px' } }, [
          row.perk
            ? el('span', { style: { whiteSpace: 'normal' } }, row.perk)
            : el('span', { style: { color: 'var(--text-tertiary)' } }, '—'),
        ]),
        el('td', {}, [el('div.actions', {}, [
          iconAction('edit-02-stroke', { label: `Sửa ${row.name}`, onclick: () => edit(ctx, row, rows) }),
          iconAction('delete-02-stroke', { label: `Xoá ${row.name}`, tone: 'danger', onclick: () => remove(ctx, row) }),
        ])]),
      ]),
    ),
  ]);
}

/** Ranks must climb; an out-of-order threshold silently breaks progression. */
function thresholdWarning(rows) {
  const active = [...rows].sort((a, b) => a.order_index - b.order_index);
  const broken = active.some((row, i) => i > 0 && row.xp_required <= active[i - 1].xp_required);
  if (!broken) return null;
  return el('div.panel', { style: { borderColor: 'var(--border-warning)', background: 'var(--bg-warning-50)', marginBottom: '16px' } }, [
    el('strong', {}, 'Ngưỡng XP chưa tăng dần'),
    el('p.hint', { style: { margin: '4px 0 0' } },
      'Mỗi cấp phải có XP tối thiểu lớn hơn cấp trước. Nếu không, người học sẽ không lên cấp đúng thứ tự.'),
  ]);
}

function edit(ctx, row, rows) {
  const isNew = !row;
  const nextOrder = Math.max(0, ...rows.map((r) => r.order_index)) + 1;

  const fields = {
    order_index: numberField({ label: 'Số thứ tự', value: row?.order_index ?? nextOrder, required: true }),
    emoji: iconField({ label: 'Biểu tượng', value: row?.emoji, fallback: 'piggy-bank' }),
    name: textField({ label: 'Tên', value: row?.name, placeholder: 'VD: Heo Tích Lũy', required: true }),
    xp_required: numberField({ label: 'XP tối thiểu', value: row?.xp_required ?? 0, required: true }),
    perk: textAreaField({ label: 'Phúc lợi', value: row?.perk, rows: 3, placeholder: 'Người học được gì khi đạt cấp này' }),
    character_image: assetField({ label: 'Ảnh nhân vật heo', value: row?.character_image, uploader: ctx.uploader }),
    character_image_female: assetField({
      label: 'Ảnh nhân vật heo (nữ)',
      value: row?.character_image_female,
      hint: 'Hiện cho người dùng chọn giới tính Nữ. Để trống thì dùng ảnh heo chung.',
      uploader: ctx.uploader,
    }),
  };

  modal({
    title: isNew ? 'Thêm cấp độ' : 'Sửa cấp độ',
    rows: [
      [fields.order_index, fields.emoji],
      [fields.name],
      [fields.xp_required],
      [fields.perk],
      [fields.character_image, fields.character_image_female],
    ],
    onSave: async () => {
      const body = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.get()]));
      if (!body.name) { ctx.notify('Tên cấp độ không được để trống', 'error'); return false; }
      try {
        if (isNew) await ctx.api.post('/api/admin/levels', body);
        else await ctx.api.patch(`/api/admin/levels/${row.id}`, body);
        ctx.notify('Đã lưu cấp độ', 'success');
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
  if (!await confirmAction(`Xoá cấp độ "${row.name}"? Người học đang ở cấp này sẽ được tính lại theo XP.`)) return;
  try {
    await ctx.api.delete(`/api/admin/levels/${row.id}`);
    ctx.notify('Đã xoá cấp độ');
    await ctx.reload();
  } catch (err) {
    ctx.notify(err.message, 'error');
  }
}
