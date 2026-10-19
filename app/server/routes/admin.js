/**
 * Admin portal API. Every entity in the game world is editable here:
 * levels, badges, learning modules / lessons / frames, the three feature
 * islands, and expense categories.
 *
 * Writes go through an explicit column whitelist per entity, so a stray field
 * in the request body can never reach SQL.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { config } from '../config.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { all, get, run, setSetting, tx } from '../db.js';
import { bad, notFound, Router } from '../lib/http.js';
import { dayKey } from '../lib/time.js';
import { BADGE_RULES, LEARNING_XP_KEYS, learningXp } from '../services/progression.js';
import { CHALLENGE_PERIODS, CHALLENGE_RULES } from '../services/challenges.js';
import { aiDailyLimit, aiUsageToday, recentOutOfScope } from '../services/aiQuota.js';
import { aiUsageReport } from '../services/aiUsage.js';
import { programOverview } from '../services/overview.js';
import { companyList, companyScope } from '../services/companyScope.js';
import { keyState } from '../services/receiptAI.js';
import { BADGE_GROUPS } from '../seed/catalogue.js';
import { adminUserSummary } from './session.js';
import { conceptBoard, setActiveConcept } from '../services/concepts.js';
import { TEAM_XP_SHARE_KEY, teamXpShare } from '../services/teams.js';
import { resetPassword, signupSettings, updateSignupSettings } from '../services/localAuth.js';

export const adminRouter = new Router();

const UPLOAD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'assets', 'uploads');

/** @type {Record<string, {table:string, columns:string[], order:string, required?:string[]}>} */
const ENTITIES = {
  levels: {
    table: 'levels',
    columns: ['order_index', 'name', 'emoji', 'perk', 'xp_required', 'island_image', 'character_image', 'is_active'],
    required: ['name'],
    order: 'order_index',
  },
  badges: {
    table: 'badges',
    columns: ['code', 'group_code', 'name', 'description', 'icon', 'rule_type', 'rule_value', 'rule_target', 'xp_reward', 'order_index', 'is_active'],
    required: ['code', 'name', 'rule_type'],
    order: 'order_index, id',
  },
  challenges: {
    table: 'challenges',
    columns: ['code', 'period', 'name', 'description', 'icon', 'rule_type', 'rule_value', 'rule_target', 'xp_reward', 'order_index', 'is_active'],
    required: ['code', 'period', 'name', 'rule_type'],
    order: 'period, order_index, id',
  },
  modules: {
    table: 'modules',
    columns: ['order_index', 'title', 'slug', 'summary', 'emoji', 'cover_image', 'unlock_level', 'is_published'],
    required: ['title', 'slug'],
    order: 'order_index',
  },
  lessons: {
    table: 'lessons',
    columns: ['module_id', 'order_index', 'title', 'slug', 'summary', 'content_type', 'cover_image', 'est_minutes', 'is_published'],
    required: ['module_id', 'title', 'slug'],
    order: 'module_id, order_index',
  },
  questions: {
    table: 'module_questions',
    columns: ['module_id', 'order_index', 'question', 'options'],
    required: ['module_id', 'question'],
    order: 'module_id, order_index',
  },
  frames: {
    table: 'frames',
    columns: ['lesson_id', 'order_index', 'kind', 'payload'],
    required: ['lesson_id', 'kind'],
    order: 'lesson_id, order_index',
  },
  features: {
    table: 'features',
    columns: ['code', 'name', 'description', 'island_image', 'route', 'order_index', 'xp_per_day', 'is_enabled'],
    required: ['code', 'name', 'route'],
    order: 'order_index',
  },
  categories: {
    table: 'categories',
    columns: ['code', 'name', 'icon', 'color', 'keywords', 'group_code', 'group_label', 'daily_limit', 'order_index'],
    required: ['code', 'name'],
    order: 'order_index, id',
  },
  news: {
    table: 'news',
    columns: ['title', 'summary', 'category', 'image', 'body', 'read_minutes', 'order_index', 'is_published'],
    required: ['title'],
    order: 'order_index, id',
  },
  savings_channels: {
    table: 'savings_channels',
    columns: ['name', 'logo', 'rates', 'order_index'],
    required: ['name'],
    order: 'order_index, id',
  },
  bank_interest_rates: {
    table: 'bank_interest_rates',
    columns: ['name', 'group_code', 'logo', 'rates', 'order_index'],
    required: ['name', 'group_code'],
    order: 'order_index, id',
  },
};

