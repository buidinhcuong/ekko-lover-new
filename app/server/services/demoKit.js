/**
 * Bộ tài khoản demo cho khách hàng — quản trị Ekko bấm một nút trong Admin
 * (EkkoFeed → Quản lý) là có:
 *  - một công ty mẫu (tên do Ekko đặt, vd. "Demo – Công ty ABC"),
 *  - tài khoản người lao động `nld.<mã>@demo.ekko.vn` thuộc công ty đó (mở app
 *    trên điện thoại),
 *  - tài khoản HR `hr.<mã>@demo.ekko.vn` (Admin portal, chỉ thấy công ty mẫu),
 *  - ~50 góp ý / chia sẻ mẫu để báo cáo có số liệu ngay.
 * Mật khẩu sinh ngẫu nhiên, chỉ trả về đúng một lần; tạo lại = đổi mật khẩu mới
 * + nạp lại dữ liệu mẫu. Xoá bộ demo = xoá cả người dùng mẫu và dữ liệu của họ.
 */
import { all, get, run, tx } from '../db.js';
import { nowIso } from '../lib/time.js';
import { hashPassword, tempPassword } from './localAuth.js';
import { seedFeedDemo } from './ekkoFeed.js';
import { normalize } from './nlp.js';
import { COMPANY_KEY } from './companyScope.js';

const fail = (message, status = 400) => ({ error: message, status });
const DOMAIN = 'demo.ekko.vn';

const slugOf = (name) => normalize(name).replace(/[^a-z0-9]+/g, '').slice(0, 20);

/** Tạo / đặt lại tài khoản email + mật khẩu; trả về mật khẩu mới. */
function setLocalAccount(userId, email) {
  const password = tempPassword();
  run(
    `INSERT INTO local_accounts (user_id, email, password_hash, created_at, updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, failed_attempts = 0, locked_until = NULL, updated_at = excluded.updated_at`,
    userId, email, hashPassword(password), nowIso(), nowIso(),
  );
  return password;
}

export function createDemoKit(adminId, { company } = {}, upsertMember) {
  const name = String(company || '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 80) return fail('Tên công ty demo cần từ 3 đến 80 ký tự');
  const slug = slugOf(name);
  if (slug.length < 3) return fail('Tên công ty demo cần có chữ hoặc số');
  const clash = get('SELECT employer_key FROM demo_kits WHERE slug = ? AND employer_key <> ?', slug, name);
  if (clash) return fail(`Mã "${slug}" đã dùng cho bộ demo "${clash.employer_key}" — đặt tên khác`);
  // Không được trùng công ty thật — theo tên lẫn mã công ty (COMPANY_KEY), nếu không HR
  // demo sẽ thấy dữ liệu của công ty thật.
  const real = get(
    `SELECT COUNT(*) n FROM users WHERE (trim(employer) = ? OR ${COMPANY_KEY} = ?)
        AND ekko_user_id NOT LIKE 'demo-kit-%' AND ekko_user_id NOT LIKE 'local:%@${DOMAIN}'`,
    name, name,
  ).n;
  if (real && !get('SELECT 1 ok FROM demo_kits WHERE employer_key = ?', name)) {
    return fail('Tên này trùng một công ty thật đang dùng app — đặt tên khác (vd. thêm "Demo –")');
  }

  const workerEmail = `nld.${slug}@${DOMAIN}`;
  const hrEmail = `hr.${slug}@${DOMAIN}`;
  const result = tx(() => {
    const worker = upsertMember({ sub: `local:${workerEmail}`, name: 'Người lao động (demo)', email: workerEmail, employer: name });
    const hr = upsertMember({ sub: `local:${hrEmail}`, name: `HR ${name}`, email: hrEmail });
    const workerPassword = setLocalAccount(worker.id, workerEmail);
    const hrPassword = setLocalAccount(hr.id, hrEmail);
    run(
      `INSERT INTO employer_admins (user_id, employer_key, employer_name, created_by, created_at) VALUES (?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET employer_key = excluded.employer_key, employer_name = excluded.employer_name`,
      hr.id, name, name, adminId, nowIso(),
    );
    run(
      `INSERT INTO demo_kits (employer_key, slug, worker_user_id, hr_user_id, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(employer_key) DO UPDATE SET worker_user_id = excluded.worker_user_id, hr_user_id = excluded.hr_user_id, updated_at = excluded.updated_at`,
      name, slug, worker.id, hr.id, adminId, nowIso(), nowIso(),
    );
    return {
      ok: true,
      company: name,
      worker: { email: workerEmail, password: workerPassword },
      hr: { email: hrEmail, password: hrPassword },
    };
  });
  // Dữ liệu mẫu (tự chạy trong giao dịch riêng): thay bộ mẫu cũ, giữ góp ý khách tự gửi.
  seedFeedDemo(name, undefined, `demo-kit-${slug}-`);
  return result;
}

export function demoKits() {
  return all(
    `SELECT d.employer_key company, d.slug, d.created_at, d.updated_at, w.email worker_email, h.email hr_email,
            (SELECT MAX(last_seen_at) FROM users x WHERE x.id IN (d.worker_user_id, d.hr_user_id)) last_seen
       FROM demo_kits d LEFT JOIN users w ON w.id = d.worker_user_id LEFT JOIN users h ON h.id = d.hr_user_id
      ORDER BY d.updated_at DESC`,
  );
}

/** Xoá bộ demo: tài khoản người lao động + HR + người dùng mẫu (kéo theo mọi dữ liệu của họ). */
export function removeDemoKit(slug) {
  const kit = get('SELECT * FROM demo_kits WHERE slug = ?', String(slug || ''));
  if (!kit) return fail('Không tìm thấy bộ demo', 404);
  tx(() => {
    run("DELETE FROM users WHERE ekko_user_id LIKE ? || '%'", `demo-kit-${kit.slug}-`);
    run('DELETE FROM users WHERE id IN (?, ?)', kit.worker_user_id ?? -1, kit.hr_user_id ?? -1);
    run('DELETE FROM feed_issues WHERE employer_key = ?', kit.employer_key);
    run('DELETE FROM demo_kits WHERE slug = ?', kit.slug);
  });
  return { ok: true };
}
