/**
 * Quỹ tiết kiệm Ekko.
 *
 * Hai cách một "nguồn tiết kiệm" xuất hiện trong `savings_sources`:
 * - `manual`: người dùng tự thêm tay (số tiền, tên kênh tự gõ, lãi suất %/tháng
 *   hoặc %/năm) — không gắn với `savings_channels` nào cả.
 * - `ekko`: gửi qua "Tiết kiệm cùng Ekko", chọn kỳ hạn + một đối tác trong
 *   `savings_channels`, lãi suất lấy đúng từ bảng đó tại thời điểm gửi (đổi
 *   lãi suất sau này không làm trôi các khoản đã gửi).
 * - `recap`: chấp nhận banner "tiền còn lại tháng trước", số tiền = thu nhập
 *   trừ tổng chi của tháng đó.
 *
 * Không có dòng tiền thật nào bị trừ ở đâu — đây chỉ là ghi chép để theo dõi
 * lãi dự kiến, giống cách `goals`/`budget_limits` không đụng tới một ví tiền
 * thật nào trong app này.
 */
import { all, get, run } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { dayKey, monthKey, nowIso, shiftMonth } from '../lib/time.js';
import { monthIncome } from './monthIncome.js';

const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const RATE_PERIODS = { month: 'Theo tháng', year: 'Theo năm' };

/** Quy về %/năm để so sánh táo với táo, dù nguồn nhập %/tháng hay %/năm. */
const annualRate = (ratePercent, ratePeriod) => (ratePeriod === 'month' ? ratePercent * 12 : ratePercent);

/**
 * Lãi đơn dự kiến — không phải lãi nhập gốc kiểu ngân hàng thật, chỉ đủ để
 * người dùng ước lượng, giống cách "Ekko tính giúp bạn" ở Mục tiêu tài chính
 * không mô phỏng lãi suất kép.
 */
export function projectedInterest(amount, ratePercent, ratePeriod, termMonths) {
  // `0` là một số THÁNG HỢP LỆ (vừa mở hôm nay, chưa tích luỹ lãi ngày nào) —
  // `termMonths && ...` coi 0 là falsy nên từng lặng lẽ rơi về mặc định 12
  // tháng, biến "vừa mở hôm nay" thành "lãi cả năm". Phải kiểm tra kiểu số
  // tường minh để 0 không bị đánh đồng với "không truyền gì".
  const months = Number.isFinite(termMonths) && termMonths >= 0 ? termMonths : 12;
  return Math.round(amount * (annualRate(ratePercent, ratePeriod) / 100) * (months / 12));
}

/** Cộng tháng trên chuỗi YYYY-MM-DD, giữ nguyên ngày trong tháng (kẹp lại nếu
 * tháng đích ngắn hơn) — không lệ thuộc múi giờ thiết bị. */
function addMonthsToDay(day, months) {
  const [y, m, d] = day.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Số tháng ĐẦY ĐỦ đã trôi qua giữa hai chuỗi YYYY-MM-DD, tối thiểu 0. */
function monthsBetween(from, to) {
  if (!from || to < from) return 0;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, months);
}

function parseChannel(row) {
  return { ...row, rates: JSON.parse(row.rates || '{}') };
}

export function savingsChannels(termMonths) {
  const rows = all('SELECT * FROM savings_channels ORDER BY order_index, id').map(parseChannel);
  return rows
    .map((c) => ({
      id: c.id,
      name: c.name,
      logo: c.logo,
      ratePercent: c.rates[String(termMonths)] ?? null,
    }))
    .filter((c) => c.ratePercent != null)
    .sort((a, b) => b.ratePercent - a.ratePercent);
}

/** Kỳ hạn có ít nhất một đối tác báo giá — dựng thanh chọn kỳ hạn phía client. */
export function savingsTerms() {
  const rows = all('SELECT rates FROM savings_channels').map((r) => JSON.parse(r.rates || '{}'));
  const terms = new Set();
  for (const rates of rows) for (const term of Object.keys(rates)) terms.add(Number(term));
  return [...terms].sort((a, b) => a - b);
}

