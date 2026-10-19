import { randomBytes } from 'node:crypto';
import './env.js';
import { getSetting, setSetting } from './db.js';

// Tệp `.env` được nạp ở ./env.js — import đầu tiên của db.js, để cả thư mục dữ
// liệu (EKKO_DATA_DIR) cũng đọc được từ tệp.

/**
 * Secrets are read from the environment in production. For local development we
 * generate one once and persist it, so restarting the server does not log
 * everybody out.
 */
function persistentSecret(key, envValue) {
  if (envValue) return envValue;
  let stored = getSetting(key);
  if (!stored) {
    stored = randomBytes(32).toString('hex');
    setSetting(key, stored);
  }
  return stored;
}

export const config = {
  port: Number(process.env.PORT || 4321),
  host: process.env.HOST || '127.0.0.1',

  /** Shared with the Ekko app: it signs the SSO handoff token with this. */
  ssoSecret: persistentSecret('sso_secret', process.env.EKKO_SSO_SECRET),
  /** Only this service knows this one: it signs the session cookie. */
  sessionSecret: persistentSecret('session_secret', process.env.EKKO_SESSION_SECRET),

  sessionCookie: 'ekko_gdtc_session',
  // Admin portal (quản trị Ekko, HR doanh nghiệp) giữ phiên riêng: mở app người
  // lao động và Admin trên cùng một trình duyệt không đăng xuất lẫn nhau.
  adminSessionCookie: 'ekko_gdtc_admin',
  sessionTtl: 60 * 60 * 24 * 30,

  /** Where to bounce users who arrive without a valid SSO token. */
  appReturnUrl: process.env.EKKO_APP_URL || 'https://ekko.vn',

  /** Emails or ekko user ids that get the admin role on first login. */
  adminSubjects: (process.env.EKKO_ADMIN_SUBJECTS || 'admin@ekko.vn,cuongbd@ekko.vn')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  /**
   * Đăng ký / đăng nhập bằng email + mật khẩu để thử nghiệm nội bộ
   * (services/localAuth.js). Triển khai thật qua SSO thì đặt EKKO_LOCAL_AUTH=0.
   */
  localAuth: process.env.EKKO_LOCAL_AUTH !== '0',

  /**
   * Dev-only conveniences: the mock SSO launcher and the simulated-date header
   * used to demo streak freezing. Never enable in production.
   */
  devMode: process.env.NODE_ENV !== 'production' || (Boolean(process.env.VERCEL) && process.env.EKKO_DEMO !== '0'),

  /**
   * Chạy trên hạ tầng không có ổ đĩa bền (Vercel): database nằm ở /tmp, mỗi lần
   * khởi động là một bản mới. Phiên đăng nhập vì thế tự dựng lại người dùng từ
   * cookie, và tải ảnh trong Admin bị tắt (không có chỗ lưu lâu dài).
   */
  ephemeral: Boolean(process.env.VERCEL),

  /** Optional: set ANTHROPIC_API_KEY to let Ekko bot fall back to Claude. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
  /** Địa chỉ Messages API — đổi được để đi qua proxy công ty hoặc để kiểm thử với server giả. */
  anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, ''),
};
