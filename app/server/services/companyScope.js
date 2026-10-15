/**
 * Lọc số liệu Admin theo công ty (users.employer_id / users.employer — mã và tên
 * công ty do SSO của app Ekko gửi sang). Dùng chung cho Bảng điều khiển và trang
 * Sử dụng AI: mỗi truy vấn thêm `scope.where('cột user_id')` vào điều kiện.
 *
 * Tài khoản không có công ty (đăng ký email để thử nghiệm nội bộ, demo) gom vào
 * một nhóm riêng `NO_EMPLOYER`.
 */
import { all } from '../db.js';

export const NO_EMPLOYER = '__none__';

/**
 * Khoá nhóm công ty của một người: mã công ty (employer_id, từ SSO) nếu có, không
 * thì tên công ty. Đổi tên công ty mà vẫn cùng mã thì vẫn là một công ty.
 */
export const COMPANY_KEY = "COALESCE(NULLIF(trim(employer_id), ''), NULLIF(trim(employer), ''))";

/** Mọi công ty đang có người học, kèm số người — cho ô chọn ở Admin. */
export function companyList() {
  return all(
    `SELECT ${COMPANY_KEY} AS key, MAX(NULLIF(trim(employer), '')) AS name, COUNT(*) users,
            MAX(NULLIF(trim(employer_id), '')) AS code
       FROM users GROUP BY 1 ORDER BY (key IS NULL), users DESC, name`,
  ).map((r) => ({
    value: r.key ?? NO_EMPLOYER,
    name: r.key === null ? 'Chưa gắn công ty' : (r.name || r.key),
    code: r.code,
    users: r.users,
  }));
}

/**
 * @param {string|null} employer  khoá công ty (mã hoặc tên — `value` của companyList),
 *   NO_EMPLOYER, hoặc rỗng = tất cả
 * @returns {{ employer: string|null, where: (col: string) => string, params: any[] }}
 *   `where(col)` trả về một điều kiện SQL; ghép `...params` vào đúng chỗ tham số.
 */
export function companyScope(employer) {
  const value = employer ? String(employer).trim() : '';
  if (!value) return { employer: null, where: () => '1 = 1', params: [] };
  if (value === NO_EMPLOYER) {
    return { employer: value, where: (col) => `${col} IN (SELECT id FROM users WHERE ${COMPANY_KEY} IS NULL)`, params: [] };
  }
  return { employer: value, where: (col) => `${col} IN (SELECT id FROM users WHERE ${COMPANY_KEY} = ?)`, params: [value] };
}
