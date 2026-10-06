/**
 * Đăng ký / đăng nhập bằng email + mật khẩu — **chỉ để thử nghiệm nội bộ**.
 * Khi triển khai thật, danh tính đến từ app Ekko qua SSO (auth.js); tắt phần này
 * bằng `EKKO_LOCAL_AUTH=0`.
 *
 * - Đăng ký cần **mã đăng ký nội bộ** (Admin → Người học, hoặc biến
 *   `EKKO_SIGNUP_CODE`), để người ngoài có đường dẫn cũng không tự tạo được tài
 *   khoản. Admin có thể đóng đăng ký bất cứ lúc nào.
 * - Mật khẩu băm bằng scrypt (muối ngẫu nhiên mỗi tài khoản), so bằng
 *   timingSafeEqual. Không bao giờ lưu hay ghi log mật khẩu gốc.
 * - Sai mật khẩu 5 lần liền: khoá đăng nhập tài khoản đó 15 phút. Thêm giới hạn
 *   số lần thử theo địa chỉ IP (trong bộ nhớ).
 * - Chưa có gửi email nên **quên mật khẩu = nhờ Admin đặt lại**: Admin bấm
 *   "Đặt lại mật khẩu", server tạo mật khẩu tạm và hiện đúng một lần.
 * - Tài khoản nội bộ là người dùng bình thường (`users.ekko_user_id` =
 *   `local:<email>`), nên mọi thứ khác (phiên, quyền admin theo
 *   EKKO_ADMIN_SUBJECTS, Dream Team…) dùng chung với SSO.
 */
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { get, getSetting, run, setSetting, tx } from '../db.js';
import { nowIso } from '../lib/time.js';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX_ATTEMPTS = 30;
const MIN_PASSWORD = 8;
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const fail = (message, status = 400) => ({ error: message, status });

// --- cấu hình -------------------------------------------------------------

export const localAuthEnabled = () => config.localAuth;

/** Mã đăng ký nội bộ: biến môi trường thắng; không có thì tạo một lần và lưu lại. */
export function signupCode() {
  if (process.env.EKKO_SIGNUP_CODE) return process.env.EKKO_SIGNUP_CODE.trim().toUpperCase();
  let code = getSetting('signup_code');
  if (!code) {
    code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    setSetting('signup_code', code);
  }
  return code;
}

export const signupOpen = () => getSetting('signup_open', '1') === '1';

export function signupSettings() {
  return {
    localAuth: localAuthEnabled(),
    open: signupOpen(),
    code: signupCode(),
    codeFromEnv: Boolean(process.env.EKKO_SIGNUP_CODE),
  };
}

export function updateSignupSettings({ open, code }) {
  if (open !== undefined) setSetting('signup_open', open ? '1' : '0');
  if (code !== undefined) {
    if (process.env.EKKO_SIGNUP_CODE) return fail('Mã đăng ký đang lấy từ biến môi trường EKKO_SIGNUP_CODE — sửa ở đó');
    const clean = String(code).trim().toUpperCase();
    if (!/^[A-Z0-9]{6,20}$/.test(clean)) return fail('Mã đăng ký gồm 6–20 chữ cái hoặc chữ số');
    setSetting('signup_code', clean);
  }
  return signupSettings();
}

/** Những gì màn đăng nhập cần biết (công khai, không lộ mã). */
export const publicAuthConfig = () => ({
  localAuth: localAuthEnabled(),
  signupOpen: localAuthEnabled() && signupOpen(),
  demo: config.devMode,
});

// --- mật khẩu -------------------------------------------------------------

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function checkPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Mật khẩu tạm Admin đưa cho người dùng, dễ đọc qua điện thoại: Ekko-XXXX-XXXX. */
function tempPassword() {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `Ekko-${part()}-${part()}`;
}

// --- giới hạn theo IP -----------------------------------------------------

const attemptsByIp = new Map();

/** true nếu IP này còn được thử; ghi nhận thêm một lần thử. */
export function allowAttempt(ip, now = Date.now()) {
  const key = ip || 'unknown';
  const recent = (attemptsByIp.get(key) || []).filter((t) => now - t < IP_WINDOW_MS);
  if (recent.length >= IP_MAX_ATTEMPTS) { attemptsByIp.set(key, recent); return false; }
  recent.push(now);
  attemptsByIp.set(key, recent);
  return true;
}

// --- đăng ký / đăng nhập --------------------------------------------------

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 120;

/**
 * Tạo tài khoản. `upsertMember` (auth.js) truyền vào để dùng đúng một đường tạo
 * người dùng với SSO (quyền admin, user_state…).
 */
