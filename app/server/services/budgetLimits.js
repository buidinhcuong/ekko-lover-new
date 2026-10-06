/**
 * Ngân sách kiểu mới: mỗi dòng là một hạn mức chi tối đa cho một tháng dương
 * lịch, áp cho một nhóm chi tiêu con (category_id) hoặc cả một nhóm level 1
 * (category_id = NULL). Số đã chi luôn tính thẳng từ bảng `expenses` — không
 * có một con số "đã chi" nào lưu riêng, để hai màn hình (ngân sách / ghi
 * chép) không thể lệch nhau.
 */
import { all, get, run } from '../db.js';
import { bad, notFound } from '../lib/http.js';
import { monthKey, nowIso, shiftMonth } from '../lib/time.js';
import { CATEGORY_GROUPS } from '../seed/catalogue.js';

const MONTH_RE = /^\d{4}-\d{2}$/;
const GROUP_ICON = { needs: 'shopping-basket-01', wants: 'shopping-bag-01', incident: 'alert-02' };

export function assertMonth(month) {
  if (!MONTH_RE.test(month)) throw bad('Tháng phải có dạng YYYY-MM');
  return month;
}

/**
 * Trước khi đọc một tháng, "vá" các dòng ngân sách của THÁNG THỰC TẾ TRƯỚC ĐÓ
 * có đặt lặp lại (repeat_next) mà tháng thực tế hiện tại chưa có dòng tương
 * ứng — cùng kiểu idempotent như `materializeDueRecurring` cho khoản chi lặp,
 * vì app này không có scheduler nền để tự chạy đầu tháng.
 */
export function materializeBudgetRepeats(userId) {
  const thisMonth = monthKey();
  const prevMonth = shiftMonth(thisMonth, -1);

  const carried = all(
    'SELECT * FROM budget_limits WHERE user_id = ? AND month = ? AND repeat_next = 1',
    userId, prevMonth,
  );
  if (!carried.length) return;

  for (const line of carried) {
    const existing = line.category_id
      ? get(
        'SELECT id FROM budget_limits WHERE user_id = ? AND month = ? AND category_id = ?',
        userId, thisMonth, line.category_id,
      )
      : get(
        'SELECT id FROM budget_limits WHERE user_id = ? AND month = ? AND group_code = ? AND category_id IS NULL',
        userId, thisMonth, line.group_code,
      );
    if (existing) continue;

    run(
      `INSERT INTO budget_limits
         (user_id, month, group_code, category_id, amount, edited_direction, notify_80, note, set_on, repeat_next, created_at)
       VALUES (?,?,?,?,?,NULL,?,?,?,1,?)`,
      userId, thisMonth, line.group_code, line.category_id, line.amount, line.notify_80, line.note, thisMonth, nowIso(),
    );
  }
}

function spentFor(userId, month, groupCode, categoryId) {
  if (categoryId) {
    const row = get(
      `SELECT COALESCE(SUM(amount), 0) AS spent FROM expenses
        WHERE user_id = ? AND category_id = ? AND substr(spent_on, 1, 7) = ?`,
      userId, categoryId, month,
    );
    return row.spent;
  }
  const row = get(
    `SELECT COALESCE(SUM(e.amount), 0) AS spent FROM expenses e
       JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ? AND c.group_code = ? AND substr(e.spent_on, 1, 7) = ?`,
    userId, groupCode, month,
  );
  return row.spent;
}

/**
 * Số tháng ĐÃ QUA (trước tháng hiện tại) có ngân sách mà không dòng hạn mức nào
 * bị vượt — dùng cho huy hiệu "Giữ kỷ luật". Chỉ đọc, không vá dòng lặp lại.
 */
export function monthsKeptWithinBudget(userId) {
  const months = all(
    'SELECT DISTINCT month FROM budget_limits WHERE user_id = ? AND month < ? ORDER BY month',
    userId, monthKey(),
  ).map((r) => r.month);
  return months.filter((month) => all('SELECT * FROM budget_limits WHERE user_id = ? AND month = ?', userId, month)
    .every((row) => spentFor(userId, month, row.group_code, row.category_id) <= row.amount)).length;
}

