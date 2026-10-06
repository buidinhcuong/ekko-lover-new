/**
 * Chi tiêu lặp lại hằng tháng.
 *
 * App này không có tiến trình nền (không cron), nên thay vì "đến ngày tự
 * chạy", mỗi mẫu lặp lại được VÁ ngay khi người dùng mở sổ ghi chép của tháng
 * đó — nếu tháng hiện tại chưa có khoản nào sinh ra từ mẫu này thì tạo một
 * khoản mới, y hệt cách `seed()` chỉ điền phần còn thiếu mỗi lần khởi động.
 */
import { all, get, run } from '../db.js';
import { monthKey, nowIso } from '../lib/time.js';

/** Ngày trong tháng của mẫu, kẹp lại nếu tháng đích ngắn hơn (vd mẫu đặt ngày 31, tháng 2 chỉ có 28). */
function clampDay(year, month, day) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(day, lastDay);
}

/**
 * Tạo khoản chi còn thiếu của tháng hiện tại cho mọi mẫu lặp lại đang bật của
 * người dùng. Gọi mỗi lần họ mở sổ Ghi chép chi tiêu — chạy nhiều lần vô hại
 * vì `last_month` chặn tạo trùng.
 */
export function materializeDueRecurring(userId) {
  const month = monthKey();
  const due = all(
    'SELECT * FROM recurring_expenses WHERE user_id = ? AND is_active = 1 AND (last_month IS NULL OR last_month <> ?)',
    userId, month,
  );
  if (!due.length) return;

  const [year, mon] = month.split('-').map(Number);
  for (const template of due) {
    const day = clampDay(year, mon, template.day_of_month);
    const spentOn = `${month}-${String(day).padStart(2, '0')}`;

    const info = run(
      'INSERT INTO expenses (user_id, amount, category_id, note, spent_on, source, recurring_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
      userId, template.amount, template.category_id, template.note, spentOn, 'manual', template.id, nowIso(),
    );
    run('UPDATE recurring_expenses SET last_month = ? WHERE id = ?', month, template.id);
    void info;
  }
}

/** Đặt một khoản chi vừa ghi thành mẫu lặp lại — tháng này coi như đã có rồi (chính khoản vừa ghi). */
export function createRecurringTemplate(userId, { amount, categoryId, note, spentOn }) {
  const day = Number(spentOn.slice(8, 10));
  const info = run(
    'INSERT INTO recurring_expenses (user_id, amount, category_id, note, day_of_month, last_month, is_active, created_at) VALUES (?,?,?,?,?,?,1,?)',
    userId, amount, categoryId ?? null, note, day, spentOn.slice(0, 7), nowIso(),
  );
  return get('SELECT * FROM recurring_expenses WHERE id = ?', Number(info.lastInsertRowid));
}
