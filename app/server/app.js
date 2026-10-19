/**
 * Ekko - Giáo dục tài chính
 * Xử lý một request: file tĩnh, định tuyến API, cổng đăng nhập, định dạng lỗi.
 * Dùng chung cho server chạy ở máy (`server/index.js`) và hàm trên Vercel
 * (`api/index.js`).
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { currentUser, requireAdmin, requireUser, upsertMember } from './auth.js';
import { ensureBootstrapAdmin } from './services/localAuth.js';
import { reevaluateBadgesOnce } from './services/progression.js';
import { forbidden, HttpError, readJson, sendJson, serveStatic } from './lib/http.js';
import { langOf, translate } from './i18n/index.js';
import { seed, listSeedTables } from './seed/index.js';
import { adminRouter } from './routes/admin.js';
import { botRouter } from './routes/bot.js';
import { featureRouter } from './routes/features.js';
import { learnRouter } from './routes/learn.js';
import { sessionRouter, whoami } from './routes/session.js';
import { teamRouter } from './routes/team.js';
import { feedAdminRouter, feedRouter } from './routes/feed.js';
import { feedAccess } from './services/ekkoFeed.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Phiên bản code server đang chạy — hiện ở /healthz để biết deploy xong đã khởi
// động lại server chưa (chỉ `git pull` mà không restart thì file giao diện mới
// nhưng server vẫn chạy code cũ). Docker không có .git thì đặt EKKO_VERSION.
// Đang ở đúng một mốc phát hành thì ra tên mốc (vd v2026.10.15); sau mốc vài
// commit thì ra dạng v2026.10.15-3-gabc1234; chưa có mốc nào thì ra mã commit.
const VERSION = (() => {
  if (process.env.EKKO_VERSION) return process.env.EKKO_VERSION;
  try {
    return execFileSync('git', ['describe', '--tags', '--always'], {
      cwd: dirname(fileURLToPath(import.meta.url)), stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).toString().trim();
  } catch { return 'unknown'; }
})();
const STARTED_AT = new Date().toISOString();

seed();
// Tài khoản quản trị mặc định (EKKO_ADMIN_EMAIL + EKKO_ADMIN_PASSWORD), nếu có đặt.
ensureBootstrapAdmin(upsertMember);
// Luật huy hiệu vừa đổi: chấm lại một lần cho mọi người (progression.js).
reevaluateBadgesOnce();

/**
 * Routers are tried in order. `auth` says what the whole router requires:
 *   'none'   public
 *   'user'   any signed-in member
 *   'admin'  admin role only
 */
const ROUTERS = [
  { router: sessionRouter, auth: 'mixed' },
  { router: learnRouter, auth: 'user' },
  { router: featureRouter, auth: 'user' },
  { router: botRouter, auth: 'user' },
  { router: teamRouter, auth: 'user' },
  { router: feedRouter, auth: 'user' },
  // Trước adminRouter: /api/admin/:entity/:id của adminRouter sẽ nuốt /api/admin/feed/… nếu đứng trước.
  { router: feedAdminRouter, auth: 'feedAdmin' },
  { router: adminRouter, auth: 'admin' },
];

/** Session router mixes public (SSO, dev login) and private (`/api/me`) paths. */
const PUBLIC_PATHS = new Set(['/sso', '/dev/login', '/dev/persona', '/dev/hr', '/dev/sso-token', '/api/session/logout', '/healthz',
  '/api/auth/config', '/api/auth/register', '/api/auth/login']);

export async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/healthz') {
      return sendJson(res, 200, { ok: true, version: VERSION, startedAt: STARTED_AT, content: listSeedTables() });
    }
    if (pathname === '/api/session/whoami') {
      return whoami(req, res);
    }

    for (const { router, auth } of ROUTERS) {
      const match = router.match(req.method, pathname);
      if (!match) continue;

      const user = currentUser(req);
      const ctx = { req, res, url, params: match.params, user, body: {} };

      if (auth === 'admin') requireAdmin(ctx);
      else if (auth === 'feedAdmin') {
        // EkkoFeed: quản trị Ekko (mọi công ty) hoặc HR doanh nghiệp (chỉ công ty mình).
        requireUser(ctx);
        ctx.feed = feedAccess(ctx.user);
        if (!ctx.feed) throw forbidden('Chỉ quản trị viên hoặc HR doanh nghiệp mới xem được EkkoFeed');
      }
      else if (auth === 'user') requireUser(ctx);
      else if (auth === 'mixed' && !PUBLIC_PATHS.has(pathname)) requireUser(ctx);

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        ctx.body = await readJson(req);
      }

      const result = await match.handler(ctx);
      if (res.writableEnded) return undefined; // handler wrote its own response (redirects)
      // Một chỗ duy nhất dịch nội dung: app người dùng gửi `x-lang`, Admin thì
      // không, nên Admin luôn thấy bản gốc tiếng Việt đang được biên tập.
      const lang = auth === 'admin' ? 'vi' : langOf(req);
      return sendJson(res, 200, translate(result ?? { ok: true }, lang));
    }

    // Static assets and the two SPA shells.
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (await serveStatic(PUBLIC_DIR, pathname, req, res)) return undefined;
      if (pathname === '/') {
        res.writeHead(302, { location: '/app/' });
        return res.end();
      }
      // Hash-based routing means deep links still resolve to the shell.
      const shell = pathname.startsWith('/admin') ? '/admin/index.html' : '/app/index.html';
      if (!pathname.startsWith('/assets') && await serveStatic(PUBLIC_DIR, shell, req, res)) return undefined;
    }

    return sendJson(res, 404, { error: 'Không tìm thấy đường dẫn này' });
  } catch (err) {
    if (err instanceof HttpError) {
      return sendJson(res, err.status,
        translate({ error: err.message, details: err.details ?? null }, langOf(req)));
    }
    console.error(`[${req.method} ${pathname}]`, err);
    return sendJson(res, 500, { error: 'Có lỗi xảy ra ở máy chủ' });
  }
}
