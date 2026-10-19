/**
 * "Server" giả của bản xem thử EkkoFeed — chạy ngay trong trình duyệt, giữ dữ liệu
 * trong bộ nhớ (tải lại trang là về ban đầu). Hai khung (app người lao động và
 * Admin HR) gọi chung một kho này, nên gửi bên này là thấy ngay bên kia.
 *
 * build.mjs ghép vào đầu tệp các hàm thật của server (FEED_TOPICS, redact,
 * normalize, blendMood…) và dữ liệu chụp từ server dev (SNAPSHOT), rồi nhúng cả
 * khối vào trang HTML. Phần dưới đây chỉ là phần trả lời các API EkkoFeed.
 */
/* global SNAPSHOT, FEED_TOPICS, FEED_MOODS, redact, normalize, blendMood, WORKER */

const clone = (x) => JSON.parse(JSON.stringify(x));
const nowIso = () => new Date().toISOString();
const ok = (body) => ({ status: 200, body });
const fail = (status, error) => ({ status, body: { error } });

const TYPES = { share: 'Chia sẻ', issue: 'Góp ý / Cần giải quyết' };
const labels = (map) => Object.entries(map).map(([code, v]) => ({ code, label: v.label || v }));
const URGENCY_UP = { low: 'medium', medium: 'medium', high: 'high', urgent: 'urgent' };
const DAILY_LIMIT = 10; // bản xem thử: gửi thoải mái để thử đủ các loại

function freshState() {
  const hr = clone(SNAPSHOT.hr);
  return {
    seq: 100000,
    report: hr['/api/admin/feed/report'],
    posts: hr['/api/admin/feed/posts'],
    events: {}, // issueKey → [{action, detail, name, created_at}]
    drafts: {},
    mine: [], // id các bài người lao động demo đã gửi
    xpTaken: false,
    sentToday: 0,
  };
}
let S = freshState();
const listeners = new Set();
const changed = (who) => listeners.forEach((fn) => { try { fn(who); } catch { /* khung đã đóng */ } });

// --- phân tích nhanh (không có AI trong bản xem thử) -------------------------------
function analyse(text) {
  const n = normalize(text);
  let topic = 'other';
  let best = 0;
  let hits = [];
  for (const [code, t] of Object.entries(FEED_TOPICS)) {
    if (!t.n) continue;
    const found = n.match(new RegExp(t.n.source, 'g')) || [];
    if (found.length > best) { best = found.length; topic = code; hits = found; }
  }
  const positive = /\b(cam on|tot qua|hai long|khen|tuyet voi|vui)\b/.test(n);
  const negative = /\b(buc|te|kem|cham|khong (duoc|cho)|qua dang|ap luc|bat cong|vo ly|hong|nong qua|met)\b/.test(n);
  const urgent = /\b(nguy hiem|tai nan|chay|ngat|de doa|quay roi)\b/.test(n);
  // Từ khoá: lấy lại đúng chữ có dấu trong câu ứng với từ chủ đề vừa khớp.
  const words = text.split(/\s+/);
  const keywords = [...new Set(hits)].map((h) => {
    const len = h.split(' ').length;
    for (let i = 0; i + len <= words.length; i += 1) {
      const phrase = words.slice(i, i + len).join(' ').replace(/[^\p{L}\p{N}\s]/gu, '');
      if (normalize(phrase) === h) return phrase.toLowerCase();
    }
    return h;
  }).slice(0, 3);
  return {
    topic,
    keywords,
    tone: positive && !negative ? 0.6 : negative ? -0.6 : 0,
    urgency: urgent ? 'urgent' : negative ? 'medium' : 'low',
  };
}

// --- người lao động ----------------------------------------------------------------
function myView(p) {
  return {
    id: p.id,
    createdAt: p.createdAt,
    type: p.type,
    topic: p.topic,
    text: p.raw,
    redactedText: p.text,
    anonymous: !p.author,
    mood: p.mood,
    status: p.status,
    replies: p.replies.map((r, i) => ({ id: i + 1, text: r.text, createdAt: r.createdAt, fromCompany: r.by === 'hr' })),
    unread: p.replies.filter((r) => !r.seenByWorker).length,
  };
}
const minePosts = () => S.mine.map((id) => S.posts.find((p) => p.id === id)).filter(Boolean).reverse();
const unreadReplies = () => minePosts().reduce((n, p) => n + p.replies.filter((r) => !r.seenByWorker).length, 0);