/**
 * Lãi trả khi ĐÁO HẠN, như sổ tiết kiệm có kỳ hạn: trước ngày kết thúc khoản vẫn
 * chỉ là tiền gốc (người dùng có thể phá sổ giữa chừng, khi đó không có lãi kỳ
 * hạn); tới ngày kết thúc thì lãi của cả kỳ (lãi đơn: gốc × %/năm × số tháng / 12)
 * mới được cộng vào khoản.
 *
 * - `termMonths`: kỳ hạn (term_months, hoặc số tháng từ started_on tới ended_on).
 * - `maturityInterest`: lãi sẽ nhận khi đáo hạn · `maturityOn`: ngày đáo hạn.
 * - `matured`: đã tới ngày đáo hạn → `balance` = gốc + lãi, `interestToDate` = lãi.
 * - Khoản không có ngày kết thúc thì không có lãi kỳ hạn; `interestPerYear` là
 *   lãi tham khảo nếu gửi đủ 12 tháng.
 */
function sourcePayload(row) {
  const today = dayKey();
  const termMonths = row.term_months
    || (row.started_on && row.ended_on ? monthsBetween(row.started_on, row.ended_on) : null);
  // Kỳ hạn theo tháng (gửi cùng Ekko) tính theo tháng; khoản tự nhập tính theo
  // SỐ NGÀY gửi thật (gốc × %/năm × ngày / 365) — kỳ 25 ngày hay 30/1 → 30/7
  // không bị làm tròn mất lãi.
  const days = row.started_on && row.ended_on
    ? Math.round((Date.parse(`${row.ended_on}T00:00:00Z`) - Date.parse(`${row.started_on}T00:00:00Z`)) / 86_400_000)
    : 0;
  let maturityInterest = null;
  if (row.rate_percent > 0 && row.term_months) {
    maturityInterest = projectedInterest(row.amount, row.rate_percent, row.rate_period, row.term_months);
  } else if (row.rate_percent > 0 && days > 0) {
    maturityInterest = Math.round(row.amount * (annualRate(row.rate_percent, row.rate_period) / 100) * (days / 365));
  }
  const matured = Boolean(row.ended_on && row.ended_on <= today && maturityInterest !== null);
  const interestToDate = matured ? maturityInterest : 0;
  return {
    ...row,
    termMonths,
    maturityOn: row.ended_on || null,
    maturityInterest,
    matured,
    balance: row.amount + interestToDate,
    interestToDate,
    // Giữ cho client cũ: số tháng đã gửi tính tới hôm nay (hoặc tới ngày đáo hạn).
    monthsElapsed: row.started_on ? monthsBetween(row.started_on, matured ? row.ended_on : today) : 0,
    interestPerYear: projectedInterest(row.amount, row.rate_percent, row.rate_period, 12),
  };
}

// Nguồn "out" (rút tiết kiệm/vay) trừ khỏi tổng — CẢ gốc lẫn lãi, vì lãi của
// một khoản vay là lãi mình phải trả thêm, không phải lãi mình được hưởng.
const signed = (source, amount) => (source.direction === 'out' ? -amount : amount);

export function savingsPayload(userId) {
  const sources = all('SELECT * FROM savings_sources WHERE user_id = ? ORDER BY created_at DESC, id DESC', userId).map(sourcePayload);
  const totalSaved = sources.reduce((sum, s) => sum + signed(s, s.amount), 0);
  const totalBalance = sources.reduce((sum, s) => sum + signed(s, s.balance), 0);
  const totalInterestPerYear = sources.reduce((sum, s) => sum + signed(s, s.interestPerYear), 0);
  const totalInterestToDate = sources.reduce((sum, s) => sum + signed(s, s.interestToDate), 0);
  // Lãi còn chờ ngày đáo hạn của các khoản chưa tới hạn.
  const totalPendingInterest = sources.reduce((sum, s) => sum + (s.matured ? 0 : signed(s, s.maturityInterest || 0)), 0);
  return {
    sources,
    // `saved`: tổng gốc · `balance`: tổng hiện có (gồm lãi của khoản đã đáo hạn)
    // · `pendingInterest`: lãi sẽ nhận khi các khoản còn lại đáo hạn.
    totals: {
      saved: totalSaved, balance: totalBalance, interestPerYear: totalInterestPerYear,
      interestToDate: totalInterestToDate, pendingInterest: totalPendingInterest, count: sources.length,
    },
    ratePeriods: RATE_PERIODS,
  };
}

