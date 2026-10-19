/**
 * SSO entry point and "who am I" endpoints.
 *
 * Integration contract for the Ekko app:
 *   1. Mint a JWT (HS256) with the shared secret EKKO_SSO_SECRET:
 *        { sub, name, email?, avatar?, employer?, employer_id?, role?, exp }   exp <= 5 minutes
 *      employer = tên công ty, employer_id = mã công ty ổn định (số liệu Admin nhóm theo mã).
 *   2. Open a webview at  https://<gdtc-host>/sso?token=<jwt>&redirect=/app/
 *   3. This service verifies it, upserts the member and sets its own session
 *      cookie, then 302s to `redirect`.
 */
import { acceptSsoToken, clearSession, currentUser, issueSession, legacyAdminUser, mintDevSsoToken, portalOf, upsertMember } from '../auth.js';
import { config } from '../config.js';
import { all, run } from '../db.js';
import { bad, HttpError, Router, sendJson } from '../lib/http.js';
import { clearCookie } from '../lib/http.js';
import { seedDemoData } from '../seed/index.js';
import { claimBadge, dailyCheckin, evaluateBadges } from '../services/progression.js';
import { challengeBoard, claimChallenge, claimChallengeBonus } from '../services/challenges.js';
import { readState } from '../services/streak.js';
import { buildWorld } from '../services/world.js';
import { feedAccess, seedFeedDemo } from '../services/ekkoFeed.js';
import { activeConcept, conceptByCode, setActiveConcept } from '../services/concepts.js';
import { buildPersona, dropPersona, personaClaims, personaOf, PERSONAS } from '../services/personas.js';
import { nowIso } from '../lib/time.js';
import { markOpened } from '../services/teams.js';
import { allowAttempt, changePassword, login, publicAuthConfig, register } from '../services/localAuth.js';

export const sessionRouter = new Router();

/** Only same-origin paths are accepted, so the token cannot bounce a user off-site. */
function safeRedirect(value) {
  const target = String(value || '/app/');
  return /^\/(?!\/)/.test(target) ? target : '/app/';
}

sessionRouter.get('/sso', ({ url, res }) => {
  const token = url.searchParams.get('token');
  if (!token) throw bad('Thiếu tham số token');

  const user = acceptSsoToken(token);
  const redirect = safeRedirect(url.searchParams.get('redirect'));
  issueSession(res, user, redirect.startsWith('/admin') ? 'admin' : 'app');
  if (config.devMode && seedDemoData(user.id)) {
    // Settle badges the sample data already satisfies, so the member's first
    // real action does not fire a celebration they did not earn.
    evaluateBadges(user.id, { autoClaim: true });
  }

  res.writeHead(302, { location: redirect });
  res.end();
  return undefined; // response already written
});

// --- đăng ký / đăng nhập bằng email (thử nghiệm nội bộ, services/localAuth.js) ---
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
const authResult = (req, res, result) => {
  if (result.error) throw new HttpError(result.status || 400, result.error);
  issueSession(res, result.user, portalOf(req));
  return { ok: true, name: result.user.name, role: result.user.role };
};

sessionRouter.get('/api/auth/config', () => publicAuthConfig());

sessionRouter.post('/api/auth/register', ({ req, res, body }) => {
  if (!allowAttempt(clientIp(req))) throw new HttpError(429, 'Thử quá nhiều lần, đợi vài phút rồi thử lại');
  return authResult(req, res, register(body || {}, upsertMember));
});

sessionRouter.post('/api/auth/login', ({ req, res, body }) => {
  if (!allowAttempt(clientIp(req))) throw new HttpError(429, 'Thử quá nhiều lần, đợi vài phút rồi thử lại');
  return authResult(req, res, login(body || {}));
});

sessionRouter.post('/api/me/password', ({ user, body }) => {
  const result = changePassword(user.id, body || {});
  if (result.error) throw bad(result.error);
  return result;
});

sessionRouter.post('/api/session/logout', ({ req, res }) => {
  // Đăng xuất bên nào chỉ bên đó. Admin: xoá cả phiên Admin đời cũ ở cookie chung
  // (nếu cookie chung đang là của quản trị / HR) — không đụng phiên người lao động.
  const portal = portalOf(req);
  clearSession(res, portal);
  if (portal === 'admin' && legacyAdminUser(req)) clearCookie(res, config.sessionCookie);
  return { ok: true, returnUrl: config.appReturnUrl };
});

sessionRouter.get('/api/me', ({ user }) => (markOpened(user.id), {
  user: {
    id: user.id, name: user.name, email: user.email, avatar: user.avatar_url,
    employer: user.employer, role: user.role,
    // Người dùng mẫu của bản demo (new | veteran) — để nút chuyển biết đang ở ai.
    persona: config.devMode ? personaOf(user.ekko_user_id) : null,
    localAccount: String(user.ekko_user_id || '').startsWith('local:'),
  },
  world: buildWorld(user.id),
}));

