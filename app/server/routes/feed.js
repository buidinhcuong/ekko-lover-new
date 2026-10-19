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
import { createDemoKit, demoKits, removeDemoKit } from '../services/demoKit.js';
import { moduleOn } from '../services/modules.js';
import { readFileSync } from 'node:fs';
import { adminFile, saveFeedFile, workerFile } from '../services/feedFiles.js';
import {
  createDraft, createHrAccount, FEED_MOODS, FEED_STATUS, ISSUE_STATUS, issueDetail, updateIssue, FEED_TOPICS, FEED_TYPES, feedPosts, feedReport, hrAccounts,
  markRepliesSeen, markFeedSeen, ratePost, dailyLimitFor, setDailyLimit, feedAssignees, minGroupFor, myPosts, removeHrAccount, replyPosts, setMinGroup, setPostStatus, submitDraft,
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
  moods: labels(FEED_MOODS),
}));
feedRouter.post('/api/feed/preview', async ({ user, body }) => ok(await createDraft(user.id, body || {})));
feedRouter.post('/api/feed/:id/submit', ({ user, params, body }) => ok(submitDraft(user.id, params.id, body || {})));
feedRouter.post('/api/feed/replies/seen', ({ user }) => markRepliesSeen(user.id));
// Sau khi có phản hồi, người gửi chỉ đánh giá Like / Dislike (không nhắn qua lại).
feedRouter.post('/api/feed/:id/rate', ({ user, params, body }) => ok(ratePost(user.id, params.id, body?.rating ?? null)));