/** `undefined` giữ nguyên giá trị cũ khi sửa; chuỗi rỗng xoá hẳn (mở kỳ hạn). */
function resolveDay(value, fallback) {
  if (value === undefined) return fallback;
  if (!value) return null;
  if (!DAY_RE.test(value)) throw bad('Ngày phải có dạng YYYY-MM-DD');
  return value;
}

export function createManualSource(userId, body) {
  const channelName = String(body.channelName || '').trim();
  if (!channelName) throw bad('Hãy đặt tên khoản');
  if (channelName.length > 80) throw bad('Tên quá dài');
  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw bad('Số tiền phải là một số dương');
  const ratePercent = Number(body.ratePercent) || 0;
  if (ratePercent < 0 || ratePercent > 100) throw bad('Lãi suất không hợp lệ');
  const ratePeriod = body.ratePeriod === 'month' ? 'month' : 'year';
  const direction = body.direction === 'out' ? 'out' : 'in';
  const startedOn = resolveDay(body.startedOn, dayKey());
  const endedOn = resolveDay(body.endedOn, null);
  if (endedOn && startedOn && endedOn < startedOn) throw bad('Ngày kết thúc phải sau ngày bắt đầu');

  const info = run(
    `INSERT INTO savings_sources (user_id, channel_name, amount, rate_percent, rate_period, started_on, ended_on, direction, source, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,'manual',?,?)`,
    userId, channelName, amount, ratePercent, ratePeriod, startedOn, endedOn, direction,
    body.note ? String(body.note).slice(0, 200) : null, nowIso(),
  );
  return get('SELECT * FROM savings_sources WHERE id = ?', Number(info.lastInsertRowid));
}

export function updateSavingsSource(userId, id, body) {
  const row = get('SELECT * FROM savings_sources WHERE id = ? AND user_id = ?', Number(id), userId);
  if (!row) throw notFound('Không tìm thấy khoản này');
  const amount = body.amount !== undefined ? Math.round(Number(body.amount)) : row.amount;
  if (!Number.isFinite(amount) || amount <= 0) throw bad('Số tiền phải là một số dương');
  const startedOn = resolveDay(body.startedOn, row.started_on);
  const endedOn = resolveDay(body.endedOn, row.ended_on);
  if (endedOn && startedOn && endedOn < startedOn) throw bad('Ngày kết thúc phải sau ngày bắt đầu');

  // Đổi ngày thì kỳ hạn tháng cũ (gửi cùng Ekko) không còn đúng: bỏ, tính lại theo ngày.
  const termMonths = startedOn === row.started_on && endedOn === row.ended_on ? row.term_months : null;
  run(
    `UPDATE savings_sources SET channel_name = ?, amount = ?, rate_percent = ?, rate_period = ?, started_on = ?, ended_on = ?, direction = ?, note = ?, term_months = ? WHERE id = ?`,
    body.channelName ? String(body.channelName).trim() : row.channel_name,
    amount,
    body.ratePercent !== undefined ? Number(body.ratePercent) || 0 : row.rate_percent,
    body.ratePeriod === 'month' || body.ratePeriod === 'year' ? body.ratePeriod : row.rate_period,
    startedOn, endedOn,
    body.direction === 'in' || body.direction === 'out' ? body.direction : row.direction,
    body.note !== undefined ? (body.note ? String(body.note).slice(0, 200) : null) : row.note,
    termMonths,
    row.id,
  );
  return get('SELECT * FROM savings_sources WHERE id = ?', row.id);
}

