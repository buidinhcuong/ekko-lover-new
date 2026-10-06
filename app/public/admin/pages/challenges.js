/**
 * Thử thách: việc nhỏ tự làm mới theo kỳ — chặng khởi đầu (một lần), hằng ngày
 * (mỗi ngày app chọn 3 cái trong bộ) và hằng tuần (hiện hết). Mã nội bộ do
 * server tự sinh từ tên, không hiện ở đây. Xem services/challenges.js.
 */
import { el, mount } from '/shared/client.js';
import { confirmAction, drawer, numberField, selectField, statusToggle, table, textAreaField, textField } from '../ui.js';

let currentPeriod = 'daily';

const PERIOD_NOTE = {
  once: 'Hiện cho người mới tới khi nhận hết thưởng. Xong cả chặng được thưởng thêm 40 XP.',
  daily: 'Mỗi ngày app chọn 3 thử thách trong bộ này cho từng người (cố định trong ngày). Nhận hết cả 3 được thưởng thêm 20 XP.',
  weekly: 'Mọi thử thách tuần đều hiện, tính từ thứ Hai tới Chủ nhật.',
};

export default async function challenges(ctx) {
  const rows = await ctx.api.get('/api/admin/challenges');
  const rules = ctx.meta.challengeRules;
  const periods = ctx.meta.challengePeriods;

  const host = el('div');
  const tabs = el('div.dialogtabs', { role: 'tablist', style: { marginBottom: '12px' } });

  const draw = () => {
    const shown = rows.filter((r) => r.period === currentPeriod);
    mount(tabs, Object.entries(periods).map(([code, label]) => el('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': String(code === currentPeriod),
      onclick: () => { currentPeriod = code; draw(); },
    }, `${label} (${rows.filter((r) => r.period === code).length})`)));
    mount(host, [
      el('p.hint', { style: { marginBottom: '12px' } }, PERIOD_NOTE[currentPeriod]),
      table(
        [{ label: '' }, { label: 'Thử thách' }, { label: 'Điều kiện' }, { label: 'Ngưỡng', align: 'right' }, { label: 'Thưởng XP', align: 'right' }, { label: 'Trạng thái' }, { label: '' }],
        shown,
        (row) => el('tr', {}, [
          el('td', { style: { fontSize: 'var(--font-size-display-xs)' } }, row.icon || '⭐'),
          el('td', {}, [
            el('strong', {}, row.name),
            row.description ? el('span.cellmeta', {}, row.description) : null,
          ]),
          el('td', {}, [
            rules[row.rule_type] || row.rule_type,
            row.rule_target ? el('span.cellmeta', {}, `Phạm vi: ${row.rule_target}`) : null,
          ]),
          el('td.num', {}, String(row.rule_value)),
          el('td.num', {}, String(row.xp_reward)),
          el('td', {}, [statusToggle(ctx, { entity: 'challenges', id: row.id, field: 'is_active', value: row.is_active, name: row.name })]),
          el('td', {}, [el('div.actions', {}, [
            el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { onclick: () => edit(ctx, row, rows) }, 'Sửa'),
            el('button.ekko-btn.ekko-btn--tertiary.ekko-btn--sm', { onclick: () => remove(ctx, row) }, 'Xoá'),
          ])]),
        ]),
      ),
    ]);
  };
  draw();

  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', {}, [
        el('h1', {}, 'Thử thách'),
        el('p', {}, 'Việc nhỏ tự làm mới theo ngày, theo tuần, kèm chặng khởi đầu cho người mới. Tiến độ tính trong đúng kỳ; người học bấm nhận thưởng trong trang Huy hiệu.'),
      ]),
      el('div.page-head__actions', {}, [
        el('button.ekko-btn.ekko-btn--primary.ekko-btn--md', { onclick: () => edit(ctx, null, rows) }, '+ Thêm thử thách'),
      ]),
    ]),
    tabs,
    host,
  ]);
}

function edit(ctx, row, rows) {
  const isNew = !row;
  const fields = {
    name: textField({ label: 'Tên hiển thị', value: row?.name, placeholder: 'VD: Học 2 bài hôm nay', required: true }),
    description: textAreaField({ label: 'Mô tả', value: row?.description, rows: 2 }),
    icon: textField({ label: 'Biểu tượng', value: row?.icon || '⭐', hint: 'Một emoji.' }),
    period: selectField({
      label: 'Kỳ', value: row?.period || currentPeriod,
      options: Object.entries(ctx.meta.challengePeriods),
    }),
    rule_type: selectField({
      label: 'Điều kiện', value: row?.rule_type || 'lessons_completed',
      options: Object.entries(ctx.meta.challengeRules).map(([key, label]) => [key, `${key} — ${label}`]),
    }),
    rule_value: numberField({ label: 'Ngưỡng', value: row?.rule_value ?? 1, required: true }),
    rule_target: textField({ label: 'Phạm vi (tuỳ chọn)', value: row?.rule_target, hint: `Chỉ dùng với "feature_used": mã chức năng (${ctx.meta.features.map((f) => f.code).join(', ')}).` }),
    xp_reward: numberField({ label: 'Thưởng XP', value: row?.xp_reward ?? 10 }),
    order_index: numberField({ label: 'Thứ tự hiển thị', value: row?.order_index ?? (Math.max(0, ...rows.map((r) => r.order_index)) + 1) }),
  };

  drawer({
    title: isNew ? 'Thêm thử thách' : `Sửa: ${row.name}`,
    fields: Object.values(fields),
    onSave: async () => {
      const body = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.get()]));
      body.rule_target = body.rule_target ? String(body.rule_target).trim() : null;
      if (['goals_created', 'budgets_created'].includes(body.rule_type) && body.period !== 'once') {
        ctx.notify('Điều kiện này chỉ dùng cho chặng khởi đầu', 'error');
        return false;
      }
      try {
        if (isNew) await ctx.api.post('/api/admin/challenges', body);
        else await ctx.api.patch(`/api/admin/challenges/${row.id}`, body);
        currentPeriod = body.period;
        ctx.notify('Đã lưu thử thách', 'success');
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
  if (!await confirmAction(`Xoá thử thách "${row.name}"?`)) return;
  try {
    await ctx.api.delete(`/api/admin/challenges/${row.id}`);
    ctx.notify('Đã xoá thử thách');
    await ctx.reload();
  } catch (err) {
    ctx.notify(err.message, 'error');
  }
}