function publicLine(userId, row) {
  const category = row.category_id ? get('SELECT * FROM categories WHERE id = ?', row.category_id) : null;
  const spent = spentFor(userId, row.month, row.group_code, row.category_id);
  const percent = row.amount > 0 ? Math.round((spent / row.amount) * 100) : 0;

  return {
    id: row.id,
    month: row.month,
    groupCode: row.group_code,
    groupLabel: CATEGORY_GROUPS[row.group_code] || row.group_code,
    categoryId: row.category_id,
    name: category ? category.name : CATEGORY_GROUPS[row.group_code] || row.group_code,
    icon: category ? (category.icon || 'package') : (GROUP_ICON[row.group_code] || 'package'),
    amount: row.amount,
    spent,
    remaining: row.amount - spent,
    percent,
    over: spent > row.amount,
    editedDirection: row.edited_direction,
    notify80: Boolean(row.notify_80),
    note: row.note,
    setOn: row.set_on,
    repeatNext: Boolean(row.repeat_next),
  };
}

export function budgetLimitsPayload(userId, month) {
  assertMonth(month);
  materializeBudgetRepeats(userId);

  const rows = all(
    'SELECT * FROM budget_limits WHERE user_id = ? AND month = ? ORDER BY group_code, category_id IS NULL DESC, id',
    userId, month,
  );
  const items = rows.map((row) => publicLine(userId, row));

  const totals = items.reduce((acc, item) => ({
    amount: acc.amount + item.amount,
    spent: acc.spent + item.spent,
  }), { amount: 0, spent: 0 });

  return {
    month,
    exists: items.length > 0,
    items,
    totals: {
      ...totals,
      remaining: totals.amount - totals.spent,
      percent: totals.amount > 0 ? Math.round((totals.spent / totals.amount) * 100) : 0,
      overCount: items.filter((i) => i.over).length,
      // Sắp tới hạn mức (>=80%) nhưng CHƯA vượt — tách riêng khỏi overCount vì
      // tỉ lệ % tổng có thể vẫn thấp trong khi một dòng riêng lẻ đã gần hết,
      // nhất là khi các dòng có hạn mức chênh lệch lớn.
      nearCount: items.filter((i) => !i.over && i.percent >= 80).length,
    },
  };
}

function findGroupOrCategoryLine(userId, month, groupCode, categoryId) {
  return categoryId
    ? get(
      'SELECT id FROM budget_limits WHERE user_id = ? AND month = ? AND category_id = ?',
      userId, month, categoryId,
    )
    : get(
      'SELECT id FROM budget_limits WHERE user_id = ? AND month = ? AND group_code = ? AND category_id IS NULL',
      userId, month, groupCode,
    );
}

export function createBudgetLimit(userId, body) {
  const month = assertMonth(String(body.month || monthKey()));
  const groupCode = String(body.groupCode || '');
  if (!CATEGORY_GROUPS[groupCode]) throw bad('Nhóm level 1 không hợp lệ');

  let categoryId = body.categoryId ? Number(body.categoryId) : null;
  if (categoryId) {
    const category = get('SELECT * FROM categories WHERE id = ?', categoryId);
    if (!category || category.group_code !== groupCode) throw bad('Nhóm chi tiêu không thuộc nhóm level 1 đã chọn');
  }

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw bad('Tổng ngân sách phải là một số dương');

  if (findGroupOrCategoryLine(userId, month, groupCode, categoryId)) {
    throw bad('Đã có ngân sách cho nhóm này trong tháng — hãy sửa dòng đang có thay vì tạo mới');
  }

  const info = run(
    `INSERT INTO budget_limits
       (user_id, month, group_code, category_id, amount, edited_direction, notify_80, note, set_on, repeat_next, created_at)
     VALUES (?,?,?,?,?,NULL,?,?,?,?,?)`,
    userId, month, groupCode, categoryId, amount,
    body.notify80 ? 1 : 0, body.note ? String(body.note).trim() : null,
    body.setOn || month, body.repeatNext ? 1 : 0, nowIso(),
  );
  return get('SELECT * FROM budget_limits WHERE id = ?', Number(info.lastInsertRowid));
}

