/**
 * Giới hạn lượt gọi AI mỗi người mỗi ngày, dùng chung cho mọi tính năng gọi
 * Claude (Ekko bot, ghi nhanh, đọc hoá đơn, tư vấn mục tiêu). Hết lượt thì
 * tính năng đó dùng phần viết sẵn (bộ đọc, công thức, câu trả lời cố định), chỉ
 * riêng đọc hoá đơn là báo người dùng nhập tay.
 *
 * Admin đặt giới hạn ở trang Chức năng (setting `ai_daily_limit`, 0 = không
 * giới hạn). Mỗi lượt gọi ghi một dòng `ai_calls` — đếm theo ngày giờ Việt Nam.
 */
import { all, get, getSetting, run } from '../db.js';
import { dayKey, nowIso } from '../lib/time.js';

export const DEFAULT_AI_DAILY_LIMIT = 30;

export function aiDailyLimit() {
  const raw = getSetting('ai_daily_limit');
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 0 ? n : DEFAULT_AI_DAILY_LIMIT;
}

export function aiCallsToday(userId, day = dayKey()) {
  return get('SELECT COUNT(*) n FROM ai_calls WHERE user_id = ? AND day = ?', userId, day).n;
}

/**
 * Giữ một lượt gọi AI cho người dùng. Trả về false nếu đã hết lượt hôm nay
 * (khi đó KHÔNG gọi AI); còn lượt thì trả về id dòng `ai_calls` vừa ghi — đưa id
 * này cho recordAiUsage (services/aiUsage.js) sau khi gọi xong để ghi token.
 * Không có userId (vd. kiểm thử nội bộ) thì không đếm, trả về true.
 */
export function takeAiCall(userId, kind) {
  if (!userId) return true;
  const limit = aiDailyLimit();
  if (limit && aiCallsToday(userId) >= limit) return false;
  const info = run('INSERT INTO ai_calls (user_id, day, kind, created_at) VALUES (?,?,?,?)', userId, dayKey(), kind, nowIso());
  return Number(info.lastInsertRowid);
}

// --- câu hỏi ngoài phạm vi của Ekko bot ------------------------------------

/** Ghi lại câu bot từ chối vì ngoài phạm vi — chỉ nội dung, không gắn tên người hỏi khi đọc ra. */
export function logOutOfScope(userId, text) {
  run('INSERT INTO ai_out_of_scope (user_id, text, created_at) VALUES (?,?,?)', userId, String(text).slice(0, 300), nowIso());
}

/** @param {object} [scope] companyScope(...) — chỉ câu của người thuộc một công ty. */
export function recentOutOfScope(limit = 50, scope = { where: () => '1 = 1', params: [] }) {
  return all(`SELECT id, text, created_at FROM ai_out_of_scope WHERE ${scope.where('user_id')} ORDER BY id DESC LIMIT ?`, ...scope.params, limit);
}

/** Số liệu cho Admin: lượt gọi hôm nay theo tính năng, số người đã chạm giới hạn. */
export function aiUsageToday(day = dayKey(), scope = { where: () => '1 = 1', params: [] }) {
  const limit = aiDailyLimit();
  const sc = scope.where('user_id');
  const sp = scope.params;
  return {
    limit,
    calls: get(`SELECT COUNT(*) n FROM ai_calls WHERE day = ? AND ${sc}`, day, ...sp).n,
    byKind: all(`SELECT kind, COUNT(*) n FROM ai_calls WHERE day = ? AND ${sc} GROUP BY kind ORDER BY n DESC`, day, ...sp),
    usersAtLimit: limit
      ? get(`SELECT COUNT(*) n FROM (SELECT user_id FROM ai_calls WHERE day = ? AND ${sc} GROUP BY user_id HAVING COUNT(*) >= ?)`, day, ...sp, limit).n
      : 0,
  };
}
