/**
 * Tạo (hoặc đặt lại mật khẩu cho) một tài khoản QUẢN TRỊ đăng nhập bằng email —
 * chạy trên máy chủ, không cần mã đăng ký hay danh sách EKKO_ADMIN_SUBJECTS.
 *
 *   node server/cli/create-admin.js <email> ["Tên hiển thị"]
 *
 * Docker:  docker compose exec ekko-gdtc node server/cli/create-admin.js <email> "Tên"
 *
 * In ra mật khẩu tạm Ekko-XXXX-XXXX đúng một lần; người nhận đăng nhập ở /admin/
 * rồi đổi lại ở app → Cấp độ heo → Tài khoản → Đổi mật khẩu. Chạy lại với cùng
 * email = đặt lại mật khẩu (và bảo đảm vẫn là quản trị viên).
 * Dùng cùng database với server (EKKO_DATA_DIR / app/.env) — chạy trên đúng máy đó.
 */
import { upsertMember } from '../auth.js';
import { get, run } from '../db.js';
import { nowIso } from '../lib/time.js';
import { hashPassword, resetPassword, tempPassword } from '../services/localAuth.js';
import { DATA_DIR } from '../db.js';

const [emailArg, ...nameParts] = process.argv.slice(2);
const email = String(emailArg || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Cách dùng: node server/cli/create-admin.js <email> ["Tên hiển thị"]');
  process.exit(1);
}
const name = nameParts.join(' ').trim() || email.split('@')[0];

let user = get('SELECT u.* FROM users u JOIN local_accounts la ON la.user_id = u.id WHERE la.email = ?', email);
let password;
if (user) {
  password = resetPassword(user.id).password;
} else {
  user = upsertMember({ sub: `local:${email}`, name, email });
  password = tempPassword();
  run('INSERT INTO local_accounts (user_id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    user.id, email, hashPassword(password), nowIso(), nowIso());
}
run("UPDATE users SET role = 'admin' WHERE id = ?", user.id);

console.log('');
console.log(`  Database      ${DATA_DIR}`);
console.log(`  Quản trị viên ${email} (${get('SELECT name FROM users WHERE id = ?', user.id).name})`);
console.log(`  Mật khẩu tạm  ${password}`);
console.log('');
console.log('  Đăng nhập ở /admin/ rồi đổi mật khẩu: app → Cấp độ heo → Tài khoản.');
console.log('  Mật khẩu này chỉ hiện một lần.');
