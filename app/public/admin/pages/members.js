/**
 * Người học. Progress and engagement only. Personal budget, goal and expense
 * records are never exposed here.
 */
import { el, formatDay } from '/shared/client.js';
import { badge, companyPicker, confirmAction, hashParams, table } from '../ui.js';

export default async function members(ctx) {
  const employer = hashParams().get('employer') || '';
  const [rows, signup, picker] = await Promise.all([
    ctx.api.get(`/api/admin/stats/users${employer ? `?employer=${encodeURIComponent(employer)}` : ''}`),
    ctx.api.get('/api/admin/settings/signup'),
    companyPicker(ctx, '/members'),
  ]);

  const resetPassword = async (row) => {
    const ok = await confirmAction(`Tạo mật khẩu tạm mới cho ${row.name} (${row.email})? Mật khẩu cũ sẽ không dùng được nữa.`, { title: 'Đặt lại mật khẩu', confirmLabel: 'Đặt lại' });
    if (!ok) return;
    try {
      const result = await ctx.api.post(`/api/admin/members/${row.id}/reset-password`, {});
      // Chỉ hiện đúng một lần: Admin chép rồi gửi cho người dùng, nhắc họ đổi lại.
      await confirmAction(`Mật khẩu tạm của ${result.email}: ${result.password} — gửi cho người dùng và nhắc họ đổi ở trang Cấp độ heo → Tài khoản. Mật khẩu này chỉ hiện một lần.`, { title: 'Mật khẩu tạm', confirmLabel: 'Đã chép' });
    } catch (err) { ctx.notify(err.message, 'error'); }
  };
  const toggleRole = async (row) => {
    const next = row.role === 'admin' ? 'member' : 'admin';
    const ok = await confirmAction(next === 'admin'
      ? `Cấp quyền quản trị cho ${row.name}? Người này sẽ vào được Admin portal.`
      : `Bỏ quyền quản trị của ${row.name}?`, { title: 'Quyền quản trị', confirmLabel: next === 'admin' ? 'Cấp quyền' : 'Bỏ quyền' });
    if (!ok) return;
    try {
      await ctx.api.post(`/api/admin/members/${row.id}/role`, { role: next });
      ctx.notify('Đã cập nhật quyền', 'success');
      ctx.reload();
    } catch (err) { ctx.notify(err.message, 'error'); }
  };
  const search = el('input', { type: 'search', placeholder: 'Tìm theo tên, email hoặc công ty' });
  const listHost = el('div');

  const draw = () => {
    const query = search.value.trim().toLowerCase();
    const filtered = query
      ? rows.filter((r) => [r.name, r.email, r.employer].filter(Boolean).some((v) => v.toLowerCase().includes(query)))
      : rows;

    listHost.replaceChildren(table(
      [{ label: 'Người học' }, { label: 'Công ty' }, { label: 'Cấp độ' }, { label: 'XP', align: 'right' }, { label: 'Streak', align: 'right' }, { label: 'Bài học', align: 'right' }, { label: 'Huy hiệu', align: 'right' }, { label: 'Hoạt động gần nhất' }, { label: 'Tài khoản' }],
      filtered,
      (row) => el('tr', {}, [
        el('td', {}, [
          el('strong', {}, row.name),
          el('span.cellmeta', {}, row.email || '—'),
        ]),
        el('td', {}, [row.employer || '—', row.employer_id ? el('span.cellmeta', {}, `mã ${row.employer_id}`) : null]),
        el('td', {}, [
          row.level_name || '—',
          row.role === 'admin' ? badge('Quản trị', 'brand') : null,
        ]),
        el('td.num', {}, String(row.xp ?? 0)),
        el('td.num', {}, [
          String(row.streak_count ?? 0),
          el('span.cellmeta', {}, `kỷ lục ${row.streak_best ?? 0}`),
        ]),
        el('td.num', {}, String(row.lessons_done ?? 0)),
        el('td.num', {}, String(row.badges ?? 0)),
        el('td', {}, row.last_active_day ? formatDay(row.last_active_day) : 'Chưa có'),
        el('td', {}, el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
          row.has_password
            ? el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => resetPassword(row) }, 'Đặt lại mật khẩu')
            : el('span.cellmeta', {}, 'SSO / demo'),
          el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => toggleRole(row) }, row.role === 'admin' ? 'Bỏ quyền QT' : 'Cấp quyền QT'),
        ])),
      ]),
    ));
  };

  search.addEventListener('input', draw);
  draw();

  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', { style: { flex: '1' } }, [
        el('h1', {}, 'Người học'),
        el('p', {}, 'Tiến độ học tập và mức độ tham gia. Ngân sách, mục tiêu và chi tiêu của từng người là dữ liệu riêng tư và không hiển thị ở đây.'),
      ]),
      picker,
    ]),

    signupPanel(ctx, signup),

    el('div.toolbar', {}, [
      el('span.ekko-input.ekko-input--md', {}, [search]),
      el('span.hint', {}, `${rows.length} người học`),
    ]),

    listHost,
  ]);
}