sessionRouter.get('/api/me/world', ({ user }) => {
  markOpened(user.id); // Heo Dream Team: "hôm nay đã vào app"
  return buildWorld(user.id);
});

/** Đánh dấu đã xem 3 màn giới thiệu Ekko Lover (bấm Bắt đầu hoặc đóng giữa chừng). */
sessionRouter.post('/api/me/onboarding', ({ user, body }) => {
  if (body?.key !== 'lover') throw bad('Không có màn giới thiệu này');
  readState(user.id); // tạo dòng user_state nếu người dùng mới tinh
  run('UPDATE user_state SET lover_intro_at = COALESCE(lover_intro_at, ?) WHERE user_id = ?', nowIso(), user.id);
  return { ok: true };
});

sessionRouter.get('/api/me/badges', ({ user }) => buildWorld(user.id).badges);

/** Ekko Lover: nhận XP của một huy hiệu đã đạt (bấm "Nhận thưởng ngay"). */
sessionRouter.post('/api/me/badges/:code/claim', ({ user, params }) => {
  const result = claimBadge(user.id, params.code);
  if (!result) throw bad('Bạn chưa đạt huy hiệu này');
  return result;
});

/** Check-in hằng ngày: app gọi khi người dùng vào màn chính (Ekko Lover). */
sessionRouter.post('/api/me/checkin', ({ user }) => dailyCheckin(user.id));

// --- thử thách ngày / tuần / chặng khởi đầu (services/challenges.js) ------
sessionRouter.get('/api/me/challenges', ({ user }) => challengeBoard(user.id));

sessionRouter.post('/api/me/challenges/bonus/:period', ({ user, params }) => {
  const result = claimChallengeBonus(user.id, params.period);
  if (!result) throw bad('Không có phần thưởng này');
  if (result.error) throw bad(result.error);
  return { ...result, board: challengeBoard(user.id) };
});

sessionRouter.post('/api/me/challenges/:id/claim', ({ user, params }) => {
  const result = claimChallenge(user.id, params.id);
  if (!result) throw bad('Thử thách này không có trong kỳ hiện tại');
  if (result.error) throw bad(result.error);
  return { ...result, board: challengeBoard(user.id) };
});