export function deleteSavingsSource(userId, id) {
  const row = get('SELECT * FROM savings_sources WHERE id = ? AND user_id = ?', Number(id), userId);
  if (!row) throw notFound('Không tìm thấy nguồn tiết kiệm này');
  run('DELETE FROM savings_sources WHERE id = ?', row.id);
}

/** "Tiếp tục" ở màn Gửi tiết kiệm cùng Ekko — lãi suất chốt tại thời điểm gửi. */
export function createEkkoDeposit(userId, body) {
  const channel = get('SELECT * FROM savings_channels WHERE id = ?', Number(body.channelId));
  if (!channel) throw notFound('Không tìm thấy đối tác tiết kiệm này');
  const termMonths = Math.round(Number(body.termMonths));
  const rates = JSON.parse(channel.rates || '{}');
  const ratePercent = rates[String(termMonths)];
  if (ratePercent == null) throw bad('Đối tác này không có lãi suất cho kỳ hạn này');
  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw bad('Số tiền phải là một số dương');
  const startedOn = dayKey();

  const info = run(
    `INSERT INTO savings_sources (user_id, channel_name, amount, rate_percent, rate_period, term_months, started_on, ended_on, source, created_at)
     VALUES (?,?,?,?,'year',?,?,?,'ekko',?)`,
    userId, channel.name, amount, ratePercent, termMonths, startedOn, addMonthsToDay(startedOn, termMonths), nowIso(),
  );
  return get('SELECT * FROM savings_sources WHERE id = ?', Number(info.lastInsertRowid));
}

/**
 * Banner đầu tháng mới: tháng vừa kết thúc có thu nhập tự nhập VÀ chi tiêu
 * thấp hơn thu nhập thì mới có gì để hỏi — không có thu nhập thì không biết
 * "còn lại" là bao nhiêu, không thể gợi ý mù. Cùng khuôn với `budgetRecap`.
 */
export function savingsRecap(userId) {
  const month = shiftMonth(monthKey(), -1);
  // Thu nhập đã ghi (nút "Thu nhập") hoặc con số tự gõ — xem services/monthIncome.js.
  const income = monthIncome(userId, month);
  const dismissed = Boolean(get(
    'SELECT 1 AS x FROM savings_recap_dismissed WHERE user_id = ? AND month = ?', userId, month,
  ));
  if (!income || income.amount <= 0) return { month, hasData: false, remaining: 0, dismissed };

  const spent = get(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND spent_on LIKE ?",
    userId, `${month}%`,
  ).total;
  const remaining = income.amount - spent;
  return { month, hasData: remaining > 0, remaining: Math.max(0, remaining), dismissed };
}

export function dismissSavingsRecap(userId, month) {
  if (!MONTH_RE.test(month)) throw bad('Tháng phải có dạng YYYY-MM');
  run(
    `INSERT INTO savings_recap_dismissed (user_id, month, dismissed_at) VALUES (?,?,?)
     ON CONFLICT(user_id, month) DO UPDATE SET dismissed_at = excluded.dismissed_at`,
    userId, month, nowIso(),
  );
}

/** Chấp nhận banner: bổ sung "tiền còn lại tháng trước" thành một nguồn tiết kiệm. */
// `note` chỉ lưu tháng thô (YYYY-MM), không lưu câu tiếng Việt đã dựng sẵn —
// client tự format lại theo đúng ngôn ngữ đang chọn (xem `savings.js`).
export function createRecapSource(userId, month, amount) {
  const info = run(
    `INSERT INTO savings_sources (user_id, channel_name, amount, rate_percent, rate_period, started_on, source, note, created_at)
     VALUES (?,?,?,0,'year',?,'recap',?,?)`,
    userId, 'Quỹ tiết kiệm Ekko', Math.round(Number(amount)), dayKey(), month, nowIso(),
  );
  return get('SELECT * FROM savings_sources WHERE id = ?', Number(info.lastInsertRowid));
}
