/**
 * Đăng nhập / đăng ký bằng email + mật khẩu — chỉ để thử nghiệm nội bộ
 * (server/services/localAuth.js). Bản chạy thật mở từ app Ekko qua SSO nên màn
 * này không hiện (server trả `localAuth: false`).
 *
 * Cũng ở đây: thẻ "Tài khoản" (đổi mật khẩu, đăng xuất) đặt cuối trang Cấp độ heo.
 */
import { api, ApiError, el, mount, toast } from '/shared/client.js';
import { t } from './i18n.js';
import { confirmSheet, closeSheet, sheet } from './ui.js';

const field = (label, input) => el('label.field', {}, [el('span', {}, label), input]);
const input = (props) => el('input.input', { autocomplete: 'off', ...props });

/**
 * Màn khi chưa đăng nhập. `config` lấy từ /api/auth/config.
 * @param {HTMLElement} root
 */
export function renderAuth(root, config) {
  if (!config?.localAuth) {
    // Bản chạy thật: chỉ vào được từ app Ekko.
    mount(root, el('div.empty', { style: { minHeight: '70vh', display: 'grid', alignContent: 'center' } }, [
      el('img', { src: '/assets/mascot/ekko-bot.png', alt: '' }),
      el('h3', {}, t('Hãy mở từ app Ekko')),
      el('p.muted', {}, t('Tính năng Giáo dục tài chính đăng nhập bằng tài khoản Ekko của bạn.')),
      config?.demo ? el('a.btn', { href: '/dev/login', style: { marginTop: '16px' } }, t('Mở bản demo')) : null,
    ]));
    return;
  }

  let mode = 'login';
  const host = el('div.authcard');

  const draw = () => {
    const error = el('p.authcard__error', { role: 'alert' });
    const button = el('button.btn.btn--block', { type: 'submit' }, mode === 'login' ? t('Đăng nhập') : t('Tạo tài khoản'));
    const email = input({ type: 'email', name: 'email', autocomplete: 'email', required: true, placeholder: 'ten@congty.vn' });
    const password = input({
      type: 'password', name: 'password', required: true, minlength: '8',
      autocomplete: mode === 'login' ? 'current-password' : 'new-password',
      placeholder: mode === 'login' ? '' : t('Ít nhất 8 ký tự'),
    });
    const name = input({ name: 'name', autocomplete: 'name', required: true, maxlength: '60', placeholder: t('VD: Nguyễn Văn An') });
    const code = input({ name: 'code', required: true, autocapitalize: 'characters', placeholder: t('Quản trị viên gửi cho bạn') });

    const submit = async (event) => {
      event.preventDefault();
      error.textContent = '';
      button.disabled = true;
      try {
        if (mode === 'login') {
          await api.post('/api/auth/login', { email: email.value, password: password.value });
        } else {
          await api.post('/api/auth/register', { name: name.value, email: email.value, password: password.value, code: code.value });
        }
        // Có phiên rồi: tải lại app từ đầu (lấy hồ sơ, concept, dữ liệu…).
        location.replace('/app/#/');
        location.reload();
      } catch (err) {
        error.textContent = err instanceof ApiError ? err.message : t('Không kết nối được, thử lại nhé.');
        button.disabled = false;
      }
    };

    const switchTo = (next) => () => { mode = next; draw(); };
    mount(host,
      el('img.authcard__mascot', { src: '/assets/mascot/ekko-lover-mascot.png', alt: '' }),
      el('h2.authcard__title', {}, mode === 'login' ? t('Đăng nhập Ekko') : t('Tạo tài khoản thử nghiệm')),
      el('p.muted.authcard__sub', {}, t('Bản thử nghiệm nội bộ — khi chạy thật sẽ đăng nhập bằng tài khoản app Ekko.')),
      config.signupOpen ? el('div.chips.authcard__tabs', {}, [
        el('button.chip', { type: 'button', 'aria-pressed': String(mode === 'login'), onclick: switchTo('login') }, t('Đăng nhập')),
        el('button.chip', { type: 'button', 'aria-pressed': String(mode === 'register'), onclick: switchTo('register') }, t('Đăng ký')),
      ]) : null,
      el('form.authcard__form', { onsubmit: submit, novalidate: false }, [
        mode === 'register' ? field(t('Tên hiển thị'), name) : null,
        field(t('Email'), email),
        field(t('Mật khẩu'), password),
        mode === 'register' ? field(t('Mã đăng ký nội bộ'), code) : null,
        error,
        button,
      ]),
      el('p.muted.authcard__foot', {}, mode === 'login'
        ? t('Quên mật khẩu? Nhờ quản trị viên đặt lại giúp bạn.')
        : t('Mỗi email một tài khoản. Mã đăng ký do quản trị viên cung cấp.')),
      config.demo ? el('a.authcard__demo', { href: '/dev/login' }, t('Hoặc mở bản demo có sẵn dữ liệu')) : null,
    );
    (mode === 'register' ? name : email).focus();
  };

  draw();
  mount(root, el('div.authpage', {}, [host]));
}

/** Thẻ "Tài khoản" cuối trang Cấp độ heo: đổi mật khẩu (tài khoản email) và đăng xuất. */
export function accountCard(user) {
  const logout = async () => {
    const ok = await confirmSheet({ title: t('Đăng xuất?'), message: t('Bạn sẽ cần đăng nhập lại để vào app.'), confirmLabel: t('Đăng xuất'), tone: 'danger' });
    if (!ok) return;
    try { await api.post('/api/session/logout', {}); } catch { /* cookie hết hạn cũng coi như đã đăng xuất */ }
    location.replace('/app/');
  };

  return el('div.card.accountcard', {}, [
    el('div.accountcard__who', {}, [
      el('b', {}, user?.name || ''),
      user?.email ? el('span.muted', {}, user.email) : null,
    ]),
    el('div.accountcard__actions', {}, [
      user?.localAccount ? el('button.btn.btn--sm.btn--ghost', { type: 'button', onclick: openChangePassword }, t('Đổi mật khẩu')) : null,
      el('button.btn.btn--sm.btn--danger', { type: 'button', onclick: logout }, t('Đăng xuất')),
    ]),
  ]);
}

function openChangePassword() {
  const current = input({ type: 'password', autocomplete: 'current-password', required: true });
  const next = input({ type: 'password', autocomplete: 'new-password', required: true, minlength: '8', placeholder: t('Ít nhất 8 ký tự') });
  const error = el('p.authcard__error', { role: 'alert' });
  const button = el('button.btn.btn--block', { type: 'submit' }, t('Lưu mật khẩu mới'));
  const submit = async (event) => {
    event.preventDefault();
    error.textContent = '';
    button.disabled = true;
    try {
      await api.post('/api/me/password', { current: current.value, next: next.value });
      closeSheet();
      toast(t('Đã đổi mật khẩu'), 'success');
    } catch (err) {
      error.textContent = err instanceof ApiError ? err.message : t('Không kết nối được, thử lại nhé.');
      button.disabled = false;
    }
  };
  sheet({
    title: t('Đổi mật khẩu'),
    body: [el('form.authcard__form', { onsubmit: submit }, [
      field(t('Mật khẩu hiện tại'), current),
      field(t('Mật khẩu mới'), next),
      error,
      button,
    ])],
  });
  setTimeout(() => current.focus(), 50);
}