export function updateBudgetLimit(userId, id, body) {
  const line = get('SELECT * FROM budget_limits WHERE id = ? AND user_id = ?', id, userId);
  if (!line) throw notFound('Không tìm thấy ngân sách này');

  let amount = line.amount;
  let direction = line.edited_direction;
  if (body.amount !== undefined) {
    const next = Math.round(Number(body.amount));
    if (!Number.isFinite(next) || next <= 0) throw bad('Tổng ngân sách phải là một số dương');
    if (next !== line.amount) direction = next > line.amount ? 'up' : 'down';
    amount = next;
  }

  run(
    `UPDATE budget_limits SET
       amount = ?, edited_direction = ?, notify_80 = ?, note = ?, set_on = ?, repeat_next = ?
     WHERE id = ?`,
    amount,
    direction,
    body.notify80 !== undefined ? (body.notify80 ? 1 : 0) : line.notify_80,
    body.note !== undefined ? (body.note ? String(body.note).trim() : null) : line.note,
    body.setOn || line.set_on,
    body.repeatNext !== undefined ? (body.repeatNext ? 1 : 0) : line.repeat_next,
    line.id,
  );
  return get('SELECT * FROM budget_limits WHERE id = ?', line.id);
}

export function deleteBudgetLimit(userId, id) {
  const line = get('SELECT * FROM budget_limits WHERE id = ? AND user_id = ?', id, userId);
  if (!line) throw notFound('Không tìm thấy ngân sách này');
  run('DELETE FROM budget_limits WHERE id = ?', line.id);
}

/** Tổng kết tháng dương lịch GẦN NHẤT ĐÃ KẾT THÚC — dùng cho banner ở màn chủ. */
export function budgetRecap(userId) {
  const month = shiftMonth(monthKey(), -1);
  const rows = all('SELECT * FROM budget_limits WHERE user_id = ? AND month = ?', userId, month);
  const dismissed = Boolean(get(
    'SELECT 1 AS x FROM budget_recap_dismissed WHERE user_id = ? AND month = ?', userId, month,
  ));

  if (!rows.length) return { month, hasData: false, verdict: null, dismissed };

  const over = rows.some((row) => spentFor(userId, month, row.group_code, row.category_id) > row.amount);
  return { month, hasData: true, verdict: over ? 'over' : 'success', dismissed };
}

export function dismissBudgetRecap(userId, month) {
  assertMonth(month);
  run(
    `INSERT INTO budget_recap_dismissed (user_id, month, dismissed_at) VALUES (?,?,?)
     ON CONFLICT(user_id, month) DO UPDATE SET dismissed_at = excluded.dismissed_at`,
    userId, month, nowIso(),
  );
}

/** Gọn lại vừa đủ cho hai màn khác (widget ngân sách ở màn chủ, gauge ở Ghi chép). */
export function budgetSummary(userId, month) {
  assertMonth(month);
  const { items, totals } = budgetLimitsPayload(userId, month);
  return {
    month,
    exists: items.length > 0,
    income: 0,
    planned: totals.amount,
    spent: totals.spent,
    remaining: totals.remaining,
    percent: totals.percent,
    items: items.map((i) => ({
      icon: i.icon, name: i.name, spent: i.spent, planned: i.amount, percent: i.percent,
    })),
    totals: { income: 0, planned: totals.amount, spent: totals.spent, remaining: totals.remaining, percent: totals.percent },
  };
}

/**
 * So sánh một tháng lịch sử với tháng hiện tại, theo từng nhóm level 1. Số
 * chi tiêu lấy trực tiếp theo CẢ NHÓM (không phụ thuộc việc có đúng dòng ngân
 * sách nào khớp category hay không) — chỉ dùng việc "có ngân sách cho nhóm
 * này ở một trong hai tháng" để quyết định nhóm nào đáng hiện lên biểu đồ.
 */
export function budgetComparison(userId, historyMonth) {
  const current = monthKey();
  const groups = ['needs', 'wants', 'incident'];
  const hasAnyLimit = (month, groupCode) => Boolean(get(
    'SELECT 1 AS x FROM budget_limits WHERE user_id = ? AND month = ? AND group_code = ? LIMIT 1',
    userId, month, groupCode,
  ));

  return groups
    .filter((groupCode) => hasAnyLimit(historyMonth, groupCode) || hasAnyLimit(current, groupCode))
    .map((groupCode) => ({
      groupCode,
      groupLabel: CATEGORY_GROUPS[groupCode],
      history: spentFor(userId, historyMonth, groupCode, null),
      current: spentFor(userId, current, groupCode, null),
    }));
}