function worker(method, path, body) {
  if (method === 'GET' && path === '/api/feed') {
    return ok({
      canPostToday: S.sentToday < DAILY_LIMIT,
      dailyLimit: DAILY_LIMIT,
      weeklyXp: S.xpTaken ? 0 : 10,
      company: SNAPSHOT.company,
      posts: minePosts().map(myView),
      types: labels(TYPES),
      topics: labels(FEED_TOPICS),
      moods: labels(FEED_MOODS),
    });
  }
  if (method === 'POST' && path === '/api/feed/preview') {
    const text = String(body?.text || '').trim();
    if (text.length < 10) return fail(400, 'Bạn viết thêm chút nữa nhé (ít nhất 10 ký tự)');
    if (text.length > 1000) return fail(400, 'Góp ý tối đa 1000 ký tự');
    const a = analyse(text);
    const mood = FEED_MOODS[body?.mood] ? body.mood : null;
    const id = (S.seq += 1);
    S.drafts[id] = {
      id, raw: text, text: redact(text), type: TYPES[body?.type] ? body.type : 'issue', topic: a.topic, keywords: a.keywords,
      tone: a.tone, mood, urgency: mood === 'angry' ? URGENCY_UP[a.urgency] : a.urgency, anonymous: body?.anonymous !== false,
    };
    const d = S.drafts[id];
    return ok({ draft: { id, type: d.type, topic: d.topic, anonymous: d.anonymous, mood, redactedText: d.text, keywords: d.keywords, hasCompany: true, companyName: SNAPSHOT.company } });
  }
  const submit = path.match(/^\/api\/feed\/(\d+)\/submit$/);
  if (method === 'POST' && submit) {
    const d = S.drafts[submit[1]];
    if (!d) return fail(404, 'Không tìm thấy bản nháp — bạn bấm "Xem trước" lại giúp nhé');
    if (S.sentToday >= DAILY_LIMIT) return fail(429, 'Hôm nay bạn đã gửi đủ lượt rồi.');
    const mood = body?.mood === undefined ? d.mood : (FEED_MOODS[body.mood] ? body.mood : null);
    const anonymous = body?.anonymous === undefined ? d.anonymous : Boolean(body.anonymous);
    const post = {
      id: d.id,
      createdAt: nowIso(),
      company: SNAPSHOT.company,
      type: TYPES[body?.type] ? body.type : d.type,
      topic: FEED_TOPICS[body?.topic] ? body.topic : d.topic,
      raw: d.raw,
      text: d.text,
      summary: null,
      keywords: d.keywords,
      sentiment: blendMood(d.tone, mood),
      mood,
      urgency: mood === 'angry' ? URGENCY_UP[d.urgency] : d.urgency,
      status: 'sent',
      sensitive: false,
      author: anonymous ? null : { name: WORKER.name, email: WORKER.email },
      unread: true,
      replies: [],
    };
    delete S.drafts[d.id];
    S.posts.unshift(post);
    S.mine.push(post.id);
    S.sentToday += 1;
    // Cộng vào số liệu của phần báo cáo tương ứng.
    const sec = S.report.sections?.[post.type];
    if (sec) {
      sec.totals.posts += 1;
      sec.totals.people += 1;
      const m = sec.moods?.find((x) => x.code === mood);
      if (m) m.posts += 1;
      const tp = sec.byTopic.find((x) => x.code === post.topic);
      if (tp) { tp.posts += 1; tp.people += 1; } else sec.byTopic.push({ code: post.topic, label: FEED_TOPICS[post.topic].label, posts: 1, people: 1 });
    }
    S.report.totals.posts += 1;
    const xp = S.xpTaken ? 0 : 10;
    S.xpTaken = true;
    changed('worker');
    return ok({ post: myView(post), rewards: xp ? { xp } : {} });
  }
  if (method === 'POST' && path === '/api/feed/replies/seen') {
    minePosts().forEach((p) => p.replies.forEach((r) => { r.seenByWorker = true; }));
    return ok({ ok: true });
  }
  return fail(404, 'Bản xem thử chưa có phần này');
}

// --- HR doanh nghiệp ------------------------------------------------------------------
const HR_NAME = () => SNAPSHOT.hr.whoami.name;
const issueOf = (key) => S.report.issues.find((i) => i.key === key);
const postOf = (id) => S.posts.find((p) => p.id === Number(id));
function logEvent(key, action, detail) {
  (S.events[key] ||= []).unshift({ action, detail, name: HR_NAME(), created_at: nowIso() });
}

