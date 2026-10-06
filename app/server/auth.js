/**
 * Single sign-on with the Ekko app.
 *
 * The Ekko app mints a short-lived HS256 token signed with the shared
 * `EKKO_SSO_SECRET` and opens this feature at
 *   /sso?token=<jwt>&redirect=/app/
 * We verify it, upsert the member, and issue our own long-lived session cookie
 * so subsequent API calls need no round-trip back to the app.
 *
 * Expected SSO claims:
 *   { sub, name, email?, avatar?, employer?, role?, iat, exp }
 */
import { config } from './config.js';
import { get, run } from './db.js';
import { issue, verify } from './lib/token.js';
import { forbidden, parseCookies, setCookie, unauthorized } from './lib/http.js';
import { nowIso } from './lib/time.js';
import { seedDemoData } from './seed/index.js';
import { evaluateBadges } from './services/progression.js';
import { buildPersona, personaOf } from './services/personas.js';

export function acceptSsoToken(token) {
  let claims;
  try {
    claims = verify(token, config.ssoSecret);
  } catch (err) {
    throw unauthorized(`Token SSO khong hop le: ${err.message}`);
  }
  if (!claims.sub) throw unauthorized('Token SSO thieu truong "sub"');
  return upsertMember(claims);
}

/** The Ekko app is the source of truth for identity; we mirror it locally. */
export function upsertMember(claims) {
  const subject = String(claims.sub);
  const email = claims.email ? String(claims.email).toLowerCase() : null;
  const isAdmin =
    claims.role === 'admin' ||
    config.adminSubjects.includes(subject.toLowerCase()) ||
    (email && config.adminSubjects.includes(email));

  const existing = get('SELECT * FROM users WHERE ekko_user_id = ?', subject);
  if (existing) {
    run(
      `UPDATE users
          SET name = ?, email = ?, avatar_url = ?, employer = ?,
              role = CASE WHEN ? = 1 THEN 'admin' ELSE role END,
              last_seen_at = ?
        WHERE id = ?`,
      claims.name || existing.name,
      email ?? existing.email,
      claims.avatar ?? existing.avatar_url,
      claims.employer ?? existing.employer,
      isAdmin ? 1 : 0,
      nowIso(),
      existing.id,
    );
    return get('SELECT * FROM users WHERE id = ?', existing.id);
  }

  const now = nowIso();
  const info = run(
    `INSERT INTO users (ekko_user_id, name, email, avatar_url, employer, role, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    subject,
    claims.name || 'Thanh vien Ekko',
    email,
    claims.avatar || null,
    claims.employer || null,
    isAdmin ? 'admin' : 'member',
    now,
    now,
  );
  const userId = Number(info.lastInsertRowid);
  run(
    'INSERT INTO user_state (user_id, level_id, updated_at) VALUES (?, (SELECT id FROM levels ORDER BY order_index LIMIT 1), ?)',
    userId,
    now,
  );
  return get('SELECT * FROM users WHERE id = ?', userId);
}

export function issueSession(res, user) {
  // Ngoài id nội bộ, cookie mang luôn danh tính Ekko (uid, tên, email...) để
  // nhận ra người dùng theo mã Ekko — ổn định kể cả khi database được dựng lại
  // (bản demo trên Vercel), nơi id nội bộ có thể đã thuộc về người khác.
  const token = issue({
    sub: user.id,
    uid: user.ekko_user_id,
    name: user.name,
    email: user.email,
    employer: user.employer,
    role: user.role,
  }, config.sessionSecret, config.sessionTtl);
  setCookie(res, config.sessionCookie, token, { maxAge: config.sessionTtl });
  return token;
}

/** Resolves the current user from the session cookie, or null. */
export function currentUser(req) {
  const raw = parseCookies(req)[config.sessionCookie];
  if (!raw) return null;
  let claims;
  try {
    claims = verify(raw, config.sessionSecret);
  } catch {
    return null;
  }
  if (!claims.uid) return get('SELECT * FROM users WHERE id = ?', claims.sub) || null;

  const user = get('SELECT * FROM users WHERE ekko_user_id = ?', String(claims.uid));
  if (user || !config.ephemeral) return user || null;
  // Database vừa được dựng lại (Vercel khởi động hàm mới): tạo lại người dùng
  // từ cookie và, ở bản demo, nạp lại dữ liệu mẫu như lần đăng nhập đầu.
  const restored = upsertMember({ ...claims, sub: claims.uid });
  const persona = personaOf(restored.ekko_user_id);
  if (persona) {
    // Người dùng mẫu dựng lại đúng trạng thái của nó, không nhận dữ liệu mẫu chung.
    buildPersona(persona, restored.id);
    return get('SELECT * FROM users WHERE id = ?', restored.id);
  }
  if (config.devMode && seedDemoData(restored.id)) evaluateBadges(restored.id, { autoClaim: true });
  // Đã có phiên tức là đã từng vào app: đừng mở lại onboarding chỉ vì DB mới.
  run('UPDATE user_state SET lover_intro_at = COALESCE(lover_intro_at, ?) WHERE user_id = ?', nowIso(), restored.id);
  return restored;
}

export function requireUser(ctx) {
  if (!ctx.user) throw unauthorized('Vui lòng đăng nhập để tiếp tục');
  return ctx.user;
}

export function requireAdmin(ctx) {
  const user = requireUser(ctx);
  if (user.role !== 'admin') throw forbidden('Chi quan tri vien moi truy cap duoc Admin portal');
  return user;
}

/** Mints a handoff token the way the Ekko app would. Dev launcher only. */
export function mintDevSsoToken(payload) {
  return issue(payload, config.ssoSecret, 300);
}
