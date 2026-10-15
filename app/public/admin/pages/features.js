/** Bốn chức năng người học dùng hằng ngày, ngoài phần bài học. */
import { el } from '/shared/client.js';
import { companyPicker, hashParams, modal, numberField, statusToggle, table, tabbed, textAreaField, textField } from '../ui.js';
import { categoriesPanel } from './categories.js';

export default async function features(ctx) {
  const employer = hashParams().get('employer') || '';
  const [rows, learning, ai, teamXp, picker] = await Promise.all([
    ctx.api.get('/api/admin/features'),
    ctx.api.get('/api/admin/settings/learning-xp'),
    ctx.api.get(`/api/admin/settings/ai${employer ? `?employer=${encodeURIComponent(employer)}` : ''}`),
    ctx.api.get('/api/admin/settings/team-xp'),
    companyPicker(ctx, '/features'),
  ]);
  ai.picker = picker;

  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', {}, [
        el('h1', {}, 'Chức năng'),
        el('p', {}, 'Bốn chức năng người học dùng hằng ngày. Mã chức năng gắn với logic trong app nên không nên đổi; tên, mô tả và điểm thưởng thì sửa thoải mái.'),
      ]),
    ]),

    learningXpPanel(ctx, learning),
    teamXpPanel(ctx, teamXp),
    aiPanel(ctx, ai),

    table(
      [{ label: 'Chức năng' }, { label: 'Mã' }, { label: 'Đường dẫn' }, { label: 'XP mỗi ngày', align: 'right' }, { label: 'Trạng thái' }, { label: '' }],
      rows,
      (row) => el('tr', {}, [
        el('td', {}, [
          el('strong', {}, row.name),
          row.description ? el('span.cellmeta', {}, row.description) : null,
          row.code === 'expenses' ? el('span.cellmeta', {}, 'Sửa để quản lý Nhóm chi tiêu') : null,
        ]),
        el('td', {}, [el('code', { style: { fontSize: 'var(--font-size-text-xs)' } }, row.code)]),
        el('td', {}, [el('span.cellmeta', {}, row.route)]),
        el('td.num', {}, String(row.xp_per_day)),
        el('td', {}, [statusToggle(ctx, { entity: 'features', id: row.id, field: 'is_enabled', value: row.is_enabled, on: 'Hiện trong app', off: 'Đã ẩn', name: row.name })]),
        el('td', {}, [el('div.actions', {}, [
          el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { onclick: () => edit(ctx, row) }, 'Sửa'),
        ])]),
      ]),
    ),

    el('div.panel', { style: { marginTop: '16px' } }, [
      el('div.panel__head', {}, [el('h2', {}, 'Cách tính streak')]),
      el('p.hint', {}, 'Mở một chức năng lên xem thì KHÔNG được gì. Chỉ khi người học thực sự làm một việc — lưu ngân sách, đặt hoặc nạp mục tiêu, ghi một khoản chi — lần đầu trong ngày mới cộng +1 streak và trả số XP ở cột "XP mỗi ngày". Các lần sau trong cùng ngày không cộng thêm. Bỏ lỡ một ngày là mất chuỗi: streak về 0 và lần hoạt động sau bắt đầu lại từ 1 (không có đóng băng).'),
    ]),
  ]);
}

const KIND_LABEL = { bot: 'Ekko bot', quick: 'Ghi nhanh', receipt: 'Đọc hoá đơn', advice: 'Tư vấn mục tiêu' };
const KEY_STATE = { ok: 'Đã có khoá API', missing: 'Chưa có khoá API — các tính năng AI dùng phần viết sẵn', invalid: 'Khoá API không hợp lệ' };

/**
 * AI: giới hạn lượt gọi mỗi người mỗi ngày (dùng chung cho Ekko bot, ghi nhanh,
 * đọc hoá đơn, tư vấn mục tiêu), số liệu hôm nay, và câu Ekko bot từ chối vì
 * ngoài phạm vi tài chính / app (chỉ nội dung, không kèm người hỏi).
 */
