/**
 * Theo dõi token AI (Claude) từng người dùng — cho trang Admin "Sử dụng AI".
 *
 * Mỗi lượt gọi đã có một dòng `ai_calls` (services/aiQuota.js · takeAiCall, để
 * giới hạn lượt mỗi ngày). Gọi Claude xong, `recordAiUsage` ghi thêm vào đúng
 * dòng đó: model thực chạy, token vào / ra / cache, và chi phí ước tính theo
 * bảng giá dưới đây. Lượt gọi lỗi / hết giờ thì dòng giữ token trống (vẫn đếm
 * lượt — giới hạn lượt tính cả lượt lỗi).
 *
 * Chỉ lưu số đếm, không lưu nội dung người dùng hỏi hay Claude trả lời.
 */
import { all, get, getSetting, run } from '../db.js';
import { dayKey } from '../lib/time.js';
import { aiDailyLimit } from './aiQuota.js';

/**
 * Giá USD cho mỗi 1 triệu token (bảng giá công khai của Anthropic, 10/2026).
 * cacheWrite = ghi cache 5 phút (1,25 × giá vào). Model lạ thì tính theo giá
 * Sonnet 5.5 và đánh dấu "ước tính".
 */
const PRICES = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};
const FALLBACK_PRICE = PRICES['claude-sonnet-5-5'];

/** Bảng giá của một model; model có hậu tố ngày (vd claude-haiku-4-5-2025…) vẫn khớp. */
export function priceOf(model) {
  const id = String(model || '');
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => id === k || id.startsWith(`${k}-`));
  return key ? { ...PRICES[key], known: true } : { ...FALLBACK_PRICE, known: false };
}

export function costUsd(model, { input = 0, output = 0, cacheRead = 0, cacheWrite = 0 }) {
  const p = priceOf(model);
  return (input * p.input + output * p.output + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite) / 1e6;
}

/**
 * Ghi token của một lượt gọi vào dòng `ai_calls` đã giữ trước đó.
 * @param {number|boolean} callId  giá trị takeAiCall trả về (true = không đếm, bỏ qua)
 * @param {object} payload         JSON trả về của POST /v1/messages
 */
export function recordAiUsage(callId, payload) {
  if (typeof callId !== 'number' || !payload?.usage) return;
  const u = payload.usage;
  const tokens = {
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
  };
  run(
    `UPDATE ai_calls SET model = ?, input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_write_tokens = ?, cost_usd = ?
      WHERE id = ?`,
    payload.model || null, tokens.input, tokens.output, tokens.cacheRead, tokens.cacheWrite, costUsd(payload.model, tokens), callId,
  );
}

// --- báo cáo cho Admin -----------------------------------------------------

export const DEFAULT_USD_VND = 26000;
export function usdVndRate() {
  const n = Number(getSetting('usd_vnd_rate'));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USD_VND;
}

function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Phân vị (0–1) của một dãy đã sắp tăng dần, nội suy tuyến tính. */
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Mức dùng so với những người cùng có dùng AI trong kỳ (theo chi phí):
 * - rat_nhieu: ≥ 3 lần trung vị, hoặc thuộc 10% cao nhất (khi có từ 10 người)
 * - nhieu: từ phân vị 75 trở lên
 * - it: từ phân vị 25 trở xuống
 * - trung_binh: còn lại
 */
function classify(cost, t, n) {
  if (n >= 2 && t.median > 0 && cost >= 3 * t.median) return 'rat_nhieu';
  if (n >= 10 && cost >= t.p90) return 'rat_nhieu';
  if (n >= 4 && cost >= t.p75) return 'nhieu';
  if (n >= 4 && cost <= t.p25) return 'it';
  return 'trung_binh';
}

const SUMS = `COUNT(*) calls,
  SUM(CASE WHEN input_tokens IS NOT NULL THEN 1 ELSE 0 END) measured,
  COALESCE(SUM(input_tokens), 0) input, COALESCE(SUM(output_tokens), 0) output,
  COALESCE(SUM(cache_read_tokens), 0) cacheRead, COALESCE(SUM(cache_write_tokens), 0) cacheWrite,
  COALESCE(SUM(cost_usd), 0) cost`;