const FRAME_KINDS = ['text_image', 'slide', 'interactive', 'quiz'];
const CONTENT_TYPES = ['text', 'slides'];

function entity(name) {
  const spec = ENTITIES[name];
  if (!spec) throw notFound(`Không có loại dữ liệu "${name}"`);
  return spec;
}

/** Keeps only whitelisted columns and serialises frame payloads. */
function sanitize(spec, body, { partial = false } = {}) {
  const data = {};
  for (const column of spec.columns) {
    if (!(column in body)) continue;
    let value = body[column];
    if ((column === 'payload' || column === 'options' || column === 'rates') && typeof value === 'object' && value !== null) value = JSON.stringify(value);
    if (typeof value === 'boolean') value = value ? 1 : 0;
    data[column] = value;
  }
  if (!partial) {
    for (const field of spec.required || []) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        throw bad(`Thiếu trường bắt buộc: ${field}`);
      }
    }
  }
  if (spec.table === 'frames' && data.kind && !FRAME_KINDS.includes(data.kind)) {
    throw bad(`Loại frame không hợp lệ. Chọn một trong: ${FRAME_KINDS.join(', ')}`);
  }
  if (spec.table === 'lessons' && data.content_type && !CONTENT_TYPES.includes(data.content_type)) {
    throw bad(`Kiểu nội dung không hợp lệ. Chọn một trong: ${CONTENT_TYPES.join(', ')}`);
  }
  if (spec.table === 'module_questions' && data.options !== undefined) {
    const parsed = typeof data.options === 'string' ? JSON.parse(data.options) : data.options;
    if (!Array.isArray(parsed) || parsed.length < 2) throw bad('Câu hỏi cần ít nhất hai lựa chọn');
    if (!parsed.some((o) => o.correct)) throw bad('Hãy đánh dấu một đáp án đúng');
  }
  if (spec.table === 'badges' && data.rule_type && !BADGE_RULES[data.rule_type]) {
    throw bad(`Loại điều kiện huy hiệu không hợp lệ: ${data.rule_type}`);
  }
  if (spec.table === 'badges' && data.group_code && !BADGE_GROUPS.some((g) => g.code === data.group_code)) {
    throw bad(`Nhóm huy hiệu không hợp lệ: ${data.group_code}`);
  }
  if (spec.table === 'challenges') {
    if (data.rule_type && !CHALLENGE_RULES[data.rule_type]) throw bad(`Loại điều kiện thử thách không hợp lệ: ${data.rule_type}`);
    if (data.period && !CHALLENGE_PERIODS[data.period]) throw bad(`Kỳ thử thách không hợp lệ: ${data.period}`);
  }
  if ((spec.table === 'savings_channels' || spec.table === 'bank_interest_rates') && data.rates !== undefined) {
    const parsed = typeof data.rates === 'string' ? JSON.parse(data.rates) : data.rates;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || !Object.keys(parsed).length) {
      throw bad('Lãi suất cần là JSON dạng {"kỳ hạn tháng": lãi suất %/năm}, ví dụ {"6": 8, "12": 8.6}');
    }
    for (const [term, rate] of Object.entries(parsed)) {
      if (!Number.isFinite(Number(term)) || !Number.isFinite(Number(rate))) {
        throw bad('Mỗi kỳ hạn và lãi suất trong JSON phải là số');
      }
    }
  }
  if (spec.table === 'badges' || spec.table === 'challenges') checkRuleFields(spec.table, data);
  if (!Object.keys(data).length) throw bad('Không có trường nào để cập nhật');
  return data;
}