function aiPanel(ctx, ai) {
  const limit = numberField({ label: 'Lượt AI mỗi người mỗi ngày', value: ai.dailyLimit, hint: 'Hết lượt thì dùng phần viết sẵn; đọc hoá đơn thì nhắc nhập tay. 0 = không giới hạn.' });
  const save = async () => {
    // Ô trống không được ngầm thành 0 (0 ở đây là "không giới hạn").
    if (limit.get() == null) return ctx.notify('Nhập số lượt AI mỗi ngày (0 = không giới hạn)', 'error');
    try {
      await ctx.api.put('/api/admin/settings/ai', { dailyLimit: limit.get() });
      ctx.notify('Đã lưu giới hạn AI', 'success');
    } catch (err) { ctx.notify(err.message, 'error'); }
  };
  const usage = ai.usage;
  return el('div.panel', { style: { marginBottom: '16px' } }, [
    el('div.panel__head', {}, [el('h2', {}, 'AI'), ai.picker]),
    el('p.hint', { style: { margin: '0 0 12px' } }, `${KEY_STATE[ai.keyState] || ai.keyState} · model ${ai.model}`),
    el('div', { style: { display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' } }, [
      el('div', { style: { width: '260px' } }, [limit.node]),
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', { type: 'button', onclick: save, style: { marginTop: '26px' } }, 'Lưu'),
    ]),
    el('p.hint', { style: { margin: '12px 0 0' } }, [
      `${ai.employer ? 'Công ty đang chọn — hôm nay' : 'Hôm nay'}: ${usage.calls} lượt gọi AI`,
      usage.byKind.length ? ` (${usage.byKind.map((k) => `${KIND_LABEL[k.kind] || k.kind} ${k.n}`).join(', ')})` : '',
      usage.limit ? ` · ${usage.usersAtLimit} người đã hết lượt` : '',
    ].join('')),
    el('div', { style: { marginTop: '16px' } }, [
      el('strong', { style: { fontSize: 'var(--font-size-text-sm)' } }, 'Câu hỏi Ekko bot từ chối vì ngoài phạm vi'),
      ai.outOfScope.length
        ? el('ul', { style: { margin: '8px 0 0', paddingLeft: '18px', display: 'grid', gap: '4px', fontSize: 'var(--font-size-text-sm)' } },
          ai.outOfScope.map((q) => el('li', {}, [q.text, el('span.cellmeta', { style: { display: 'inline', marginLeft: '8px' } }, q.created_at.slice(0, 10))])))
        : el('p.hint', { style: { margin: '6px 0 0' } }, 'Chưa có câu nào.'),
    ]),
  ]);
}

/** XP học tập: một mức chung cho mọi bài học và mọi bài test mô đun. */
function learningXpPanel(ctx, values) {
  const lesson = numberField({ label: 'Mỗi bài học hoàn tất', value: values.lesson, hint: 'Chỉ lần đầu hoàn tất. Học lại không được thêm.' });
  const moduleQuiz = numberField({ label: 'Hoàn thành bài test của một mô đun', value: values.moduleQuiz, hint: 'Lần đầu nộp bài test, không phụ thuộc số câu đúng. Làm lại không được thêm.' });
  const checkin = numberField({ label: 'Check-in mỗi ngày', value: values.checkin, hint: 'Lần đầu vào màn chính trong ngày. Không tính streak. 0 = tắt.' });
  const save = async () => {
    if ([lesson, moduleQuiz, checkin].some((f) => f.get() == null)) return ctx.notify('Nhập đủ cả ba mức XP (0 = không cộng)', 'error');
    try {
      await ctx.api.put('/api/admin/settings/learning-xp', { lesson: lesson.get(), moduleQuiz: moduleQuiz.get(), checkin: checkin.get() });
      ctx.notify('Đã lưu XP học tập', 'success');
    } catch (err) { ctx.notify(err.message, 'error'); }
  };
  return el('div.panel', { style: { marginBottom: '16px' } }, [
    el('div.panel__head', {}, [el('h2', {}, 'XP học tập & check-in')]),
    el('div', { style: { display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' } }, [
      el('div', { style: { width: '260px' } }, [lesson.node]),
      el('div', { style: { width: '260px' } }, [moduleQuiz.node]),
      el('div', { style: { width: '220px' } }, [checkin.node]),
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', { type: 'button', onclick: save, style: { marginTop: '26px' } }, 'Lưu'),
    ]),
  ]);
}

/**
 * Heo Dream Team: một bạn trong đội kiếm XP thì mỗi bạn còn lại nhận thêm bấy
 * nhiêu % (làm tròn xuống). XP nhận từ đội không chia tiếp.
 */
function teamXpPanel(ctx, values) {
  const percent = numberField({
    label: '% XP nhận từ bạn cùng đội',
    value: values.percent,
    hint: 'Bạn cùng đội kiếm 100 XP thì mỗi người còn lại nhận thêm bấy nhiêu XP. 0 = tắt, tối đa 100.',
  });
  const save = async () => {
    const n = percent.get();
    if (n == null) return ctx.notify('Nhập % XP (0 = tắt)', 'error');
    if (!Number.isInteger(n) || n < 0 || n > 100) return ctx.notify('% XP phải là số nguyên từ 0 đến 100', 'error');
    try {
      await ctx.api.put('/api/admin/settings/team-xp', { percent: n });
      ctx.notify('Đã lưu % XP từ Dream Team', 'success');
    } catch (err) { ctx.notify(err.message, 'error'); }
  };
  return el('div.panel', { style: { marginBottom: '16px' } }, [
    el('div.panel__head', {}, [el('h2', {}, 'XP từ Heo Dream Team')]),
    el('p.hint', { style: { margin: '0 0 12px' } }, 'Tính trên mọi XP bạn cùng đội kiếm được (bài học, bài test, check-in, huy hiệu, thử thách) trong lúc đang chung đội. XP nhận từ đội không chia tiếp cho ai. Trên thanh tiến độ của người nhận, phần XP này có màu riêng.'),
    el('div', { style: { display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' } }, [
      el('div', { style: { width: '260px' } }, [percent.node]),
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', { type: 'button', onclick: save, style: { marginTop: '26px' } }, 'Lưu'),
    ]),
  ]);
}

function edit(ctx, row) {
  const fields = {
    name: textField({ label: 'Tên chức năng', value: row.name, required: true }),
    order_index: numberField({ label: 'Thứ tự', value: row.order_index }),
    description: textAreaField({ label: 'Mô tả', value: row.description, rows: 2 }),
    route: textField({ label: 'Đường dẫn trong app', value: row.route, hint: 'Ví dụ: /app/#/budget' }),
    xp_per_day: numberField({ label: 'XP cho lần dùng đầu tiên mỗi ngày', value: row.xp_per_day }),
  };

  const settings = el('div', { style: { display: 'grid', gap: '16px' } }, [
    el('div.formrow.formrow--2', {}, [fields.name.node, fields.order_index.node]),
    fields.description.node,
    el('div.formrow.formrow--2', {}, [fields.route.node, fields.xp_per_day.node]),
  ]);

  // Only the expense ledger has groups, so only it gets the second tab.
  const groups = row.code === 'expenses' ? categoriesPanel(ctx) : null;

  modal({
    title: `Sửa: ${row.name}`,
    width: 880,
    rows: [[tabbed([['Chức năng', settings], ['Nhóm chi tiêu', groups]])]],
    onSave: async () => {
      const body = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.get()]));
      try {
        await ctx.api.patch(`/api/admin/features/${row.id}`, body);
        ctx.notify('Đã lưu chức năng', 'success');
        await ctx.reload();
      } catch (err) { ctx.notify(err.message, 'error'); return false; }
      return true;
    },
  });
}