sessionRouter.get('/api/me/activity', ({ user, url }) => {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
  return all(
    'SELECT id, kind, ref, day, xp, meta, created_at FROM activity_log WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    user.id, limit,
  ).map((r) => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
});

// --- development-only mock identity provider -----------------------------
// Lets you open the feature without running the real Ekko app.
sessionRouter.get('/dev/login', ({ url, res }) => {
  if (!config.devMode) throw bad('Chỉ dùng được ở môi trường phát triển');

  const asAdmin = url.searchParams.get('role') === 'admin';
  const token = mintDevSsoToken({
    sub: url.searchParams.get('sub') || (asAdmin ? 'admin@ekko.vn' : 'demo-nv-001'),
    name: url.searchParams.get('name') || (asAdmin ? 'Quản trị viên Ekko' : 'Trần Bảo Ngọc'),
    email: url.searchParams.get('email') || (asAdmin ? 'admin@ekko.vn' : 'ngoc.tran@congty.vn'),
    // Thử luồng SSO có công ty: ?employer=Tên&employer_id=MÃ (mặc định công ty mẫu, không mã).
    employer: url.searchParams.get('employer') || 'Công ty TNHH Minh Phát',
    employer_id: url.searchParams.get('employer_id') || undefined,
    role: asAdmin ? 'admin' : 'member',
  });

  const redirect = safeRedirect(url.searchParams.get('redirect') || (asAdmin ? '/admin/' : '/app/'));
  res.writeHead(302, { location: `/sso?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}` });
  res.end();
  return undefined;
});

/**
 * Đăng nhập thẳng vào một người dùng mẫu, dựng lại từ đầu mỗi lần bấm:
 * `?as=new` — vừa vào chức năng, cấp 1, chưa có gì (sẽ thấy onboarding);
 * `?as=veteran` — đã dùng lâu, học hết bài, cấp cao nhất, đủ dữ liệu.
 */
/**
 * Bấm thử EkkoFeed (chỉ dev): đăng nhập thẳng vào một tài khoản HR doanh nghiệp
 * của công ty mẫu (không cần mật khẩu) và nạp sẵn ~30 góp ý mẫu để báo cáo có số
 * liệu. ?employer= đổi công ty (mặc định công ty của người dùng mẫu).
 */
sessionRouter.get('/dev/hr', ({ url, res }) => {
  if (!config.devMode) throw bad('Chỉ dùng được ở môi trường phát triển');
  const employer = url.searchParams.get('employer') || 'Công ty TNHH Minh Phát';
  seedFeedDemo(employer);
  const hr = upsertMember({ sub: 'dev-hr-demo', name: `HR ${employer}`, email: 'hr.demo@ekko.local' });
  run(
    `INSERT INTO employer_admins (user_id, employer_key, employer_name, created_at) VALUES (?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET employer_key = excluded.employer_key, employer_name = excluded.employer_name`,
    hr.id, employer, employer, nowIso(),
  );
  issueSession(res, hr, 'admin');
  res.writeHead(302, { location: '/admin/#/' });
  res.end();
  return undefined;
});

sessionRouter.get('/dev/persona', ({ url, res }) => {
  if (!config.devMode) throw bad('Chỉ dùng được ở môi trường phát triển');
  const key = url.searchParams.get('as');
  if (!Object.hasOwn(PERSONAS, key || '')) throw bad('Không có người dùng mẫu này');

  dropPersona(key);
  const user = acceptSsoToken(mintDevSsoToken(personaClaims(key)));
  buildPersona(key, user.id);
  issueSession(res, user);

  // Từ trang preview thì quay lại trang preview; mặc định mở thẳng màn chủ app.
  const redirect = url.searchParams.get('redirect');
  res.writeHead(302, { location: redirect ? safeRedirect(redirect) : '/app/#/' });
  res.end();
  return undefined;
});

/**
 * Đổi concept cho cả bản demo bằng một cú bấm (nút ngoài khung điện thoại và
 * trên trang preview). Ngoài bản demo, chỉ quản trị viên đổi được ở Admin portal.
 */
sessionRouter.get('/dev/concept', ({ url, res }) => {
  if (!config.devMode) throw bad('Chỉ dùng được ở môi trường phát triển');
  const code = url.searchParams.get('code') || '';
  if (!conceptByCode(code)) throw bad('Không có concept này');
  setActiveConcept(code);
  res.writeHead(302, { location: safeRedirect(url.searchParams.get('redirect') || '/app/') });
  res.end();
  return undefined;
});

/** Handy for wiring up the real app: shows the exact token shape expected. */
sessionRouter.get('/dev/sso-token', ({ url }) => {
  if (!config.devMode) throw bad('Chỉ dùng được ở môi trường phát triển');
  const sub = url.searchParams.get('sub') || 'demo-nv-001';
  return {
    token: mintDevSsoToken({ sub, name: url.searchParams.get('name') || 'Nhân viên Ekko', email: url.searchParams.get('email') || null }),
    usage: `/sso?token=<token>&redirect=/app/`,
    claims: { sub: 'ma-nhan-vien', name: 'Ho ten', email: 'tuy chon', avatar: 'tuy chon', employer: 'ten cong ty (tuy chon)', employer_id: 'ma cong ty on dinh (nen co)', role: 'member | admin', exp: 'unix seconds' },
  };
});

export function whoami(req, res) {
  const user = currentUser(req);
  sendJson(res, 200, user
    ? {
      authenticated: true, role: user.role, name: user.name,
      // Tài khoản email nội bộ (có mật khẩu riêng) — để hiện nút Đổi mật khẩu.
      localAccount: String(user.ekko_user_id || '').startsWith('local:'),
      persona: config.devMode ? personaOf(user.ekko_user_id) : null,
      concept: activeConcept(),
      // EkkoFeed: HR doanh nghiệp vào được Admin portal nhưng chỉ trang EkkoFeed của công ty mình.
      feed: feedAccess(user),
    }
    : { authenticated: false });
}

/** @param {object} [scope] companyScope(...) — chỉ người học của một công ty. */
export function adminUserSummary(scope = { where: () => '1 = 1', params: [] }) {
  return all(
    `SELECT u.id, u.name, u.email, u.employer, u.employer_id, u.role, u.created_at, u.last_seen_at,
            s.xp, s.streak_count, s.streak_best, s.last_active_day,
            (SELECT name FROM levels WHERE id = s.level_id) AS level_name,
            (SELECT COUNT(*) FROM lesson_progress p WHERE p.user_id = u.id AND p.status = 'completed') AS lessons_done,
            (SELECT COUNT(*) FROM user_badges ub WHERE ub.user_id = u.id) AS badges,
            EXISTS (SELECT 1 FROM local_accounts la WHERE la.user_id = u.id) AS has_password
       FROM users u LEFT JOIN user_state s ON s.user_id = u.id
      WHERE ${scope.where('u.id')}
      ORDER BY s.xp DESC, u.id`,
    ...scope.params,
  );
}