/** Gửi tệp đính kèm: riêng tư, không cho proxy / CDN giữ lại; PDF mở ngay trong trình duyệt. */
function sendFile(res, found) {
  if (!found) throw new HttpError(404, 'Không tìm thấy tệp');
  const data = readFileSync(found.full);
  res.writeHead(200, {
    'content-type': found.row.mime,
    'content-length': data.length,
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(found.row.name)}`,
    'cache-control': 'private, max-age=300',
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
  return undefined;
}
feedRouter.get('/api/feed/files/:id', ({ user, params, res }) => sendFile(res, workerFile(user.id, params.id)));

// --- quản trị Ekko + HR doanh nghiệp ------------------------------------------------
export const feedAdminRouter = new Router();
const ekkoOnly = (ctx) => { if (!ctx.feed.ekko) throw forbidden('Chỉ quản trị Ekko mới làm được việc này'); };

feedAdminRouter.get('/api/admin/feed/meta', ({ feed, url }) => ({
  ekko: feed.ekko,
  // Super admin tắt EkkoFeed: người lao động không gửi được nữa, HR vẫn xem dữ liệu cũ.
  enabled: moduleOn('feed', feed.ekko ? url.searchParams.get('employer') : feed.employerKey),
  employerKey: feed.employerKey,
  employerName: feed.employerName,
  types: labels(FEED_TYPES),
  topics: labels(FEED_TOPICS),
  moods: labels(FEED_MOODS),
  statuses: Object.entries(FEED_STATUS).filter(([code]) => feed.ekko || code !== 'review').map(([code, label]) => ({ code, label })),
  issueStatuses: Object.entries(ISSUE_STATUS).map(([code, label]) => ({ code, label })),
}));

// Bảng điều khiển Giáo dục tài chính: Ekko chọn công ty tuỳ ý; HR luôn bị khoá vào
// công ty mình (bỏ qua ?employer), từ khoá Ekko bot theo ngưỡng ẩn danh của công ty.
feedAdminRouter.get('/api/admin/feed/overview', ({ feed, url }) => (feed.ekko
  ? programOverview(companyScope(url.searchParams.get('employer')))
  : programOverview(companyScope(feed.employerKey), { minKeywordUsers: minGroupFor(feed.employerKey) })));

feedAdminRouter.get('/api/admin/feed/report', ({ feed, url, user }) => feedReport(feed, {
  employer: url.searchParams.get('employer'),
  days: url.searchParams.get('days') || 30,
  from: url.searchParams.get('from'),
  to: url.searchParams.get('to'),
  viewerId: user.id,
}));
// Chấm "chưa đọc" (như email) — riêng từng người quản trị.
feedAdminRouter.post('/api/admin/feed/seen', ({ feed, user, body }) => markFeedSeen(feed, user.id, body?.keys));
// Danh sách người có thể giao phụ trách vấn đề.
feedAdminRouter.get('/api/admin/feed/assignees', ({ feed }) => feedAssignees(feed));

feedAdminRouter.get('/api/admin/feed/posts', ({ feed, url, user }) => feedPosts(feed, {
  employer: url.searchParams.get('employer'),
  status: url.searchParams.get('status') || '',
  topic: url.searchParams.get('topic') || '',
  type: url.searchParams.get('type') || '',
  days: url.searchParams.get('days') || null,
  from: url.searchParams.get('from'),
  to: url.searchParams.get('to'),
  limit: url.searchParams.get('limit') || 200,
}, user.id));

feedAdminRouter.post('/api/admin/feed/reply', ({ feed, user, body }) => ok(replyPosts(feed, user, body?.postIds, body?.text, body?.issueKey || null, body?.fileIds || [])));
// Tệp đính kèm phản hồi (PDF / JPG / PNG, tối đa 5 MB): tải lên trước, gửi kèm id.
feedAdminRouter.post('/api/admin/feed/files', async ({ feed, user, body }) => ok(await saveFeedFile(user.id, feed.ekko ? (body?.employer || null) : feed.employerKey, body || {})));
feedAdminRouter.get('/api/admin/feed/files/:id', ({ feed, params, res }) => sendFile(res, adminFile(feed, params.id)));

// Quản lý từng vấn đề cần giải quyết (khoá = '<công ty>|<chủ đề>|<từ khoá>').
feedAdminRouter.get('/api/admin/feed/issue', ({ feed, url }) => ok(issueDetail(feed, url.searchParams.get('key'))));
feedAdminRouter.patch('/api/admin/feed/issue', ({ feed, user, body }) => ok(updateIssue(feed, user, body?.key, body || {})));
feedAdminRouter.patch('/api/admin/feed/posts/:id', ({ feed, user, params, body }) => ok(setPostStatus(feed, user, params.id, body?.status)));

// Ekko: tài khoản HR doanh nghiệp + ngưỡng ẩn danh.
feedAdminRouter.get('/api/admin/feed/hr-accounts', (ctx) => { ekkoOnly(ctx); return hrAccounts(); });
feedAdminRouter.post('/api/admin/feed/hr-accounts', (ctx) => {
  ekkoOnly(ctx);
  return ok(createHrAccount(ctx.user.id, ctx.body || {}, upsertMember));
});
feedAdminRouter.delete('/api/admin/feed/hr-accounts/:id', (ctx) => { ekkoOnly(ctx); return ok(removeHrAccount(ctx.user.id, ctx.params.id)); });
// Ekko: bộ tài khoản demo cho khách hàng (công ty mẫu + người lao động + HR + dữ liệu mẫu).
feedAdminRouter.get('/api/admin/feed/demo-kits', (ctx) => { ekkoOnly(ctx); return demoKits(); });
feedAdminRouter.post('/api/admin/feed/demo-kits', (ctx) => { ekkoOnly(ctx); return ok(createDemoKit(ctx.user.id, ctx.body || {}, upsertMember)); });
feedAdminRouter.delete('/api/admin/feed/demo-kits/:slug', (ctx) => { ekkoOnly(ctx); return ok(removeDemoKit(ctx.params.slug)); });
feedAdminRouter.get('/api/admin/feed/settings', (ctx) => {
  ekkoOnly(ctx);
  const employer = ctx.url.searchParams.get('employer') || null;
  return { employer, minGroup: minGroupFor(employer), dailyLimit: dailyLimitFor(employer) };
});
feedAdminRouter.put('/api/admin/feed/settings', (ctx) => {
  ekkoOnly(ctx);
  const employer = ctx.body?.employer || null;
  if (ctx.body?.minGroup !== undefined) ok(setMinGroup(employer, ctx.body.minGroup));
  if (ctx.body?.dailyLimit !== undefined) ok(setDailyLimit(employer, ctx.body.dailyLimit));
  return { ok: true, minGroup: minGroupFor(employer), dailyLimit: dailyLimitFor(employer) };
});
