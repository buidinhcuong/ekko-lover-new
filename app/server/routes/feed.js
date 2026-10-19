/**
 * EkkoFeed (services/ekkoFeed.js).
 *
 * feedRouter       — người lao động: xem trước / gửi góp ý, xem góp ý của mình.
 * feedAdminRouter  — quản trị Ekko (mọi công ty) và HR doanh nghiệp (chỉ công ty
 *                    mình): báo cáo, danh sách góp ý, trả lời, trạng thái. Quyền
 *                    `ctx.feed` do app.js gắn (auth 'feedAdmin').
 */
import { upsertMember } from '../auth.js';
import { forbidden, HttpError, Router } from '../lib/http.js';
import { companyScope } from '../services/companyScope.js';
import { programOverview } from '../services/overview.js';
import {
  createDraft, createHrAccount, FEED_STATUS, FEED_TOPICS, FEED_TYPES, feedPosts, feedReport, hrAccounts,
  markRepliesSeen, minGroupFor, myPosts, removeHrAccount, replyPosts, setMinGroup, setPostStatus, submitDraft,
} from '../services/ekkoFeed.js';

const ok = (result) => {
  if (result?.error) throw new HttpError(result.status || 400, result.error);
  return result;
};
const labels = (map) => Object.entries(map).map(([code, v]) => ({ code, label: v.label || v }));

// --- người lao động ---------------------------------------------------------------
export const feedRouter = new Router();

feedRouter.get('/api/feed', ({ user }) => ({
  ...myPosts(user.id),
  types: labels(FEED_TYPES),
  topics: labels(FEED_TOPICS),
}));
feedRouter.post('/api/feed/preview', async ({ user, body }) => ok(await createDraft(user.id, body || {})));
feedRouter.post('/api/feed/:id/submit', ({ user, params, body }) => ok(submitDraft(user.id, params.id, body || {})));
feedRouter.post('/api/feed/replies/seen', ({ user }) => markRepliesSeen(user.id));

// --- quản trị Ekko + HR doanh nghiệp ------------------------------------------------
export const feedAdminRouter = new Router();
const ekkoOnly = (ctx) => { if (!ctx.feed.ekko) throw forbidden('Chỉ quản trị Ekko mới làm được việc này'); };

feedAdminRouter.get('/api/admin/feed/meta', ({ feed }) => ({
  ekko: feed.ekko,
  employerKey: feed.employerKey,
  employerName: feed.employerName,
  types: labels(FEED_TYPES),
  topics: labels(FEED_TOPICS),
  statuses: Object.entries(FEED_STATUS).filter(([code]) => feed.ekko || code !== 'review').map(([code, label]) => ({ code, label })),
}));

// Bảng điều khiển Giáo dục tài chính: Ekko chọn công ty tuỳ ý; HR luôn bị khoá vào
// công ty mình (bỏ qua ?employer), từ khoá Ekko bot theo ngưỡng ẩn danh của công ty.
feedAdminRouter.get('/api/admin/feed/overview', ({ feed, url }) => (feed.ekko
  ? programOverview(companyScope(url.searchParams.get('employer')))
  : programOverview(companyScope(feed.employerKey), { minKeywordUsers: minGroupFor(feed.employerKey) })));

feedAdminRouter.get('/api/admin/feed/report', ({ feed, url }) => feedReport(feed, {
  employer: url.searchParams.get('employer'),
  days: url.searchParams.get('days') || 30,
}));

feedAdminRouter.get('/api/admin/feed/posts', ({ feed, url, user }) => feedPosts(feed, {
  employer: url.searchParams.get('employer'),
  status: url.searchParams.get('status') || '',
  topic: url.searchParams.get('topic') || '',
  limit: url.searchParams.get('limit') || 100,
}, user.id));

feedAdminRouter.post('/api/admin/feed/reply', ({ feed, user, body }) => ok(replyPosts(feed, user, body?.postIds, body?.text)));
feedAdminRouter.patch('/api/admin/feed/posts/:id', ({ feed, user, params, body }) => ok(setPostStatus(feed, user, params.id, body?.status)));

// Ekko: tài khoản HR doanh nghiệp + ngưỡng ẩn danh.
feedAdminRouter.get('/api/admin/feed/hr-accounts', (ctx) => { ekkoOnly(ctx); return hrAccounts(); });
feedAdminRouter.post('/api/admin/feed/hr-accounts', (ctx) => {
  ekkoOnly(ctx);
  return ok(createHrAccount(ctx.user.id, ctx.body || {}, upsertMember));
});
feedAdminRouter.delete('/api/admin/feed/hr-accounts/:id', (ctx) => { ekkoOnly(ctx); return ok(removeHrAccount(ctx.user.id, ctx.params.id)); });
feedAdminRouter.get('/api/admin/feed/settings', (ctx) => {
  ekkoOnly(ctx);
  const employer = ctx.url.searchParams.get('employer') || null;
  return { employer, minGroup: minGroupFor(employer) };
});
feedAdminRouter.put('/api/admin/feed/settings', (ctx) => {
  ekkoOnly(ctx);
  return ok(setMinGroup(ctx.body?.employer || null, ctx.body?.minGroup));
});
