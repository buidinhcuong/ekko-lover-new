/** Bốn chức năng người học dùng hằng ngày, ngoài phần bài học. */
import { el } from '/shared/client.js';
import { companyPicker, hashParams, modal, numberField, statusToggle, table, tabbed, textAreaField, textField } from '../ui.js';
import { categoriesPanel } from './categories.js';

export default async function features(ctx) {
  const employer = hashParams().get('employer') || '';
  const [modules, rows, learning, ai, teamXp, picker, modulePicker] = await Promise.all([
    ctx.api.get(`/api/admin/settings/modules${employer ? `?employer=${encodeURIComponent(employer)}` : ''}`),
    ctx.api.get('/api/admin/features'),
    ctx.api.get('/api/admin/settings/learning-xp'),
    ctx.api.get(`/api/admin/settings/ai${employer ? `?employer=${encodeURIComponent(employer)}` : ''}`),
    ctx.api.get('/api/admin/settings/team-xp'),
    companyPicker(ctx, '/features'),
    companyPicker(ctx, '/features'),
  ]);
  ai.picker = picker;

  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', {}, [
        el('h1', {}, 'Chức năng'),
        el('p', {}, 'Bật / tắt từng chức năng cho toàn hệ thống, cùng điểm thưởng XP của các chức năng dùng hằng ngày.'),
      ]),
    ]),

    modulesPanel(ctx, modules, { employer, picker: modulePicker }),

    learningXpPanel(ctx, learning),
    teamXpPanel(ctx, teamXp),
    aiPanel(ctx, ai),

    table(
      [{ label: 'Chức năng' }, { label: 'Mã' }, { label: 'Đường dẫn' }, { label: 'XP mỗi ngày', align: 'right' }, { label: 'Cộng XP' }, { label: '' }],
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
        // Cột này chỉ quyết định có cộng XP / streak khi dùng chức năng hay không;
        // ẩn hẳn chức năng khỏi app thì dùng bảng "Bật / tắt chức năng" ở trên.
        el('td', {}, [statusToggle(ctx, { entity: 'features', id: row.id, field: 'is_enabled', value: row.is_enabled, on: 'Đang cộng XP', off: 'Không cộng XP', name: `cộng XP ${row.name}` })]),
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

/**
 * Bật / tắt chức năng cho toàn hệ thống (server/services/modules.js): tắt là app
 * ẩn hẳn chức năng đó và server chặn API của nó; dữ liệu cũ giữ nguyên.
 */
function modulesPanel(ctx, modules, { employer, picker }) {
  const company = employer && employer !== '__none__' ? employer : null;
  const companyName = company ? (picker.selectedOptions[0]?.textContent || company).replace(/\s*\(\d+ người\)$/, '') : null;
  const count = el('span.cellmeta', { style: { display: 'inline' } });
  const paintCount = () => { count.textContent = `${modules.filter((m) => m.enabled).length}/${modules.length} đang bật${company ? ' với công ty này' : ''}`; };
  paintCount();

  const save = async (m, enabled) => {
    const r = await ctx.api.put(`/api/admin/settings/modules/${m.code}`, company ? { enabled, employer: company } : { enabled });
    Object.assign(m, r.modules.find((x) => x.code === m.code));
    paintCount();
  };

  // Mặc định cả hệ thống: một công tắc mỗi chức năng.
  const systemCard = (m) => {
    const input = el('input', { type: 'checkbox', role: 'switch', checked: m.enabled ? true : null, 'aria-label': `Bật / tắt ${m.name}` });
    const state = el('span.modulecard__state', {}, m.enabled ? 'Đang bật' : 'Đã tắt');
    const node = el(`label.modulecard${m.enabled ? '' : '.is-off'}`, {}, [
      el('span.modulecard__text', {}, [el('b', {}, m.name), el('small', {}, m.description)]),
      el('span.modulecard__toggle', {}, [el('span.ekko-switch', {}, [input, el('span.ekko-switch__track'), el('span.ekko-switch__thumb')]), state]),
    ]);
    input.addEventListener('change', async () => {
      input.disabled = true;
      try {
        await save(m, input.checked);
        ctx.notify(`${m.enabled ? 'Đã bật' : 'Đã tắt'}: ${m.name} — mặc định cho mọi công ty (trừ công ty đặt riêng)`, 'success');
      } catch (err) { ctx.notify(err.message, 'error'); }
      input.checked = m.enabled;
      input.disabled = false;
      state.textContent = m.enabled ? 'Đang bật' : 'Đã tắt';
      node.classList.toggle('is-off', !m.enabled);
    });
    return node;
  };

  // Riêng một công ty: Theo mặc định · Bật · Tắt.
  const companyCard = (m) => {
    const node = el('div.modulecard.modulecard--company');
    const draw = () => {
      node.classList.toggle('is-off', !m.enabled);
      const choice = m.override === null ? 'default' : m.override ? 'on' : 'off';
      const opt = (code, label) => el('button.segment__btn', {
        type: 'button', 'aria-pressed': String(choice === code),
        onclick: async () => {
          if (choice === code) return;
          try {
            await save(m, code === 'default' ? null : code === 'on');
            ctx.notify(`${m.name}: ${code === 'default' ? 'theo mặc định hệ thống' : code === 'on' ? 'bật riêng' : 'tắt riêng'} cho ${companyName}`, 'success');
          } catch (err) { ctx.notify(err.message, 'error'); }
          draw();
        },
      }, label);
      node.replaceChildren(
        el('span.modulecard__text', {}, [
          el('b', {}, m.name),
          el('small', {}, m.override === null
            ? `Theo mặc định hệ thống: ${m.system ? 'đang bật' : 'đang tắt'}`
            : `Đặt riêng cho công ty này: ${m.override ? 'bật' : 'tắt'} (mặc định hệ thống: ${m.system ? 'bật' : 'tắt'})`),
        ]),
        el('div.segment.modulecard__segment', { role: 'group', 'aria-label': `${m.name} với ${companyName}` }, [
          opt('default', 'Mặc định'), opt('on', 'Bật'), opt('off', 'Tắt'),
        ]),
      );
    };
    draw();
    return node;
  };

  return el('div.panel', { style: { marginBottom: '16px' } }, [
    el('div.panel__head', {}, [el('h2', {}, 'Bật / tắt chức năng'), el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, [count, picker])]),
    el('p.hint', { style: { margin: '0 0 12px' } }, company
      ? `Đang đặt riêng cho ${companyName}. "Mặc định" = theo cài đặt chung của hệ thống; "Bật" / "Tắt" = riêng công ty này, thắng cài đặt chung. Áp dụng ngay cho người lao động của công ty.`
      : 'Cài đặt chung cho cả hệ thống — áp dụng ngay cho mọi công ty, trừ công ty đã đặt riêng (chọn công ty ở góc phải để đặt riêng). Tắt một chức năng thì app ẩn hẳn chức năng đó và chặn mọi thao tác tới nó; dữ liệu cũ giữ nguyên, bật lại là thấy như trước.'),
    el('div.modulegrid', {}, modules.map(company ? companyCard : systemCard)),
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
