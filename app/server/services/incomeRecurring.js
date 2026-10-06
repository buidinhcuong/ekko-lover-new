/**
 * Thu nhập lặp lại hằng tháng — cùng cơ chế "vá" như services/recurring.js
 * (chi tiêu lặp lại): app không có tiến trình nền, nên mỗi mẫu chỉ được tạo
 * khoản còn thiếu của tháng hiện tại khi người dùng mở sổ.
 */
import { all, get, run } from '../db.js';
import { monthKey, nowIso } from '../lib/time.js';

/** Ngày trong tháng của mẫu, kẹp lại nếu tháng đích ngắn hơn (vd mẫu đặt ngày 31, tháng 2 chỉ có 28). */
function clampDay(year, month, day) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(day, lastDay);
}

export function materializeDueIncomeRecurring(userId) {
  const month = monthKey();
  const due = all(
    'SELECT * FROM income_recurring WHERE user_id = ? AND is_active = 1 AND (last_month IS NULL OR last_month <> ?)',
    userId, month,
  );
  if (!due.length) return;

  const [year, mon] = month.split('-').map(Number);
  for (const template of due) {
    const day = clampDay(year, mon, template.day_of_month);
    const receivedOn = `${month}-${String(day).padStart(2, '0')}`;

    run(
      'INSERT INTO income_entries (user_id, amount, category, note, received_on, recurring_id, created_at) VALUES (?,?,?,?,?,?,?)',
      userId, template.amount, template.category, template.note, receivedOn, template.id, nowIso(),
    );
    run('UPDATE income_recurring SET last_month = ? WHERE id = ?', month, template.id);
  }
}

/** Đặt một khoản thu nhập vừa ghi thành mẫu lặp lại — tháng này coi như đã có rồi (chính khoản vừa ghi). */
export function createIncomeRecurringTemplate(userId, { amount, category, note, receivedOn }) {
  const day = Number(receivedOn.slice(8, 10));
  const info = run(
    'INSERT INTO income_recurring (user_id, amount, category, note, day_of_month, last_month, is_active, created_at) VALUES (?,?,?,?,?,?,1,?)',
    userId, amount, category, note, day, receivedOn.slice(0, 7), nowIso(),
  );
  return get('SELECT * FROM income_recurring WHERE id = ?', Number(info.lastInsertRowid));
}