function hr(method, path, body, query) {
  const get = (p) => method === 'GET' && path === p;
  if (get('/api/session/whoami')) return ok(SNAPSHOT.hr.whoami);
  if (get('/api/admin/feed/meta')) return ok(SNAPSHOT.hr['/api/admin/feed/meta']);
  if (get('/api/admin/feed/overview')) return ok(SNAPSHOT.hr['/api/admin/feed/overview']);
  if (get('/api/admin/feed/assignees')) return ok(SNAPSHOT.hr['/api/admin/feed/assignees']);
  if (get('/api/admin/feed/report')) return ok(S.report);
  if (get('/api/admin/feed/posts')) {
    const type = query.get('type');
    return ok(S.posts.filter((p) => !type || p.type === type).map(({ raw, ...p }) => p));
  }
  if (method === 'POST' && path === '/api/admin/feed/seen') {
    for (const k of [].concat(body?.keys || [])) {
      if (k.startsWith('post:')) { const p = postOf(k.slice(5)); if (p) p.unread = false; } else { const i = issueOf(k); if (i) i.unread = false; }
    }
    return ok({ ok: true });
  }
  if (method === 'POST' && path === '/api/admin/feed/reply') {
    const text = String(body?.text || '').trim();
    if (text.length < 2) return fail(400, 'Bạn chưa nhập nội dung trả lời');
    const ids = [].concat(body?.postIds || []).map(Number);
    const list = ids.map(postOf).filter(Boolean);
    if (!list.length) return fail(400, 'Chưa chọn góp ý nào để trả lời');
    for (const p of list) {
      p.replies.push({ text, createdAt: nowIso(), by: 'hr' });
      if (p.status !== 'closed') p.status = 'replied';
    }
    for (const i of S.report.issues) i.replied = i.postIds.filter((id) => ['replied', 'closed'].includes(postOf(id)?.status)).length;
    if (body?.issueKey) logEvent(body.issueKey, 'reply', `Trả lời ${list.length} người: ${text.slice(0, 120)}`);
    changed('hr');
    return ok({ ok: true, replied: list.length });
  }
  if (get('/api/admin/feed/issue')) {
    const i = issueOf(query.get('key'));
    if (!i) return fail(404, 'Không tìm thấy vấn đề');
    return ok({
      key: i.key, title: i.title, status: i.status, owner: i.owner, dueOn: i.dueOn, note: i.note,
      company: i.company, topic: i.topic, keyword: i.keyword, people: i.people,
      posts: i.postIds.map(postOf).filter(Boolean).map((p) => ({
        id: p.id, createdAt: p.createdAt, type: p.type, text: p.text, status: p.status, mood: p.mood,
        author: p.author ? { name: p.author.name } : null, replies: p.replies,
      })),
      events: S.events[i.key] || [],
    });
  }
  if (method === 'PATCH' && path === '/api/admin/feed/issue') {
    const i = issueOf(body?.key);
    if (!i) return fail(404, 'Không tìm thấy vấn đề');
    const LABEL = Object.fromEntries(SNAPSHOT.hr['/api/admin/feed/meta'].issueStatuses.map((x) => [x.code, x.label]));
    if (body.status && body.status !== i.status) {
      i.status = body.status;
      logEvent(i.key, 'status', LABEL[i.status] || i.status);
      for (const p of i.postIds.map(postOf).filter(Boolean)) {
        if (i.status === 'in_progress' && ['sent', 'received'].includes(p.status)) p.status = 'in_progress';
        if (i.status === 'resolved') p.status = 'closed';
      }
    }
    if (body.title !== undefined && String(body.title).trim() && body.title !== i.title) { i.title = String(body.title).trim(); logEvent(i.key, 'title', `Đổi tiêu đề: ${i.title}`); }
    if (body.owner !== undefined && (body.owner || null) !== i.owner) { i.owner = String(body.owner || '').trim() || null; logEvent(i.key, 'owner', `Người phụ trách: ${i.owner || 'bỏ trống'}`); }
    if (body.dueOn !== undefined && (body.dueOn || null) !== i.dueOn) { i.dueOn = body.dueOn || null; logEvent(i.key, 'due_on', `Hạn xử lý: ${i.dueOn || 'bỏ trống'}`); }
    if (body.note !== undefined && (body.note || null) !== i.note) { i.note = body.note || null; logEvent(i.key, 'note', ''); }
    changed('hr');
    return ok({ ok: true, issue: i });
  }
  const st = path.match(/^\/api\/admin\/feed\/posts\/(\d+)$/);
  if (method === 'PATCH' && st) {
    const p = postOf(st[1]);
    if (!p) return fail(404, 'Không tìm thấy góp ý');
    p.status = body?.status || p.status;
    changed('hr');
    return ok({ ok: true });
  }
  if (method === 'POST' && path === '/api/session/logout') return ok({ ok: true });
  return fail(404, 'Bản xem thử chỉ mở Bảng điều khiển và EkkoFeed');
}

/** Điểm vào cho hai khung: trả {status, body}. */
window.DEMO = {
  handle(role, url, opts = {}) {
    const u = new URL(url, 'https://demo.local');
    const method = String(opts.method || 'GET').toUpperCase();
    let body;
    try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = undefined; }
    const out = role === 'worker' ? worker(method, u.pathname, body) : hr(method, u.pathname, body, u.searchParams);
    return new Promise((resolve) => setTimeout(() => resolve(clone(out)), 120 + Math.random() * 180));
  },
  unreadReplies,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  reset() { S = freshState(); changed('reset'); },
};