/** Điều kiện chỉ đếm được trong kỳ (ngày/tuần), và điều kiện chỉ đếm được trên toàn bộ dữ liệu. */
const WINDOW_ONLY_RULES = new Set(['quizzes_taken', 'expense_days', 'days_within_limits']);
const ONCE_ONLY_RULES = new Set(['goals_created', 'budgets_created']);

/**
 * Chặn số rỗng / âm (ô số để trống gửi lên `null`, đâm vào cột NOT NULL thành lỗi
 * 500), phạm vi trỏ tới mô đun / chức năng không có thật, và các cặp kỳ–điều kiện
 * của thử thách không bao giờ hoàn thành được. Với PATCH, `data` đã được gộp với
 * bản ghi hiện có rồi kiểm thêm một lượt (xem route PATCH bên dưới).
 */
function checkRuleFields(table, data) {
  const int = (key, min, label) => {
    if (!(key in data)) return;
    const n = Number(data[key]);
    if (data[key] === null || data[key] === '' || !Number.isInteger(n) || n < min) throw bad(`${label} phải là số nguyên từ ${min} trở lên`);
    data[key] = n;
  };
  int('rule_value', 1, 'Ngưỡng');
  int('xp_reward', 0, 'Thưởng XP');
  int('order_index', 0, 'Thứ tự');
  if ('rule_target' in data && data.rule_target) {
    const target = String(data.rule_target).trim();
    data.rule_target = target;
    if (data.rule_type === 'modules_completed' && !get('SELECT id FROM modules WHERE slug = ? OR CAST(id AS TEXT) = ?', target, target)) {
      throw bad(`Không có mô đun "${target}". Phạm vi của điều kiện này là slug của một mô đun.`);
    }
    if (data.rule_type === 'feature_used' && !get('SELECT id FROM features WHERE code = ?', target)) {
      throw bad(`Không có chức năng "${target}". Phạm vi của điều kiện này là mã chức năng.`);
    }
  }
  if (table === 'challenges' && data.period && data.rule_type) {
    if (data.period === 'once' && WINDOW_ONLY_RULES.has(data.rule_type)) {
      throw bad('Điều kiện này chỉ dùng cho thử thách hằng ngày / hằng tuần.');
    }
    if (data.period !== 'once' && ONCE_ONLY_RULES.has(data.rule_type)) {
      throw bad('Điều kiện này chỉ dùng cho chặng khởi đầu.');
    }
  }
}

const parseFrame = (row) => ({ ...row, payload: JSON.parse(row.payload || '{}') });
const parseQuestion = (row) => ({ ...row, options: JSON.parse(row.options || '[]') });
const parseSavingsChannel = (row) => ({ ...row, rates: JSON.parse(row.rates || '{}') });
const decode = (table, row) => {
  if (table === 'frames') return parseFrame(row);
  if (table === 'module_questions') return parseQuestion(row);
  if (table === 'savings_channels' || table === 'bank_interest_rates') return parseSavingsChannel(row);
  return row;
};

// ------------------------------------------------------- content helpers
/** The whole learning tree in one call, for the content tree in the portal. */
adminRouter.get('/api/admin/content/tree', () => all('SELECT * FROM modules ORDER BY order_index').map((m) => ({
  ...m,
  lessons: all('SELECT * FROM lessons WHERE module_id = ? ORDER BY order_index', m.id).map((l) => ({
    ...l,
    frameCount: get('SELECT COUNT(*) n FROM frames WHERE lesson_id = ?', l.id).n,
    slideCount: get("SELECT COUNT(*) n FROM frames WHERE lesson_id = ? AND kind = 'slide'", l.id).n,
  })),
  questions: all('SELECT * FROM module_questions WHERE module_id = ? ORDER BY order_index', m.id).map(parseQuestion),
})));