/** Báo cáo dùng AI trong `days` ngày gần nhất (tính cả hôm nay). */
export function aiUsageReport({ days = 30, today = dayKey(), scope = { employer: null, where: () => '1 = 1', params: [] } } = {}) {
  const span = Math.max(1, Math.min(365, Math.round(Number(days)) || 30));
  const from = shiftDay(today, -(span - 1));
  const limit = aiDailyLimit();
  // Lọc theo công ty (companyScope): mọi truy vấn chỉ lấy lượt gọi của người thuộc công ty đó.
  const sc = scope.where('user_id');
  const scA = scope.where('a.user_id');
  const sp = scope.params;

  const totals = get(`SELECT ${SUMS}, COUNT(DISTINCT user_id) users FROM ai_calls WHERE day BETWEEN ? AND ? AND ${sc}`, from, today, ...sp);
  const byKind = all(`SELECT kind, ${SUMS} FROM ai_calls WHERE day BETWEEN ? AND ? AND ${sc} GROUP BY kind ORDER BY cost DESC, calls DESC`, from, today, ...sp);
  const byModel = all(
    `SELECT model, ${SUMS} FROM ai_calls WHERE day BETWEEN ? AND ? AND ${sc} AND model IS NOT NULL GROUP BY model ORDER BY cost DESC`,
    from, today, ...sp,
  ).map((m) => ({ ...m, priceKnown: priceOf(m.model).known }));

  const dailyRows = new Map(all(
    `SELECT day, ${SUMS}, COUNT(DISTINCT user_id) users FROM ai_calls WHERE day BETWEEN ? AND ? AND ${sc} GROUP BY day`,
    from, today, ...sp,
  ).map((d) => [d.day, d]));
  const daily = [];
  for (let i = 0; i < span; i += 1) {
    const day = shiftDay(from, i);
    const d = dailyRows.get(day);
    daily.push({ day, calls: d?.calls || 0, users: d?.users || 0, tokens: d ? d.input + d.output + d.cacheRead + d.cacheWrite : 0, cost: d?.cost || 0 });
  }

  const userRows = all(
    `SELECT a.user_id id, u.name, u.email, u.employer, ${SUMS},
            COUNT(DISTINCT a.day) activeDays, MAX(a.created_at) lastAt
       FROM ai_calls a JOIN users u ON u.id = a.user_id
      WHERE a.day BETWEEN ? AND ? AND ${scA}
      GROUP BY a.user_id`,
    from, today, ...sp,
  );
  const kindsByUser = new Map();
  for (const r of all(
    `SELECT user_id, kind, COUNT(*) calls, COALESCE(SUM(cost_usd), 0) cost FROM ai_calls WHERE day BETWEEN ? AND ? AND ${sc} GROUP BY user_id, kind`,
    from, today, ...sp,
  )) {
    if (!kindsByUser.has(r.user_id)) kindsByUser.set(r.user_id, []);
    kindsByUser.get(r.user_id).push({ kind: r.kind, calls: r.calls, cost: r.cost });
  }
  const limitDays = new Map(limit ? all(
    `SELECT user_id, COUNT(*) n FROM (SELECT user_id, day FROM ai_calls WHERE day BETWEEN ? AND ? AND ${sc} GROUP BY user_id, day HAVING COUNT(*) >= ?) GROUP BY user_id`,
    from, today, ...sp, limit,
  ).map((r) => [r.user_id, r.n]) : []);

  const sortedCost = userRows.map((u) => u.cost).sort((a, b) => a - b);
  const thresholds = {
    p25: quantile(sortedCost, 0.25),
    median: quantile(sortedCost, 0.5),
    p75: quantile(sortedCost, 0.75),
    p90: quantile(sortedCost, 0.9),
  };
  const users = userRows.map((u) => {
    const tokens = u.input + u.output + u.cacheRead + u.cacheWrite;
    return {
      ...u,
      tokens,
      avgTokens: u.measured ? Math.round(tokens / u.measured) : 0,
      share: totals.cost > 0 ? u.cost / totals.cost : 0,
      limitDays: limitDays.get(u.id) || 0,
      byKind: kindsByUser.get(u.id) || [],
      level: classify(u.cost, thresholds, userRows.length),
    };
  }).sort((a, b) => b.cost - a.cost || b.calls - a.calls);

  return {
    days: span, from, to: today, limit, usdVnd: usdVndRate(), employer: scope.employer,
    totals: { ...totals, tokens: totals.input + totals.output + totals.cacheRead + totals.cacheWrite },
    byKind, byModel, daily, thresholds, users,
  };
}
