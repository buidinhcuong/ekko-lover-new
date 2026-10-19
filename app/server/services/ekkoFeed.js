/**
 * EkkoFeed — người lao động góp ý / phàn nàn / yêu cầu tới doanh nghiệp mình làm,
 * doanh nghiệp xem báo cáo tổng hợp và trả lời. Đề xuất đầy đủ:
 * docs/ekkofeed/DE-XUAT.md.
 *
 * Luồng của người lao động: viết → "Xem trước" (tạo bản nháp: che thông tin cá
 * nhân, AI gợi ý loại / chủ đề / từ khoá) → "Gửi". Mỗi người gửi tối đa
 * DAILY_LIMIT góp ý mỗi ngày; góp ý đầu tiên mỗi tuần được WEEKLY_XP.
 *
 * Quyền riêng tư:
 *  - Người gửi tự chọn ẩn danh (mặc định) hay ghi tên cho từng góp ý. Ẩn danh thì
 *    doanh nghiệp không bao giờ thấy tên / email / mã nhân viên.
 *  - Doanh nghiệp chỉ thấy `redacted_text` (đã che SĐT, CCCD, số tài khoản, email,
 *    tên người được nhắc tới); lời gốc chỉ người gửi và Ekko thấy.
 *  - Báo cáo tổng hợp chỉ hiện từ khoá / nhóm vấn đề có từ `minGroup` người trở
 *    lên (mặc định 5, Ekko chỉnh theo từng công ty).
 *  - Nội dung nhạy cảm (đe doạ, tự hại, quấy rối) → trạng thái `review`: chỉ quản
 *    trị Ekko thấy, duyệt xong mới tới doanh nghiệp.
 */
import { config } from '../config.js';
import { all, get, getSetting, run, setSetting, tx } from '../db.js';
import { dayKey, nowIso } from '../lib/time.js';
import { keyState } from './receiptAI.js';
import { takeAiCall } from './aiQuota.js';
import { recordAiUsage } from './aiUsage.js';
import { recordActivity } from './progression.js';
import { normalize } from './nlp.js';
import { phrasesOf } from './botTopics.js';
import { COMPANY_KEY, NO_EMPLOYER } from './companyScope.js';
import { hashPassword, tempPassword } from './localAuth.js';

export const DAILY_LIMIT = 1;
export const WEEKLY_XP = 10;
export const DEFAULT_MIN_GROUP = 5;
const MIN_TEXT = 10;
const MAX_TEXT = 1000;
const TIMEOUT_MS = 20_000;

/**
 * Hai loại, người lao động tự chọn khi gửi (✅ chốt 19/10):
 *  - share: chia sẻ (cảm nhận, lời khen, câu chuyện) — không cần công ty xử lý;
 *  - issue: góp ý / cần giải quyết — được gom vào "Vấn đề cần giải quyết".
 */
export const FEED_TYPES = {
  share: 'Chia sẻ',
  issue: 'Góp ý / Cần giải quyết',
};
const DEFAULT_TYPE = 'issue';

/** Chủ đề + từ khoá (dạng bỏ dấu) để phân loại khi không có AI. */
export const FEED_TOPICS = {
  salary: { label: 'Lương & thưởng', n: /\b(luong|thuong|tien cong|tra cham|cham luong|no luong|phieu luong|tang luong)\b/ },
  overtime: { label: 'Giờ làm & tăng ca', n: /\b(tang ca|lam them|ot|ca dem|ca kip|gio lam|nghi giua ca|doi ca|chu nhat)\b/ },
  benefits: { label: 'Phúc lợi & BHXH', n: /\b(bhxh|bao hiem|phuc loi|phu cap|nghi phep|thai san|om dau|tro cap|cong doan)\b/ },
  safety: { label: 'An toàn & môi trường làm việc', n: /\b(an toan|tai nan|nong|bui|on ao|hoa chat|bao ho|do bao ho|nguy hiem|chay no|thong gio)\b/ },
  facilities: { label: 'Cơ sở vật chất (nhà ăn, ký túc xá, xe…)', n: /\b(nha an|com|suat an|bua an|ky tuc xa|phong o|xe dua don|xe buyt|nha ve sinh|nuoc uong|cho de xe|tu do)\b/ },
  management: { label: 'Quản lý & cách đối xử', n: /\b(to truong|quan ly|truong ca|sep|cap tren|quat|chui|xuc pham|phan biet|thien vi|ky luat|tru luong)\b/ },
  training: { label: 'Đào tạo & thăng tiến', n: /\b(dao tao|hoc nghe|thang tien|len chuc|nang bac|ky nang|khoa hoc)\b/ },
  finance: { label: 'Tài chính cá nhân / ứng lương', n: /\b(ung luong|vay|tra no|tiet kiem|het tien|khong du tien|ekko)\b/ },
  other: { label: 'Khác', n: null },
};
const URGENCY = ['low', 'medium', 'high', 'urgent'];
const STATUS_LABEL = {
  review: 'Chờ Ekko kiểm duyệt',
  sent: 'Đã gửi',
  received: 'Đã tiếp nhận',
  in_progress: 'Đang xử lý',
  replied: 'Đã phản hồi',
  closed: 'Đã đóng',
};
export const FEED_STATUS = STATUS_LABEL;
/** Trạng thái doanh nghiệp được thấy (không gồm bản nháp và tin chờ kiểm duyệt). */
const VISIBLE_TO_HR = ['sent', 'received', 'in_progress', 'replied', 'closed'];

const fail = (message, status = 400) => ({ error: message, status });

// --- công ty của người gửi -------------------------------------------------------

function companyOf(userId) {
  return get(`SELECT ${COMPANY_KEY} AS key, NULLIF(trim(employer), '') AS name FROM users WHERE id = ?`, userId) || { key: null, name: null };
}