export function register({ name, email, password, code }, upsertMember) {
  if (!localAuthEnabled()) return fail('Đăng ký bằng email đang tắt', 403);
  if (!signupOpen()) return fail('Đăng ký đang đóng. Liên hệ quản trị viên.', 403);
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
  const cleanEmail = normalizeEmail(email);
  if (cleanName.length < 2 || cleanName.length > 60) return fail('Tên cần từ 2 đến 60 ký tự');
  if (!validEmail(cleanEmail)) return fail('Email không hợp lệ');
  if (String(password || '').length < MIN_PASSWORD) return fail(`Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự`);
  if (String(password).length > 200) return fail('Mật khẩu quá dài');
  if (String(code || '').trim().toUpperCase() !== signupCode()) return fail('Mã đăng ký nội bộ không đúng');
  if (get('SELECT 1 ok FROM local_accounts WHERE email = ?', cleanEmail)) return fail('Email này đã có tài khoản — hãy đăng nhập');

  return tx(() => {
    const user = upsertMember({ sub: `local:${cleanEmail}`, name: cleanName, email: cleanEmail });
    run(
      'INSERT INTO local_accounts (user_id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      user.id, cleanEmail, hashPassword(password), nowIso(), nowIso(),
    );
    return { user };
  });
}

const GENERIC_LOGIN_ERROR = 'Email hoặc mật khẩu không đúng';

export function login({ email, password }) {
  if (!localAuthEnabled()) return fail('Đăng nhập bằng email đang tắt', 403);
  const cleanEmail = normalizeEmail(email);
  const account = get('SELECT * FROM local_accounts WHERE email = ?', cleanEmail);
  if (!account) {
    // Vẫn băm một lần để thời gian trả lời không lộ email nào có tài khoản.
    checkPassword(String(password || ''), hashPassword('placeholder-password'));
    return fail(GENERIC_LOGIN_ERROR, 401);
  }
  if (account.locked_until && account.locked_until > nowIso()) {
    return fail(`Sai mật khẩu nhiều lần. Thử lại sau ${LOCK_MINUTES} phút.`, 429);
  }
  if (!checkPassword(String(password || ''), account.password_hash)) {
    const fails = (account.failed_attempts || 0) + 1;
    const lockedUntil = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    run('UPDATE local_accounts SET failed_attempts = ?, locked_until = ? WHERE user_id = ?', lockedUntil ? 0 : fails, lockedUntil, account.user_id);
    return lockedUntil
      ? fail(`Sai mật khẩu nhiều lần. Thử lại sau ${LOCK_MINUTES} phút.`, 429)
      : fail(GENERIC_LOGIN_ERROR, 401);
  }
  run('UPDATE local_accounts SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?', account.user_id);
  const user = get('SELECT * FROM users WHERE id = ?', account.user_id);
  if (!user) return fail(GENERIC_LOGIN_ERROR, 401);
  run('UPDATE users SET last_seen_at = ? WHERE id = ?', nowIso(), user.id);
  return { user };
}

/** Đổi mật khẩu khi đã đăng nhập (cần mật khẩu hiện tại). */
export function changePassword(userId, { current, next }) {
  const account = get('SELECT * FROM local_accounts WHERE user_id = ?', userId);
  if (!account) return fail('Tài khoản này đăng nhập qua app Ekko, không có mật khẩu riêng');
  if (!checkPassword(String(current || ''), account.password_hash)) return fail('Mật khẩu hiện tại không đúng');
  if (String(next || '').length < MIN_PASSWORD) return fail(`Mật khẩu mới cần ít nhất ${MIN_PASSWORD} ký tự`);
  run('UPDATE local_accounts SET password_hash = ?, updated_at = ?, failed_attempts = 0, locked_until = NULL WHERE user_id = ?',
    hashPassword(next), nowIso(), userId);
  return { ok: true };
}

/** Admin đặt lại mật khẩu: trả về mật khẩu tạm (hiện đúng một lần cho Admin). */
export function resetPassword(userId) {
  const account = get('SELECT * FROM local_accounts WHERE user_id = ?', Number(userId));
  if (!account) return fail('Người này đăng nhập qua app Ekko, không có mật khẩu riêng');
  const password = tempPassword();
  run('UPDATE local_accounts SET password_hash = ?, updated_at = ?, failed_attempts = 0, locked_until = NULL WHERE user_id = ?',
    hashPassword(password), nowIso(), account.user_id);
  return { ok: true, password, email: account.email };
}