adminRouter.get('/api/admin/meta/options', () => ({
  badgeRules: BADGE_RULES,
  badgeGroups: BADGE_GROUPS,
  challengeRules: CHALLENGE_RULES,
  challengePeriods: CHALLENGE_PERIODS,
  features: all('SELECT code, name FROM features ORDER BY order_index'),
  frameKinds: FRAME_KINDS,
  contentTypes: CONTENT_TYPES,
  slideAspectRatio: '1:1.371',
  levels: all('SELECT id, order_index, name FROM levels ORDER BY order_index'),
  modules: all('SELECT id, title, slug, order_index FROM modules ORDER BY order_index'),
  categories: all('SELECT id, code, name, icon FROM categories ORDER BY order_index'),
}));

// --------------------------------------------------------------- uploads
const ALLOWED_IMAGE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MAX_UPLOAD_BYTES = 1_500_000;

/**
 * Base64 data-URL upload. Avoids a multipart parser dependency, and the admin
 * portal is the only client.
 */
adminRouter.post('/api/admin/upload', async ({ body }) => {
  if (config.ephemeral) throw bad('Bản demo trực tuyến không lưu được ảnh tải lên. Hãy tải ảnh ở bản chạy trên máy.');
  const match = /^data:([^;]+);base64,(.+)$/s.exec(String(body.dataUrl || ''));
  if (!match) throw bad('Cần gửi ảnh dưới dạng data URL base64');

  const extension = ALLOWED_IMAGE[match[1]];
  if (!extension) throw bad(`Định dạng không hỗ trợ. Chấp nhận: ${Object.keys(ALLOWED_IMAGE).join(', ')}`);

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) throw bad('Ảnh vượt quá 1,5 MB. Hãy nén lại trước khi tải lên.');

  const safeName = String(body.filename || 'anh')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'anh';
  const filename = `${safeName}-${randomUUID().slice(0, 8)}.${extension}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, filename), buffer);
  return { url: `/assets/uploads/${filename}`, bytes: buffer.length };
});

// ------------------------------------------------------------ dashboard
/** Danh sách công ty (theo users.employer) cho ô lọc ở Bảng điều khiển / Sử dụng AI. */
adminRouter.get('/api/admin/stats/companies', () => companyList());

adminRouter.get('/api/admin/stats/overview', ({ url }) => programOverview(companyScope(url.searchParams.get('employer'))));

adminRouter.get('/api/admin/stats/users', ({ url }) => adminUserSummary(companyScope(url.searchParams.get('employer'))));

// --- đăng ký nội bộ (services/localAuth.js) --------------------------------
adminRouter.get('/api/admin/settings/signup', () => signupSettings());
adminRouter.put('/api/admin/settings/signup', ({ body }) => {
  const result = updateSignupSettings({ open: body?.open, code: body?.code });
  if (result.error) throw bad(result.error);
  return result;
});

/** Quên mật khẩu (chưa có gửi email): Admin tạo mật khẩu tạm, hiện đúng một lần. */
adminRouter.post('/api/admin/members/:id/reset-password', ({ params }) => {
  const result = resetPassword(params.id);
  if (result.error) throw bad(result.error);
  return result;
});

/** Cấp / bỏ quyền quản trị. Không tự bỏ quyền của chính mình (tránh khoá hết Admin). */
adminRouter.post('/api/admin/members/:id/role', ({ user, params, body }) => {
  const id = Number(params.id);
  const role = body?.role === 'admin' ? 'admin' : body?.role === 'member' ? 'member' : null;
  if (!role) throw bad('Vai trò không hợp lệ');
  if (id === user.id && role !== 'admin') throw bad('Không tự bỏ quyền quản trị của chính mình');
  const info = run('UPDATE users SET role = ? WHERE id = ?', role, id);
  if (!info.changes) throw bad('Không tìm thấy người này');
  return { ok: true, role };
});

// ---------------------------------------------------------- XP học tập
/** XP mỗi bài học hoàn tất và mỗi lần đầu hoàn thành bài test mô đun (trang Chức năng). */
adminRouter.get('/api/admin/settings/learning-xp', () => learningXp());

adminRouter.put('/api/admin/settings/learning-xp', ({ body }) => {
  for (const key of Object.keys(LEARNING_XP_KEYS)) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < 0) throw bad('XP phải là số nguyên từ 0 trở lên');
    setSetting(LEARNING_XP_KEYS[key], String(n));
  }
  return learningXp();
});

// ------------------------------------------------------- XP từ Dream Team
adminRouter.get('/api/admin/settings/team-xp', () => ({ percent: teamXpShare() }));

adminRouter.put('/api/admin/settings/team-xp', ({ body }) => {
  const n = Number(body?.percent);
  if (body?.percent === '' || body?.percent === null || !Number.isInteger(n) || n < 0 || n > 100) {
    throw bad('% XP từ Dream Team phải là số nguyên từ 0 đến 100');
  }
  setSetting(TEAM_XP_SHARE_KEY, String(n));
  return { percent: teamXpShare() };
});

// -------------------------------------------------------------------- AI
/** Giới hạn lượt AI mỗi người mỗi ngày, số liệu dùng AI hôm nay và câu hỏi bị từ chối. */
const aiBoard = (scope = companyScope(null)) => ({
  keyState: keyState(),
  model: config.anthropicModel,
  dailyLimit: aiDailyLimit(),
  employer: scope.employer,
  usage: aiUsageToday(undefined, scope),
  outOfScope: recentOutOfScope(30, scope),
});

adminRouter.get('/api/admin/settings/ai', ({ url }) => aiBoard(companyScope(url.searchParams.get('employer'))));

adminRouter.put('/api/admin/settings/ai', ({ body }) => {
  const n = Number(body.dailyLimit);
  if (!Number.isInteger(n) || n < 0 || n > 1000) throw bad('Giới hạn lượt AI phải là số nguyên từ 0 đến 1000 (0 = không giới hạn)');
  setSetting('ai_daily_limit', String(n));
  return aiBoard();
});

// ------------------------------------------------------------- dùng AI (token)
/** Token & chi phí AI theo người dùng, tính năng, ngày — trang "Sử dụng AI". */
adminRouter.get('/api/admin/ai-usage', ({ url }) => aiUsageReport({
  days: url.searchParams.get('days') || 30,
  scope: companyScope(url.searchParams.get('employer')),
}));

adminRouter.put('/api/admin/settings/usd-vnd', ({ body }) => {
  const n = Number(body.rate);
  if (!Number.isFinite(n) || n < 1000 || n > 100000) throw bad('Tỷ giá USD/VND phải trong khoảng 1.000–100.000');
  setSetting('usd_vnd_rate', String(Math.round(n)));
  return { rate: Math.round(n) };
});

// ------------------------------------------------------------------ concept
/**
 * Concept giao diện của màn Khám phá. Chỉ một concept được bật tại một thời
 * điểm, nên đây là một lựa chọn đơn chứ không phải danh sách bật/tắt từng cái.
 */
adminRouter.get('/api/admin/concepts', () => conceptBoard());

adminRouter.put('/api/admin/concepts/active', ({ body }) => {
  const code = String(body.code || '');
  if (!conceptBoard().some((c) => c.code === code)) throw bad(`Không có concept ${code}`);
  setActiveConcept(code);
  return conceptBoard();
});

// ------------------------------------------------------------------ CRUD
adminRouter.get('/api/admin/:entity', ({ params, url }) => {
  const spec = entity(params.entity);
  const filters = [];
  const args = [];
  for (const [key, value] of url.searchParams) {
    if (!spec.columns.includes(key)) continue;
    filters.push(`${key} = ?`);
    args.push(value);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = all(`SELECT * FROM ${spec.table} ${where} ORDER BY ${spec.order}`, ...args);
  return rows.map((r) => decode(spec.table, r));
});

adminRouter.get('/api/admin/:entity/:id', ({ params }) => {
  const spec = entity(params.entity);
  const row = get(`SELECT * FROM ${spec.table} WHERE id = ?`, Number(params.id));
  if (!row) throw notFound('Không tìm thấy bản ghi');
  return decode(spec.table, row);
});

/**
 * Mã nội bộ của huy hiệu / thử thách: Admin không nhập, server tự sinh từ tên
 * hiển thị (bỏ dấu, nối bằng gạch dưới) và thêm số nếu trùng. Mã không đổi khi
 * sửa tên, vì nhật ký hoạt động và đường dẫn nhận thưởng trỏ vào nó.
 */
function uniqueCode(table, name) {
  const base = String(name || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'muc';
  let code = base;
  for (let n = 2; get(`SELECT id FROM ${table} WHERE code = ?`, code); n += 1) code = `${base}_${n}`;
  return code;
}

adminRouter.post('/api/admin/:entity', ({ params, body }) => {
  const spec = entity(params.entity);
  if ((spec.table === 'badges' || spec.table === 'challenges') && !body.code) body = { ...body, code: uniqueCode(spec.table, body.name) };
  const data = sanitize(spec, body);
  const columns = Object.keys(data);
  const info = run(
    `INSERT INTO ${spec.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    ...columns.map((c) => data[c]),
  );
  const row = get(`SELECT * FROM ${spec.table} WHERE id = ?`, Number(info.lastInsertRowid));
  return decode(spec.table, row);
});