/** Ngưỡng ẩn danh của một công ty (Ekko chỉnh riêng được), mặc định 5 người. */
export function minGroupFor(employerKey) {
  const own = Number(getSetting(`feed_min_group:${employerKey || NO_EMPLOYER}`));
  const all_ = Number(getSetting('feed_min_group'));
  if (Number.isInteger(own) && own >= 1) return own;
  if (Number.isInteger(all_) && all_ >= 1) return all_;
  return DEFAULT_MIN_GROUP;
}
export function setMinGroup(employerKey, n) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 50) return fail('Ngưỡng ẩn danh phải từ 1 đến 50 người');
  setSetting(employerKey ? `feed_min_group:${employerKey}` : 'feed_min_group', String(v));
  return { ok: true, minGroup: v };
}

// --- che thông tin cá nhân ------------------------------------------------------

const TITLE_WORDS = ['anh', 'chị', 'chi', 'chú', 'chu', 'cô', 'co', 'ông', 'ong', 'bà', 'em', 'bạn',
  'tổ trưởng', 'to truong', 'trưởng ca', 'truong ca', 'quản lý', 'quan ly', 'sếp', 'sep', 'giám đốc', 'giam doc',
  'trưởng phòng', 'truong phong', 'quản đốc', 'quan doc'];
// Cả dạng viết thường lẫn viết hoa chữ đầu — KHÔNG dùng cờ i, vì với cờ i thì
// \p{Lu} khớp cả chữ thường ("anh ấy" sẽ bị che nhầm).
const TITLES = `(?:${TITLE_WORDS.flatMap((w) => [w, w[0].toUpperCase() + w.slice(1)]).join('|')})`;
/**
 * Che SĐT, CCCD / CMND, số tài khoản, email, và tên người (từ danh sách AI nhận
 * ra, cộng với chữ viết hoa đứng sau "anh / chị / tổ trưởng…").
 */
export function redact(text, names = []) {
  let out = String(text || '');
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
  out = out.replace(/(?<![\d+])(?:\+?84|0)(?:[\s.-]?\d){8,9}(?!\d)/g, '[số điện thoại]');
  // CCCD (12 số), CMND (9 số), số tài khoản (9–16 số) — trừ số tiền ("150000000đ", "15000000 vnd").
  out = out.replace(/\b\d{9,16}\b(?!\s*(?:đ|d\b|vnd|vnđ|k\b|đồng|dong))/gi, '[số]');
  for (const name of names) {
    const clean = String(name || '').trim();
    if (clean.length < 2) continue;
    out = out.replace(new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[tên]');
  }
  // "anh Tuấn", "tổ trưởng Nguyễn Văn B" → giữ chức danh, che tên viết hoa phía sau.
  out = out.replace(new RegExp(`((?:^|[^\\p{L}])${TITLES}\\s+)((?:\\p{Lu}\\p{Ll}*\\s?){1,4})`, 'gu'), (_, title) => `${title}[tên] `);
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
}

// --- phân loại -----------------------------------------------------------------

function ruleAnalysis(text) {
  const n = normalize(text);
  // Chủ đề khớp NHIỀU từ nhất ("nhà ăn ca đêm hết suất cơm": nhà ăn + cơm > ca đêm).
  let topic = 'other';
  let best = 0;
  let terms = [];
  for (const [code, t] of Object.entries(FEED_TOPICS)) {
    if (!t.n) continue;
    const hits = n.match(new RegExp(t.n.source, 'g')) || [];
    if (hits.length > best) { best = hits.length; topic = code; terms = hits; }
  }
  // Từ khoá: ưu tiên cụm chứa từ của chủ đề vừa chọn, rồi mới tới cụm khác.
  const phrases = phrasesOf(text, 8);
  const onTopic = phrases.filter((ph) => terms.some((term) => normalize(ph).includes(term) || term.includes(normalize(ph))));
  const keywords = [...new Set([...onTopic, ...phrases])].slice(0, 4);
  const positive = /\b(cam on|tot qua|hai long|khen|tuyet voi|vui)\b/.test(n);
  const negative = /\b(buc|te|kem|cham|khong (duoc|cho)|qua dang|ap luc|bat cong|vo ly|hong|nong qua)\b/.test(n);
  const urgent = /\b(nguy hiem|tai nan|chay|ngat|chet|tu tu|danh|de doa|quay roi)\b/.test(n);
  return {
    topic,
    keywords,
    sentiment: positive && !negative ? 0.6 : negative ? -0.6 : 0,
    urgency: urgent ? 'urgent' : negative ? 'medium' : 'low',
    summary: null,
    names: [],
    sensitive: /\b(tu tu|tu sat|giet|danh nhau|de doa|quay roi tinh duc|so hai)\b/.test(n),
    source: 'rule',
  };
}

const AI_SYSTEM = [
  'Bạn phân loại góp ý của người lao động Việt Nam gửi tới doanh nghiệp nơi họ làm việc (qua app Ekko).',
  'Trả về JSON đúng schema. Quy tắc:',
  `- topic: một trong ${Object.keys(FEED_TOPICS).join(', ')}.`,
  '- keywords: 2–4 cụm từ khoá tiếng Việt CÓ DẤU, ngắn (1–3 chữ), chữ thường, nói về VẤN ĐỀ (vd "tăng ca", "nhà ăn", "trả lương chậm"). Không đưa tên người, số điện thoại.',
  '- sentiment: số từ -1 (rất tiêu cực) đến 1 (rất tích cực).',
  '- urgency: low | medium | high | urgent (urgent: nguy hiểm tính mạng / an toàn, bị đe doạ, quấy rối, không trả lương nhiều người).',
  '- summary: một câu tóm tắt vấn đề, khách quan, KHÔNG chứa tên người hay chi tiết nhận diện được người gửi (tối đa 15 chữ).',
  '- names: danh sách tên riêng của NGƯỜI được nhắc tới trong câu (để che đi). Không có thì mảng rỗng.',
  '- sensitive: true nếu có dấu hiệu tự hại, đe doạ bạo lực, quấy rối tình dục, hoặc tố cáo nghiêm trọng một cá nhân cụ thể.',
].join('\n');

const AI_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string', enum: Object.keys(FEED_TOPICS) },
    keywords: { type: 'array', items: { type: 'string' } },
    sentiment: { type: 'number' },
    urgency: { type: 'string', enum: URGENCY },
    summary: { type: 'string' },
    names: { type: 'array', items: { type: 'string' } },
    sensitive: { type: 'boolean' },
  },
  required: ['topic', 'keywords', 'sentiment', 'urgency', 'summary', 'names', 'sensitive'],
  additionalProperties: false,
};

