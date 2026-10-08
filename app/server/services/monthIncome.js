/**
 * Thu nhập của một tháng — một cách tính dùng chung (báo cáo chi tiêu, banner
 * tiết kiệm đầu tháng…): ưu tiên tổng các khoản thu nhập ĐÃ GHI trong sổ thu
 * nhập (nút "Thu nhập", kể cả khoản lặp lại hàng tháng); chỉ khi tháng đó chưa
 * ghi khoản nào mới dùng con số tự gõ ở báo cáo tuần (bảng monthly_income).
 */
import { get } from '../db.js';
import { materializeDueIncomeRecurring } from './incomeRecurring.js';

export function monthIncome(userId, month) {
  materializeDueIncomeRecurring(userId);
  const typed = get('SELECT amount FROM monthly_income WHERE user_id = ? AND month = ?', userId, month)?.amount ?? 0;
  const recorded = get('SELECT COALESCE(SUM(amount), 0) n FROM income_entries WHERE user_id = ? AND received_on LIKE ?', userId, `${month}-%`).n;
  return {
    month,
    amount: recorded > 0 ? recorded : typed,
    typed,
    recorded,
    source: recorded > 0 ? 'entries' : typed > 0 ? 'typed' : 'none',
  };
}
