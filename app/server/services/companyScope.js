/**
 * Lọc số liệu Admin theo công ty (users.employer — tên công ty do SSO của app
 * Ekko gửi sang trong claim `employer`). Dùng chung cho Bảng điều khiển và trang
 * Sử dụng AI: mỗi truy vấn thêm `scope.where('cột user_id')` vào điều kiện.
 *
 * Tài khoản không có công ty (đăng ký email để thử nghiệm nội bộ, demo) gom vào
 * một nhóm riêng `NO_EMPLOYER`.
 */
import { all } from '../db.js';

export const NO_EMPLOYER = '__none__';

/** Mọi công ty đang có người học, kèm số người — cho ô chọn ở Admin. */
export function companyList() {
  return all(
    `SELECT CASE WHEN employer IS NULL OR trim(employer) = '' THEN NULL ELSE trim(employer) END name, COUNT(*) users
       FROM users GROUP BY 1 ORDER BY (name IS NULL), users DESC, name`,
  ).map((r) => ({ value: r.name ?? NO_EMPLOYER, name: r.name ?? 'Chưa gắn công ty', users: r.users }));
}

/**
 * @param {string|null} employer  tên công ty, NO_EMPLOYER, hoặc rỗng = tất cả
 * @returns {{ employer: string|null, where: (col: string) => string, params: any[] }}
 *   `where(col)` trả về một điều kiện SQL; ghép `...params` vào đúng chỗ tham số.
 */
export function companyScope(employer) {
  const value = employer ? String(employer).trim() : '';
  if (!value) return { employer: null, where: () => '1 = 1', params: [] };
  if (value === NO_EMPLOYER) {
    return { employer: value, where: (col) => `${col} IN (SELECT id FROM users WHERE employer IS NULL OR trim(employer) = '')`, params: [] };
  }
  return { employer: value, where: (col) => `${col} IN (SELECT id FROM users WHERE trim(employer) = ?)`, params: [value] };
}