async function aiAnalysis(text, callId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: 1024,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_SCHEMA } },
        fallbacks: 'default',
        system: [{ type: 'text', text: AI_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Góp ý:\n"""${text}"""` }],
      }),
    });
    if (!response.ok) {
      console.error('[ekkoFeed] Claude', response.status, (await response.text().catch(() => '')).slice(0, 300));
      return null;
    }
    const payload = await response.json();
    recordAiUsage(callId, payload);
    if (payload.stop_reason === 'refusal' || payload.stop_reason === 'max_tokens') return null;
    const out = JSON.parse((payload.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
    return {
      topic: FEED_TOPICS[out.topic] ? out.topic : 'other',
      keywords: (out.keywords || []).map((k) => String(k).toLowerCase().trim()).filter((k) => k && k.length <= 40).slice(0, 4),
      sentiment: Math.max(-1, Math.min(1, Number(out.sentiment) || 0)),
      urgency: URGENCY.includes(out.urgency) ? out.urgency : 'medium',
      summary: String(out.summary || '').trim().slice(0, 160) || null,
      names: (out.names || []).map(String).slice(0, 10),
      sensitive: Boolean(out.sensitive),
      source: 'ai',
    };
  } catch (err) {
    console.error('[ekkoFeed] Claude gọi thất bại:', err.name, err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- phía người lao động ----------------------------------------------------------

const postedToday = (userId, day) => get(
  "SELECT COUNT(*) n FROM feed_posts WHERE user_id = ? AND day = ? AND status NOT IN ('draft')", userId, day,
).n;

/** Tuần bắt đầu từ thứ Hai (theo ngày Việt Nam). */
function weekStart(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function feedStatusFor(userId, day = dayKey()) {
  const used = postedToday(userId, day);
  const weekXpTaken = Boolean(get(
    "SELECT 1 FROM activity_log WHERE user_id = ? AND kind = 'feed_post' AND xp > 0 AND day >= ? LIMIT 1", userId, weekStart(day),
  ));
  return { canPostToday: used < DAILY_LIMIT, dailyLimit: DAILY_LIMIT, weeklyXp: weekXpTaken ? 0 : WEEKLY_XP };
}

/**
 * Bước "Xem trước": phân loại + che thông tin, lưu thành bản nháp. Người dùng xem
 * đúng nội dung doanh nghiệp sẽ thấy rồi mới bấm gửi.
 */
export async function createDraft(userId, { text, anonymous = true, type } = {}, day = dayKey()) {
  const clean = String(text || '').trim().replace(/\s+\n/g, '\n');
  if (clean.length < MIN_TEXT) return fail(`Bạn viết thêm chút nữa nhé (ít nhất ${MIN_TEXT} ký tự)`);
  if (clean.length > MAX_TEXT) return fail(`Góp ý tối đa ${MAX_TEXT} ký tự`);
  if (!feedStatusFor(userId, day).canPostToday) return fail('Hôm nay bạn đã gửi góp ý rồi. Mỗi ngày gửi được 1 góp ý — mai bạn gửi tiếp nhé.', 429);

  const callId = keyState() === 'ok' ? takeAiCall(userId, 'feed') : false;
  const analysis = (callId && await aiAnalysis(clean, callId)) || ruleAnalysis(clean);
  const company = companyOf(userId);
  // Một người chỉ giữ một bản nháp: xem trước lại thì thay bản cũ.
  run("DELETE FROM feed_posts WHERE user_id = ? AND status = 'draft'", userId);
  const info = run(
    `INSERT INTO feed_posts (user_id, employer_key, employer_name, type, topic, text, redacted_text, summary, keywords,
                             sentiment, urgency, anonymous, sensitive, source, status, day, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'draft', ?, ?)`,
    userId, company.key, company.name, FEED_TYPES[type] ? type : DEFAULT_TYPE, analysis.topic, clean, redact(clean, analysis.names),
    analysis.summary, JSON.stringify(analysis.keywords), analysis.sentiment, analysis.urgency,
    anonymous ? 1 : 0, analysis.sensitive ? 1 : 0, analysis.source, day, nowIso(),
  );
  return { draft: draftView(get('SELECT * FROM feed_posts WHERE id = ?', Number(info.lastInsertRowid))) };
}

function draftView(p) {
  return {
    id: p.id,
    type: p.type,
    topic: p.topic,
    anonymous: Boolean(p.anonymous),
    redactedText: p.redacted_text,
    keywords: JSON.parse(p.keywords || '[]'),
    hasCompany: Boolean(p.employer_key),
    companyName: p.employer_name,
  };
}

/** Bấm "Gửi": chốt loại / chủ đề / ẩn danh người dùng chọn, cộng XP tuần nếu có. */
export function submitDraft(userId, draftId, { type, topic, anonymous } = {}, day = dayKey()) {
  const draft = get("SELECT * FROM feed_posts WHERE id = ? AND user_id = ? AND status = 'draft'", Number(draftId), userId);
  if (!draft) return fail('Không tìm thấy bản nháp — bạn bấm "Xem trước" lại giúp nhé', 404);
  const status = feedStatusFor(userId, day);
  if (!status.canPostToday) return fail('Hôm nay bạn đã gửi góp ý rồi. Mỗi ngày gửi được 1 góp ý — mai bạn gửi tiếp nhé.', 429);
  const finalType = FEED_TYPES[type] ? type : draft.type;
  const finalTopic = FEED_TOPICS[topic] ? topic : draft.topic;
  return tx(() => {
    run(
      'UPDATE feed_posts SET type = ?, topic = ?, anonymous = ?, status = ?, day = ?, submitted_at = ? WHERE id = ?',
      finalType, finalTopic, anonymous === undefined ? draft.anonymous : (anonymous ? 1 : 0),
      draft.sensitive ? 'review' : 'sent', day, nowIso(), draft.id,
    );
    const rewards = recordActivity(userId, { kind: 'feed_post', ref: String(draft.id), xp: status.weeklyXp, countsForStreak: false, day });
    return { post: myPostView(get('SELECT * FROM feed_posts WHERE id = ?', draft.id)), rewards };
  });
}

function repliesOf(postId) {
  return all('SELECT id, author_role, text, created_at, seen_at FROM feed_replies WHERE post_id = ? ORDER BY id', postId);
}

function myPostView(p) {
  const replies = repliesOf(p.id);
  return {
    id: p.id,
    createdAt: p.submitted_at || p.created_at,
    type: p.type,
    topic: p.topic,
    text: p.text,
    redactedText: p.redacted_text,
    anonymous: Boolean(p.anonymous),
    // Người gửi không cần biết "chờ kiểm duyệt": với họ là đã gửi.
    status: p.status === 'review' ? 'sent' : p.status,
    replies: replies.map((r) => ({ id: r.id, text: r.text, createdAt: r.created_at, fromCompany: r.author_role === 'hr' })),
    unread: replies.filter((r) => !r.seen_at).length,
  };
}

export function myPosts(userId, day = dayKey()) {
  const posts = all("SELECT * FROM feed_posts WHERE user_id = ? AND status <> 'draft' ORDER BY id DESC LIMIT 50", userId).map(myPostView);
  return { ...feedStatusFor(userId, day), company: companyOf(userId).name, posts };
}

export function markRepliesSeen(userId) {
  run(
    `UPDATE feed_replies SET seen_at = ? WHERE seen_at IS NULL
       AND post_id IN (SELECT id FROM feed_posts WHERE user_id = ?)`,
    nowIso(), userId,
  );
  return { ok: true };
}

/** Số phản hồi chưa đọc — dòng nhắc vàng ở màn chủ. */
export function unreadReplies(userId) {
  return get(
    `SELECT COUNT(*) n FROM feed_replies r JOIN feed_posts p ON p.id = r.post_id
      WHERE p.user_id = ? AND r.seen_at IS NULL`,
    userId,
  ).n;
}

// --- quyền quản trị -------------------------------------------------------------

/** Quản trị Ekko (role admin) thấy mọi công ty; HR chỉ thấy công ty của mình. */
export function feedAccess(user) {
  if (!user) return null;
  if (user.role === 'admin') return { ekko: true, employerKey: null, employerName: null };
  const hr = get('SELECT employer_key, employer_name FROM employer_admins WHERE user_id = ?', user.id);
  return hr ? { ekko: false, employerKey: hr.employer_key, employerName: hr.employer_name } : null;
}

function audit(userId, action, target = null) {
  run('INSERT INTO feed_audit (user_id, action, target, created_at) VALUES (?,?,?,?)', userId, action, target, nowIso());
}

/** Điều kiện lọc bài theo quyền + công ty được chọn. */
function postScope(access, employer) {
  if (!access.ekko) return { sql: 'p.employer_key = ?', params: [access.employerKey], key: access.employerKey };
  const value = employer ? String(employer).trim() : '';
  if (!value) return { sql: '1 = 1', params: [], key: null };
  if (value === NO_EMPLOYER) return { sql: 'p.employer_key IS NULL', params: [], key: NO_EMPLOYER };
  return { sql: 'p.employer_key = ?', params: [value], key: value };
}

function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Báo cáo tổng hợp: từ khoá (độ to theo số NGƯỜI nhắc), nhóm vấn đề cần giải
 * quyết, phân bố theo chủ đề / loại, cảm xúc. Từ khoá & nhóm vấn đề dưới ngưỡng
 * ẩn danh thì không hiện (chỉ đếm gộp).
 */
export function feedReport(access, { employer = null, days = 30, today = dayKey() } = {}) {
  const span = Math.max(1, Math.min(365, Math.round(Number(days)) || 30));
  const from = shiftDay(today, -(span - 1));
  const prevFrom = shiftDay(from, -span);
  const scope = postScope(access, employer);
  const minGroup = minGroupFor(scope.key && scope.key !== NO_EMPLOYER ? scope.key : null);
  // Ekko xem cả tin chờ kiểm duyệt; HR thì không.
  const statuses = access.ekko ? [...VISIBLE_TO_HR, 'review'] : VISIBLE_TO_HR;
  const inStatus = `p.status IN (${statuses.map(() => '?').join(',')})`;
  const rows = (fromDay, toDay) => all(
    `SELECT p.* FROM feed_posts p WHERE ${scope.sql} AND ${inStatus} AND p.day BETWEEN ? AND ?`,
    ...scope.params, ...statuses, fromDay, toDay,
  );
  const posts = rows(from, today);
  const prev = rows(prevFrom, shiftDay(from, -1));

  const people = (list) => new Set(list.map((p) => p.user_id)).size;
  const kwPeople = (list) => {
    const map = new Map();
    for (const p of list) {
      for (const k of JSON.parse(p.keywords || '[]')) {
        const key = normalize(k);
        if (!map.has(key)) map.set(key, { text: k, users: new Set(), posts: 0 });
        const e = map.get(key);
        e.users.add(p.user_id);
        e.posts += 1;
      }
    }
    return map;
  };
  /** Đám mây từ khoá của một tập bài: độ to theo số NGƯỜI, ẩn từ dưới ngưỡng ẩn danh. */
  const cloudOf = (list, prevList) => {
    const kwNow = kwPeople(list);
    const kwPrev = kwPeople(prevList);
    const shown = [...kwNow.entries()].map(([key, e]) => ({ key, text: e.text, people: e.users.size, posts: e.posts }))
      .sort((a, b) => b.people - a.people || b.posts - a.posts)
      .filter((k) => k.people >= minGroup).slice(0, 40);
    const maxKw = Math.max(1, ...shown.map((k) => k.people));
    return shown.map((k) => {
      const before = kwPrev.get(k.key)?.users.size || 0;
      return {
        text: k.text, people: k.people, posts: k.posts,
        weight: Math.round((k.people / maxKw) * 100) / 100,
        trend: before ? Math.round(((k.people - before) / before) * 100) : null,
      };
    });
  };
  const keywords = cloudOf(posts, prev);

  // Nhóm vấn đề: cùng công ty + cùng chủ đề + cùng từ khoá chính (từ khoá đầu tiên AI đưa ra).
  const groups = new Map();
  // Chỉ góp ý loại "Góp ý / Cần giải quyết" mới thành vấn đề; "Chia sẻ" chỉ tính vào từ khoá & phân bố.
  for (const p of posts.filter((x) => x.type === 'issue')) {
    const key = issueKeyOf(p);
    if (!groups.has(key)) groups.set(key, { topic: p.topic, keyword: JSON.parse(p.keywords || '[]')[0] || null, employer: p.employer_name, posts: [] });
    groups.get(key).posts.push(p);
  }
  const states = issueStates([...groups.keys()]);
  const issues = [];
  let belowThreshold = 0;
  for (const [key, g] of groups) {
    const n = people(g.posts);
    if (n < minGroup) { belowThreshold += g.posts.length; continue; }
    const sentiment = g.posts.reduce((s, p) => s + (p.sentiment || 0), 0) / g.posts.length;
    const worst = g.posts.map((p) => p.urgency).sort((a, b) => PRIORITY_ORDER[a] - PRIORITY_ORDER[b])[0];
    const replied = g.posts.filter((p) => ['replied', 'closed'].includes(p.status)).length;
    // Ưu tiên: khẩn nếu có tin khẩn; cao nếu đông người + tiêu cực; còn lại theo mức gấp phổ biến.
    const priority = worst === 'urgent' ? 'urgent'
      : (n >= minGroup * 3 && sentiment < -0.3) || worst === 'high' ? 'high'
        : sentiment < -0.2 ? 'medium' : 'low';
    const summaries = [...new Set(g.posts.map((p) => p.summary).filter(Boolean))];
    const state = states.get(key);
    issues.push({
      key,
      company: g.employer,
      title: state?.title || summaries[0] || `${FEED_TOPICS[g.topic]?.label || g.topic}${g.keyword ? ` — ${g.keyword}` : ''}`,
      // Phần quản lý (mặc định "Mới" khi chưa ai đụng tới).
      status: state?.status || 'open',
      owner: state?.owner || null,
      dueOn: state?.due_on || null,
      note: state?.note || null,
      updatedAt: state?.updated_at || null,
      // Có góp ý mới gửi tới SAU lúc đánh dấu đã giải quyết → cần xem lại.
      newSinceResolved: state?.resolved_at ? g.posts.filter((p) => (p.submitted_at || p.created_at) > state.resolved_at).length : 0,
      topic: g.topic,
      keyword: g.keyword,
      people: n,
      posts: g.posts.length,
      sentiment: Math.round(sentiment * 100) / 100,
      priority,
      replied,
      postIds: g.posts.map((p) => p.id),
      // Câu đã được AI diễn đạt lại (không phải lời gốc), tối đa 3.
      quotes: summaries.slice(0, 3),
    });
  }
  const STATUS_ORDER = { open: 0, in_progress: 1, resolved: 2, dismissed: 3 };
  issues.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.people - a.people);

  const tally = (field, labels, from_ = posts) => Object.keys(labels).map((code) => {
    const list = from_.filter((p) => p[field] === code);
    return { code, label: labels[code].label || labels[code], posts: list.length, people: people(list) };
  }).filter((x) => x.posts > 0).sort((a, b) => b.people - a.people || b.posts - a.posts);
  const avg = (list) => (list.length ? Math.round((list.reduce((n, p) => n + (p.sentiment || 0), 0) / list.length) * 100) / 100 : 0);

  /**
   * Báo cáo riêng cho từng loại — cùng một cấu trúc: tổng, từ khoá, theo chủ đề.
   * Góp ý / Cần giải quyết có thêm tỷ lệ đã phản hồi; Chia sẻ có thêm các câu tóm tắt
   * (đã diễn đạt lại) theo chủ đề để đọc nhanh — Chia sẻ không cần phản hồi.
   */
  const sectionOf = (type) => {
    const list = posts.filter((p) => p.type === type);
    const prevList = prev.filter((p) => p.type === type);
    const out = {
      totals: {
        posts: list.length,
        people: people(list),
        sentiment: avg(list),
        prevPosts: prevList.length,
      },
      keywords: cloudOf(list, prevList),
      byTopic: tally('topic', FEED_TOPICS, list),
    };
    if (type === 'issue') {
      out.totals.replied = list.length ? Math.round((list.filter((p) => ['replied', 'closed'].includes(p.status)).length / list.length) * 100) / 100 : 0;
    }
    return out;
  };

  return {
    employer: scope.key,
    from, to: today, days: span, minGroup,
    totals: {
      posts: posts.length,
      people: people(posts),
      replied: posts.length ? Math.round((posts.filter((p) => ['replied', 'closed'].includes(p.status)).length / posts.length) * 100) / 100 : 0,
      sentiment: posts.length ? Math.round((posts.reduce((s, p) => s + (p.sentiment || 0), 0) / posts.length) * 100) / 100 : 0,
      waitingReview: access.ekko ? posts.filter((p) => p.status === 'review').length : undefined,
      belowThreshold,
    },
    keywords,
    issues,
    byTopic: tally('topic', FEED_TOPICS),
    byType: tally('type', FEED_TYPES),
    sections: { issue: sectionOf('issue'), share: sectionOf('share') },
  };
}

// --- quản lý từng vấn đề cần giải quyết ---------------------------------------------

export const ISSUE_STATUS = { open: 'Mới', in_progress: 'Đang xử lý', resolved: 'Đã giải quyết', dismissed: 'Không xử lý' };

/** Khoá nhóm vấn đề của một góp ý: '<công ty>|<chủ đề>|<từ khoá chính bỏ dấu>'. */
export function issueKeyOf(post) {
  const main = JSON.parse(post.keywords || '[]')[0];
  return `${post.employer_key || ''}|${post.topic}|${main ? normalize(main) : ''}`;
}

function issueStates(keys) {
  if (!keys.length) return new Map();
  const rows = all(`SELECT * FROM feed_issues WHERE issue_key IN (${keys.map(() => '?').join(',')})`, ...keys);
  return new Map(rows.map((r) => [r.issue_key, r]));
}

/** Kiểm quyền với một vấn đề: HR chỉ đụng được vấn đề của công ty mình. */
function issueAllowed(access, key) {
  const parts = String(key || '').split('|');
  if (parts.length !== 3 || !FEED_TOPICS[parts[1]]) return null;
  const employerKey = parts[0];
  if (!access.ekko && employerKey !== access.employerKey) return null;
  return { employerKey, topic: parts[1], keyword: parts[2] };
}

/** Mọi góp ý (không giới hạn kỳ) thuộc một vấn đề, mà người xem được phép thấy. */
function issuePosts(access, key, info) {
  const statuses = access.ekko ? [...VISIBLE_TO_HR, 'review'] : VISIBLE_TO_HR;
  return all(
    `SELECT p.*, u.name author_name, u.email author_email FROM feed_posts p JOIN users u ON u.id = p.user_id
      WHERE COALESCE(p.employer_key, '') = ? AND p.topic = ? AND p.type = 'issue' AND p.status IN (${statuses.map(() => '?').join(',')})
      ORDER BY p.id DESC`,
    info.employerKey, info.topic, ...statuses,
  ).filter((p) => issueKeyOf(p) === key);
}

function ensureIssue(key, employerKey) {
  run(`INSERT INTO feed_issues (employer_key, issue_key, status, created_at, updated_at) VALUES (?,?, 'open', ?, ?)
       ON CONFLICT(issue_key) DO NOTHING`, employerKey, key, nowIso(), nowIso());
  return get('SELECT * FROM feed_issues WHERE issue_key = ?', key);
}

function issueEvent(issueId, userId, action, detail = null) {
  run('INSERT INTO feed_issue_events (issue_id, user_id, action, detail, created_at) VALUES (?,?,?,?,?)', issueId, userId, action, detail, nowIso());
}

/** Chi tiết một vấn đề: phần quản lý + toàn bộ góp ý trong nhóm + lịch sử thao tác. */
export function issueDetail(access, key) {
  const info = issueAllowed(access, key);
  if (!info) return fail('Không tìm thấy vấn đề này', 404);
  const posts = issuePosts(access, key, info);
  if (!posts.length) return fail('Không tìm thấy vấn đề này', 404);
  const state = get('SELECT * FROM feed_issues WHERE issue_key = ?', key);
  return {
    key,
    company: posts[0].employer_name,
    topic: info.topic,
    keyword: JSON.parse(posts[0].keywords || '[]')[0] || null,
    title: state?.title || posts.find((p) => p.summary)?.summary || FEED_TOPICS[info.topic].label,
    status: state?.status || 'open',
    owner: state?.owner || null,
    dueOn: state?.due_on || null,
    note: state?.note || null,
    people: new Set(posts.map((p) => p.user_id)).size,
    posts: posts.map((p) => ({
      id: p.id,
      createdAt: p.submitted_at || p.created_at,
      type: p.type,
      text: p.redacted_text,
      status: p.status,
      author: p.anonymous ? null : { name: p.author_name },
      replies: repliesOf(p.id).map((r) => ({ text: r.text, createdAt: r.created_at, by: r.author_role })),
    })),
    events: state ? all(
      `SELECT e.action, e.detail, e.created_at, u.name FROM feed_issue_events e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.issue_id = ? ORDER BY e.id DESC LIMIT 50`, state.id,
    ) : [],
  };
}

/**
 * Cập nhật phần quản lý của một vấn đề. Đổi trạng thái thì góp ý trong nhóm đổi
 * theo cho người lao động thấy: Đang xử lý → "Đang xử lý"; Đã giải quyết → "Đã đóng".
 */
export function updateIssue(access, user, key, changes = {}) {
  const info = issueAllowed(access, key);
  if (!info) return fail('Không tìm thấy vấn đề này', 404);
  const posts = issuePosts(access, key, info);
  if (!posts.length) return fail('Không tìm thấy vấn đề này', 404);
  const issue = ensureIssue(key, info.employerKey);
  const next = {
    title: changes.title === undefined ? issue.title : (String(changes.title || '').trim().slice(0, 160) || null),
    status: changes.status === undefined ? issue.status : changes.status,
    owner: changes.owner === undefined ? issue.owner : (String(changes.owner || '').trim().slice(0, 80) || null),
    due_on: changes.dueOn === undefined ? issue.due_on : (changes.dueOn || null),
    note: changes.note === undefined ? issue.note : (String(changes.note || '').trim().slice(0, 2000) || null),
  };
  if (!ISSUE_STATUS[next.status]) return fail('Trạng thái vấn đề không hợp lệ');
  if (next.due_on && !/^\d{4}-\d{2}-\d{2}$/.test(next.due_on)) return fail('Hạn xử lý không hợp lệ');
  tx(() => {
    run(
      `UPDATE feed_issues SET title = ?, status = ?, owner = ?, due_on = ?, note = ?, updated_at = ?,
              resolved_at = CASE WHEN ? = 'resolved' AND status <> 'resolved' THEN ? WHEN ? <> 'resolved' THEN NULL ELSE resolved_at END
        WHERE id = ?`,
      next.title, next.status, next.owner, next.due_on, next.note, nowIso(),
      next.status, nowIso(), next.status, issue.id,
    );
    const labels = { title: 'Đổi tiêu đề', owner: 'Người phụ trách', due_on: 'Hạn xử lý', note: 'Sửa ghi chú nội bộ' };
    if (next.status !== issue.status) {
      issueEvent(issue.id, user.id, 'status', ISSUE_STATUS[next.status]);
      const ids = posts.map((p) => p.id);
      const inList = ids.map(() => '?').join(',');
      if (next.status === 'in_progress') run(`UPDATE feed_posts SET status = 'in_progress' WHERE id IN (${inList}) AND status IN ('sent', 'received')`, ...ids);
      if (next.status === 'resolved') run(`UPDATE feed_posts SET status = 'closed' WHERE id IN (${inList}) AND status <> 'review'`, ...ids);
    }
    for (const field of ['title', 'owner', 'due_on', 'note']) {
      if ((next[field] || null) !== (issue[field] || null)) issueEvent(issue.id, user.id, field, field === 'note' ? null : `${labels[field]}: ${next[field] || '—'}`);
    }
    audit(user.id, 'issue_update', key);
  });
  return { ok: true, issue: issueDetail(access, key) };
}

/** Danh sách góp ý cho quản trị — chỉ bản đã che; tên chỉ hiện khi người gửi chọn ghi tên. */
export function feedPosts(access, { employer = null, status = '', topic = '', type = '', days = null, limit = 200 } = {}, viewerId = null) {
  const scope = postScope(access, employer);
  const statuses = access.ekko ? [...VISIBLE_TO_HR, 'review'] : VISIBLE_TO_HR;
  const want = status && statuses.includes(status) ? [status] : statuses;
  const params = [...scope.params, ...want];
  let sql = `SELECT p.*, u.name author_name, u.email author_email FROM feed_posts p JOIN users u ON u.id = p.user_id
              WHERE ${scope.sql} AND p.status IN (${want.map(() => '?').join(',')})`;
  if (topic && FEED_TOPICS[topic]) { sql += ' AND p.topic = ?'; params.push(topic); }
  if (type && FEED_TYPES[type]) { sql += ' AND p.type = ?'; params.push(type); }
  // Cùng kỳ xem với báo cáo (7 / 30 / 90 ngày gần nhất).
  if (Number(days) > 0) { sql += ' AND p.day >= ?'; params.push(shiftDay(dayKey(), -(Math.min(365, Math.round(Number(days))) - 1))); }
  sql += ' ORDER BY p.id DESC LIMIT ?';
  params.push(Math.min(500, Number(limit) || 200));
  if (viewerId) audit(viewerId, 'view_posts', scope.key);
  return all(sql, ...params).map((p) => ({
    id: p.id,
    createdAt: p.submitted_at || p.created_at,
    company: p.employer_name,
    type: p.type,
    topic: p.topic,
    text: p.redacted_text,
    summary: p.summary,
    keywords: JSON.parse(p.keywords || '[]'),
    sentiment: p.sentiment,
    urgency: p.urgency,
    status: p.status,
    sensitive: Boolean(p.sensitive),
    author: p.anonymous ? null : { name: p.author_name, email: p.author_email },
    replies: repliesOf(p.id).map((r) => ({ text: r.text, createdAt: r.created_at, by: r.author_role })),
  }));
}

function ownedPost(access, postId) {
  const post = get('SELECT * FROM feed_posts WHERE id = ?', Number(postId));
  if (!post || post.status === 'draft') return null;
  if (!access.ekko && (post.employer_key !== access.employerKey || post.status === 'review')) return null;
  return post;
}

/** Trả lời một hoặc nhiều góp ý (trả lời cả nhóm vấn đề = gửi riêng tới từng người). */
export function replyPosts(access, user, postIds, text, issueKey = null) {
  const clean = String(text || '').trim();
  if (clean.length < 2) return fail('Bạn chưa nhập nội dung trả lời');
  if (clean.length > 2000) return fail('Trả lời tối đa 2.000 ký tự');
  const ids = [...new Set([].concat(postIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return fail('Chưa chọn góp ý nào để trả lời');
  const posts = ids.map((id) => ownedPost(access, id));
  if (posts.some((p) => !p)) return fail('Có góp ý không tồn tại hoặc không thuộc công ty của bạn', 404);
  tx(() => {
    for (const p of posts) {
      run('INSERT INTO feed_replies (post_id, author_id, author_role, text, created_at) VALUES (?,?,?,?,?)',
        p.id, user.id, access.ekko ? 'ekko' : 'hr', clean, nowIso());
      if (p.status !== 'closed') run("UPDATE feed_posts SET status = 'replied' WHERE id = ?", p.id);
    }
    audit(user.id, 'reply', ids.join(','));
    // Trả lời từ màn quản lý vấn đề: ghi vào lịch sử của vấn đề đó.
    const info = issueKey ? issueAllowed(access, issueKey) : null;
    if (info) issueEvent(ensureIssue(issueKey, info.employerKey).id, user.id, 'reply', `Trả lời ${ids.length} người: ${clean.slice(0, 120)}`);
  });
  return { ok: true, replied: ids.length };
}

export function setPostStatus(access, user, postId, status) {
  const post = ownedPost(access, postId);
  if (!post) return fail('Không tìm thấy góp ý', 404);
  const allowed = access.ekko ? [...VISIBLE_TO_HR, 'review'] : VISIBLE_TO_HR;
  if (!allowed.includes(status)) return fail('Trạng thái không hợp lệ');
  run('UPDATE feed_posts SET status = ? WHERE id = ?', status, post.id);
  audit(user.id, `status:${status}`, String(post.id));
  return { ok: true };
}

// --- tài khoản HR doanh nghiệp (chỉ quản trị Ekko) -----------------------------

export function hrAccounts() {
  return all(
    `SELECT e.user_id id, u.name, u.email, e.employer_key, e.employer_name, e.created_at,
            (SELECT MAX(created_at) FROM feed_audit a WHERE a.user_id = e.user_id) last_used
       FROM employer_admins e JOIN users u ON u.id = e.user_id ORDER BY e.employer_name, u.name`,
  );
}

/**
 * Tạo tài khoản HR (email + mật khẩu tạm, hiện một lần) cho một công ty. Email đã
 * có tài khoản thì chỉ gắn quyền HR của công ty đó.
 */
export function createHrAccount(adminId, { email, name, employer } = {}, upsertMember) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return fail('Email không hợp lệ');
  const employerKey = String(employer || '').trim();
  if (!employerKey || employerKey === NO_EMPLOYER) return fail('Chọn công ty cho tài khoản HR');
  const company = get(`SELECT MAX(NULLIF(trim(employer), '')) name FROM users WHERE ${COMPANY_KEY} = ?`, employerKey);
  if (!company?.name) return fail('Không tìm thấy công ty này trong danh sách người học');

  return tx(() => {
    const existing = get('SELECT user_id FROM local_accounts WHERE email = ?', cleanEmail);
    let userId = existing?.user_id;
    let password = null;
    if (!userId) {
      const user = upsertMember({ sub: `local:${cleanEmail}`, name: String(name || '').trim() || cleanEmail.split('@')[0], email: cleanEmail });
      userId = user.id;
      password = tempPassword();
      run('INSERT INTO local_accounts (user_id, email, password_hash, created_at, updated_at) VALUES (?,?,?,?,?)',
        userId, cleanEmail, hashPassword(password), nowIso(), nowIso());
    }
    run(
      `INSERT INTO employer_admins (user_id, employer_key, employer_name, created_by, created_at) VALUES (?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET employer_key = excluded.employer_key, employer_name = excluded.employer_name`,
      userId, employerKey, company.name, adminId, nowIso(),
    );
    audit(adminId, 'hr_grant', `${cleanEmail}@${employerKey}`);
    return { ok: true, email: cleanEmail, company: company.name, password };
  });
}

export function removeHrAccount(adminId, userId) {
  const row = get('SELECT * FROM employer_admins WHERE user_id = ?', Number(userId));
  if (!row) return fail('Không tìm thấy tài khoản HR', 404);
  run('DELETE FROM employer_admins WHERE user_id = ?', row.user_id);
  audit(adminId, 'hr_revoke', String(row.user_id));
  return { ok: true };
}

// --- chỉ môi trường dev: dữ liệu mẫu để bấm thử báo cáo ---------------------------

const DEMO_POSTS = [
  ['issue', 'overtime', ['tăng ca', 'trả chậm', 'lương tăng ca'], -0.8, 'high', 'Lương tăng ca trả chậm 2 tuần, không báo trước', 'Tiền tăng ca tháng này trả chậm, hỏi thì bảo chờ', 8],
  ['issue', 'facilities', ['nhà ăn', 'ca đêm', 'hết suất'], -0.6, 'medium', 'Nhà ăn ca đêm hết suất trước 1h sáng', 'Nhà ăn ca đêm hết cơm sớm, anh em ca muộn nhịn đói', 6],
  ['issue', 'facilities', ['xe đưa đón', 'đến muộn'], -0.4, 'medium', 'Xe đưa đón buổi sáng thường đến muộn', 'Xe đưa đón hay đến muộn 20–30 phút', 5],
  ['issue', 'safety', ['nóng', 'thông gió', 'xưởng'], -0.7, 'high', 'Xưởng quá nóng, quạt thông gió hỏng', 'Xưởng B nóng quá, quạt hỏng cả tuần', 6],
  ['issue', 'benefits', ['bhxh', 'sổ bảo hiểm'], -0.1, 'low', 'Muốn được hướng dẫn tra cứu BHXH', 'Mong công ty hướng dẫn tra cứu quá trình đóng BHXH', 2],
  ['share', 'management', ['tổ trưởng', 'hỗ trợ'], 0.7, 'low', 'Tổ trưởng hỗ trợ nhiệt tình khi ốm', 'Cảm ơn tổ trưởng đã cho đổi ca khi con ốm', 6],
  ['share', 'facilities', ['nhà ăn', 'món mới'], 0.6, 'low', 'Nhà ăn có thêm món mới, ngon hơn', 'Nhà ăn tuần này có thêm món canh nóng, ngon hơn hẳn', 5],
  ['share', 'benefits', ['khám sức khoẻ'], 0.7, 'low', 'Cảm ơn công ty tổ chức khám sức khoẻ', 'Đợt khám sức khoẻ vừa rồi rất chu đáo, cảm ơn công ty', 5],
  ['issue', 'training', ['nâng bậc', 'học nghề'], -0.2, 'low', 'Mong có lớp học nâng bậc thợ', 'Mong công ty mở lớp nâng bậc thợ cho công nhân lâu năm', 2],
];

/**
 * Nạp ~30 góp ý mẫu (người dùng `demo-feed-*`) cho một công ty, để báo cáo
 * EkkoFeed có số liệu khi bấm thử. Chạy lại thì thay bộ mẫu cũ. Chỉ gọi ở dev.
 */
export function seedFeedDemo(employerName, today = dayKey()) {
  tx(() => {
    run("DELETE FROM users WHERE ekko_user_id LIKE 'demo-feed-%'");
    let i = 0;
    for (const [type, topic, keywords, sentiment, urgency, summary, text, count] of DEMO_POSTS) {
      for (let k = 0; k < count; k += 1, i += 1) {
        const user = run("INSERT INTO users (ekko_user_id, name, role, employer, created_at) VALUES (?,?,'member',?,?)",
          `demo-feed-${i}`, `Nhân viên mẫu ${i + 1}`, employerName, nowIso());
        const day = shiftDay(today, -(i % 20));
        run(
          `INSERT INTO feed_posts (user_id, employer_key, employer_name, type, topic, text, redacted_text, summary, keywords,
                                   sentiment, urgency, anonymous, status, source, day, created_at, submitted_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,1,'sent','ai',?,?,?)`,
          Number(user.lastInsertRowid), employerName, employerName, type, topic, text, text, summary, JSON.stringify(keywords),
          sentiment, urgency, day, `${day}T03:00:00.000Z`, `${day}T03:00:00.000Z`,
        );
      }
    }
  });
}