adminRouter.patch('/api/admin/:entity/:id', ({ params, body }) => {
  const spec = entity(params.entity);
  const id = Number(params.id);
  if (!get(`SELECT id FROM ${spec.table} WHERE id = ?`, id)) throw notFound('Không tìm thấy bản ghi');

  // Huy hiệu / thử thách: gộp với bản ghi hiện có để kiểm được cặp kỳ–điều kiện
  // cả khi PATCH chỉ đổi một trường.
  const current = spec.table === 'badges' || spec.table === 'challenges'
    ? get(`SELECT * FROM ${spec.table} WHERE id = ?`, id) : null;
  if (current) {
    sanitize(spec, { ...current, ...body });
  }
  const data = sanitize(spec, body, { partial: true });
  const columns = Object.keys(data);
  run(
    `UPDATE ${spec.table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    ...columns.map((c) => data[c]), id,
  );
  const row = get(`SELECT * FROM ${spec.table} WHERE id = ?`, id);
  return decode(spec.table, row);
});

adminRouter.delete('/api/admin/:entity/:id', ({ params }) => {
  const spec = entity(params.entity);
  const id = Number(params.id);
  if (!get(`SELECT id FROM ${spec.table} WHERE id = ?`, id)) throw notFound('Không tìm thấy bản ghi');
  run(`DELETE FROM ${spec.table} WHERE id = ?`, id);
  return { ok: true, id };
});

/** Drag-and-drop reordering: one transaction for the whole list. */
adminRouter.post('/api/admin/:entity/reorder', ({ params, body }) => {
  const spec = entity(params.entity);
  if (!spec.columns.includes('order_index')) throw bad('Loại dữ liệu này không sắp xếp được');
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) throw bad('Danh sách ids trống');

  tx(() => {
    ids.forEach((id, index) => run(`UPDATE ${spec.table} SET order_index = ? WHERE id = ?`, index + 1, id));
  });
  return all(`SELECT * FROM ${spec.table} ORDER BY ${spec.order}`);
});
