/**
 * Thông tin cá nhân người dùng tự khai: tên hiển thị, giới tính, ngày sinh,
 * công ty, chức vụ, phòng ban, nơi làm việc.
 *
 * Lưu riêng ở `user_profiles`, không sửa `users`: SSO của app Ekko ghi đè tên và
 * công ty mỗi lần đăng nhập, còn `users.employer` / `employer_id` quyết định
 * người dùng thuộc công ty nào (EkkoFeed, bật / tắt chức năng). Tên tự đặt chỉ
 * thay tên hiển thị trong app; Admin vẫn thấy tên thật từ SSO.
 *
 * Giới tính Nữ đổi ảnh heo của mọi cấp sang `levels.character_image_female`
 * (Admin → Cấp độ heo). Cấp chưa có ảnh nữ thì giữ ảnh chung.
 */
import { get, run } from '../db.js';
import { dayKey, nowIso } from '../lib/time.js';

export const GENDERS = ['male', 'female', 'other'];

const TEXT_FIELDS = { display_name: 60, company: 120, job_title: 80, department: 80, city: 80 };

const clean = (value, max) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
};

export const genderOf = (userId) => get('SELECT gender FROM user_profiles WHERE user_id = ?', userId)?.gender || null;

/** Tên hiển thị trong app: tên người dùng tự đặt, không có thì tên từ SSO. */
export function displayName(userId) {
  const row = get(
    'SELECT COALESCE(p.display_name, u.name) AS name FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?',
    userId,
  );
  return row?.name || '';
}

/** Ảnh heo của một cấp theo giới tính người dùng. */
export function pigFor(level, gender) {
  if (!level || gender !== 'female' || !level.character_image_female) return level;
  return { ...level, character_image: level.character_image_female };
}

/** Hồ sơ để điền sẵn vào form: chưa khai thì lấy tên và công ty từ SSO. */
export function readProfile(userId) {
  const user = get('SELECT name, employer FROM users WHERE id = ?', userId);
  const row = get('SELECT * FROM user_profiles WHERE user_id = ?', userId) || {};
  return {
    displayName: row.display_name || user?.name || '',
    gender: row.gender || null,
    birthDate: row.birth_date || null,
    company: row.company ?? user?.employer ?? '',
    jobTitle: row.job_title || '',
    department: row.department || '',
    city: row.city || '',
    saved: Boolean(row.updated_at),
  };
}

/** Kiểm tra rồi lưu hồ sơ. Trả `{ error }` khi dữ liệu không hợp lệ. */
export function saveProfile(userId, body = {}) {
  const values = Object.fromEntries(Object.entries(TEXT_FIELDS).map(([key, max]) => [key, clean(body[camel(key)], max)]));
  if (!values.display_name) return { error: 'Hãy nhập tên của bạn' };

  const gender = body.gender || null;
  if (gender !== null && !GENDERS.includes(gender)) return { error: 'Giới tính không hợp lệ' };

  const birthDate = body.birthDate || null;
  if (birthDate !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`))) {
      return { error: 'Ngày sinh không hợp lệ' };
    }
    if (birthDate > dayKey() || birthDate < '1900-01-01') return { error: 'Ngày sinh không hợp lệ' };
  }

  run(
    `INSERT INTO user_profiles (user_id, display_name, gender, birth_date, company, job_title, department, city, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       display_name = excluded.display_name, gender = excluded.gender, birth_date = excluded.birth_date,
       company = excluded.company, job_title = excluded.job_title, department = excluded.department,
       city = excluded.city, updated_at = excluded.updated_at`,
    userId, values.display_name, gender, birthDate, values.company, values.job_title, values.department, values.city, nowIso(),
  );
  return readProfile(userId);
}

const camel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