/**
 * Đăng ký nội bộ (thử nghiệm): mở / đóng đăng ký và mã đăng ký người thử nghiệm
 * phải nhập. Bản chạy thật dùng SSO và tắt hẳn phần này (EKKO_LOCAL_AUTH=0).
 */
function signupPanel(ctx, signup) {
  if (!signup.localAuth) {
    return el('div.panel', { style: { marginBottom: '16px' } }, [
      el('div.panel__head', {}, [el('h2', {}, 'Đăng ký nội bộ')]),
      el('p.hint', { style: { margin: 0 } }, 'Đang tắt (EKKO_LOCAL_AUTH=0): người dùng chỉ vào được từ app Ekko qua SSO.'),
    ]);
  }
  const open = el('input', { type: 'checkbox', role: 'switch', checked: signup.open ? true : null });
  const code = el('input', { type: 'text', value: signup.code, maxlength: '20', disabled: signup.codeFromEnv ? true : null, style: { textTransform: 'uppercase', letterSpacing: '.08em' } });
  const save = async () => {
    try {
      const body = { open: open.checked };
      if (!signup.codeFromEnv) body.code = code.value;
      const result = await ctx.api.put('/api/admin/settings/signup', body);
      code.value = result.code;
      ctx.notify('Đã lưu cài đặt đăng ký', 'success');
    } catch (err) { ctx.notify(err.message, 'error'); }
  };
  return el('div.panel', { style: { marginBottom: '16px' } }, [
    el('div.panel__head', {}, [el('h2', {}, 'Đăng ký nội bộ (thử nghiệm)')]),
    el('p.hint', { style: { margin: '0 0 12px' } }, 'Người thử nghiệm tự tạo tài khoản bằng email + mật khẩu ở /app/, cần nhập mã đăng ký dưới đây. Quên mật khẩu thì bấm "Đặt lại mật khẩu" ở danh sách bên dưới. Khi chạy thật qua app Ekko, tắt hẳn bằng biến EKKO_LOCAL_AUTH=0.'),
    el('div', { style: { display: 'flex', gap: '24px', alignItems: 'flex-end', flexWrap: 'wrap' } }, [
      el('label.statustoggle', {}, [
        el('span.ekko-switch', {}, [open, el('span.ekko-switch__track'), el('span.ekko-switch__thumb')]),
        el('span.statustoggle__label', {}, 'Cho phép đăng ký mới'),
      ]),
      el('label.ekko-field', { style: { width: '240px' } }, [
        el('span.ekko-field__label', {}, 'Mã đăng ký nội bộ'),
        el('span.ekko-input.ekko-input--md', {}, [code]),
        signup.codeFromEnv ? el('span.ekko-field__hint', {}, 'Lấy từ biến EKKO_SIGNUP_CODE') : null,
      ]),
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', { type: 'button', onclick: save }, 'Lưu'),
    ]),
  ]);
}
