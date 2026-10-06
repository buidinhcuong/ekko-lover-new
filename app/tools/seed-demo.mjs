/**
 * Sinh dữ liệu mẫu cho các chức năng của app: thu nhập, chi tiêu, ngân sách,
 * mục tiêu, kế hoạch, tiết kiệm — để bản demo có số liệu trông như người thật
 * đang dùng, thay vì màn hình trống.
 *
 *   node tools/seed-demo.mjs                  # tài khoản quản trị (cái preview đang xem)
 *   node tools/seed-demo.mjs --user 1         # một tài khoản cụ thể
 *   node tools/seed-demo.mjs --user all       # mọi tài khoản
 *   node tools/seed-demo.mjs --months 6       # trải dài 6 tháng (mặc định 3)
 *   node tools/seed-demo.mjs --seed 7         # bộ số khác (mặc định 42)
 *   node tools/seed-demo.mjs --force          # cho phép chạy thêm lần nữa
 *
 * Nên TẮT server trước khi chạy.
 *
 * Mấy điều cố ý:
 *
 * - **Chỉ thêm, không xoá.** Dữ liệu người dùng tự nhập vẫn còn nguyên. Trước
 *   khi ghi, script chụp một bản sao lưu toàn bộ DB bằng `VACUUM INTO` (chụp
 *   đúng cả khi DB đang ở chế độ WAL) — muốn quay lại thì chép bản đó đè lên.
 * - **Không đụng tới trò chơi hoá.** Ghi thẳng vào bảng chứ không gọi API, vì
 *   đi qua API thì mỗi khoản chi đều cộng XP, tính chuỗi ngày và trao huy
 *   hiệu — vài trăm khoản chi sẽ đẩy mọi tài khoản lên cấp tối đa trong một lần.
 * - **Chạy lại ra đúng bộ số cũ.** Số ngẫu nhiên đi từ một hạt giống cố định,
 *   nên hai lần chạy với cùng `--seed` cho cùng một bộ dữ liệu.
 * - **Chống chạy trùng.** Mỗi tài khoản đã sinh rồi được đánh dấu trong bảng
 *   `settings`; chạy lại sẽ dừng, trừ khi có `--force`.
 */
import { join } from 'node:path';
import { DATA_DIR, all, db, get, getSetting, run, setSetting, tx } from '../server/db.js';

// ------------------------------------------------------------------ tham số
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const MONTHS = Math.max(1, Math.min(12, Number(flag('months', 3)) || 3));
const SEED = Number(flag('seed', 42)) || 42;
const FORCE = args.includes('--force');
const USER_ARG = flag('user', null);

// ---------------------------------------------------- ngẫu nhiên có hạt giống
/** mulberry32: nhỏ, nhanh, và cùng hạt giống thì cùng dãy số. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------- ngày tháng
const pad = (n) => String(n).padStart(2, '0');
const dayKeyOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const monthOf = (key) => key.slice(0, 7);

/** "Hôm nay" theo giờ Việt Nam, giống cách server tính. */
function todayVN() {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const firstOfMonth = (d, offset = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));

// ------------------------------------------------------------- bộ dữ liệu mẫu
/**
 * Từng nhóm chi tiêu: khoảng tiền (nghìn đồng), số lần kỳ vọng mỗi ngày, và
 * những ghi chú người thật hay gõ. Cân chỉnh để một tháng rơi vào khoảng 11
 * triệu trên thu nhập 12 triệu, sát ngân sách 11,9 triệu — tháng này vượt một
 * nhóm, tháng kia dư một nhóm, cho màn hình có đủ các trạng thái mà không
 * phi lý. (Cuối tuần, ăn ngoài và mua sắm tăng gấp đôi — xem `weekend` bên dưới.)
 */
const DAILY = [
  { code: 'needs_food', perDay: 1.3, min: 25, max: 110, notes: ['Cơm trưa văn phòng', 'Bún bò', 'Phở', 'Bánh mì', 'Đi chợ', 'Cơm tấm', 'Siêu thị WinMart', 'Rau củ', 'Trái cây'] },
  { code: 'wants_entertainment', perDay: 0.35, min: 25, max: 65, notes: ['Cà phê sáng', 'Trà sữa', 'Cà phê với đồng nghiệp', 'Highlands', 'Nước ép'] },
  { code: 'needs_transport', perDay: 0.6, min: 15, max: 95, notes: ['Grab đi làm', 'Đổ xăng', 'Gửi xe', 'Grab về nhà', 'Xe buýt'] },
  { code: 'wants_dining', perDay: 0.04, min: 120, max: 380, notes: ['Ăn tối với bạn', 'Lẩu cuối tuần', 'Nhà hàng Nhật', 'Nướng'] },
  { code: 'wants_shopping', perDay: 0.03, min: 150, max: 550, notes: ['Áo sơ mi', 'Giày', 'Shopee', 'Đồ công sở', 'Lazada'] },
  { code: 'wants_home', perDay: 0.04, min: 60, max: 320, notes: ['Đồ dùng nhà tắm', 'Nước giặt', 'Đồ bếp', 'Khăn giấy'] },
  { code: 'needs_health', perDay: 0.03, min: 60, max: 380, notes: ['Thuốc cảm', 'Khám răng', 'Vitamin'] },
  { code: 'wants_gift', perDay: 0.02, min: 200, max: 800, notes: ['Mừng cưới', 'Quà sinh nhật', 'Biếu bố mẹ'] },
  { code: 'wants_beauty', perDay: 0.02, min: 100, max: 450, notes: ['Cắt tóc', 'Mỹ phẩm', 'Gội đầu'] },
  { code: 'wants_hobby', perDay: 0.02, min: 90, max: 350, notes: ['Sách', 'Vé xem phim', 'Cầu lông'] },
  { code: 'needs_education', perDay: 0.015, min: 200, max: 600, notes: ['Khoá học online', 'Sách chuyên môn'] },
];

/** Khoản cố định hằng tháng: ngày trong tháng, số tiền (nghìn), dao động (nghìn). */
const MONTHLY = [
  { code: 'needs_housing', day: 1, amount: 3500, spread: 0, note: 'Tiền nhà' },
  { code: 'needs_bills', day: 8, amount: 560, spread: 140, note: 'Tiền điện' },
  { code: 'needs_bills', day: 8, amount: 110, spread: 30, note: 'Tiền nước' },
  { code: 'needs_bills', day: 12, amount: 220, spread: 0, note: 'Internet' },
];

/** Ngân sách mỗi tháng — đặt thẳng vào mô hình hạn mức hiện hành. */
const BUDGET = [
  { group: 'needs', code: 'needs_food', amount: 2800000 },
  { group: 'needs', code: 'needs_transport', amount: 900000 },
  { group: 'needs', code: 'needs_housing', amount: 3500000 },
  { group: 'needs', code: 'needs_bills', amount: 900000 },
  { group: 'wants', code: null, amount: 2800000 },
  { group: 'incident', code: null, amount: 1000000 },
];

const GOALS = [
  { name: 'Quỹ khẩn cấp', template: 'emergency', icon: 'umbrella', target: 18000000, saved: 6500000, months: 12 },
  { name: 'Mua laptop', template: 'laptop', icon: 'laptop', target: 20000000, saved: 8200000, months: 10 },
  { name: 'Tết sum vầy', template: 'tet', icon: 'lantern', target: 15000000, saved: 15000000, months: 6 },
];

const PLANS = [
  { name: 'Hoàn thành khóa học', template: 'course', icon: 'books-01', period: 'month', months: 3,
    tasks: ['Học bài 1: Tiền của bạn đi đâu', 'Ghi chép chi tiêu 7 ngày liền', 'Lập ngân sách tháng đầu tiên', 'Đặt một mục tiêu tiết kiệm', 'Làm trắc nghiệm mô-đun 1'], done: 3 },
  { name: 'Tiết kiệm đều đặn', template: 'save', icon: 'money-bag-02', period: 'month', months: 6,
    tasks: ['Mở tài khoản tiết kiệm riêng', 'Đặt lệnh chuyển tự động ngày lương về', 'Cắt 2 gói đăng ký không dùng', 'Xem lại ngân sách cuối tháng'], done: 2 },
  { name: 'Nhiệm vụ thể dục', template: 'fitness', icon: 'dumbbell-01', period: 'week', months: 3,
    tasks: ['Chạy bộ 3 buổi', 'Đi bộ 8.000 bước mỗi ngày', 'Ngủ trước 23 giờ', 'Tập giãn cơ buổi sáng'], done: 4 },
];

const SAVINGS = [
  { channel: 'Sổ tiết kiệm Vietcombank', amount: 20000000, rate: 4.7, termMonths: 12, startMonthsAgo: 5, direction: 'in' },
  { channel: 'MBV Bank', amount: 10000000, rate: 8.3, termMonths: 9, startMonthsAgo: 2, direction: 'in' },
  { channel: 'Heo đất ở nhà', amount: 1500000, rate: 0, termMonths: null, startMonthsAgo: 1, direction: 'in' },
  { channel: 'Rút một phần sổ tiết kiệm', amount: 2000000, rate: 0, termMonths: null, startMonthsAgo: 1, direction: 'out' },
];

// ---------------------------------------------------------------- tiện ích
const catId = (code) => (code ? get('SELECT id FROM categories WHERE code = ?', code)?.id ?? null : null);

function isoAt(dayKey, rand) {
  const h = 7 + Math.floor(rand() * 15);          // 7h–21h giờ VN
  const m = Math.floor(rand() * 60);
  return new Date(`${dayKey}T${pad(h)}:${pad(m)}:00+07:00`).toISOString();
}

const kVnd = (k) => Math.round(k) * 1000;          // nghìn → đồng, tròn nghìn

/** Số lần xảy ra trong một ngày khi kỳ vọng là `mean` (Poisson, rút gọn). */
function countFor(mean, rand) {
  let n = 0;
  let p = Math.exp(-mean);
  let s = p;
  const u = rand();
  while (u > s && n < 6) { n += 1; p *= mean / n; s += p; }
  return n;
}

// ------------------------------------------------------------------ sinh
function seedUser(user, rand) {
  const today = todayVN();
  const todayKey = dayKeyOf(today);
  const start = firstOfMonth(today, -(MONTHS - 1));
  const months = Array.from({ length: MONTHS }, (_, i) => monthOf(dayKeyOf(firstOfMonth(today, -(MONTHS - 1) + i))));
  const stats = { income: 0, expenses: 0, budget: 0, goals: 0, deposits: 0, plans: 0, tasks: 0, savings: 0 };

  // --- thu nhập: lương ngày 5 mỗi tháng, thỉnh thoảng có việc làm thêm/thưởng
  for (const month of months) {
    const payday = `${month}-05`;
    if (payday <= todayKey) {
      run('INSERT INTO income_entries (user_id, amount, category, note, received_on, created_at) VALUES (?,?,?,?,?,?)',
        user.id, 12000000, 'regular', 'Lương tháng', payday, isoAt(payday, rand));
      stats.income += 1;
    }
    if (rand() < 0.6) {
      const day = `${month}-${pad(10 + Math.floor(rand() * 15))}`;
      if (day <= todayKey) {
        run('INSERT INTO income_entries (user_id, amount, category, note, received_on, created_at) VALUES (?,?,?,?,?,?)',
          user.id, kVnd(1200 + rand() * 2300), 'irregular', 'Làm thêm cuối tuần', day, isoAt(day, rand));
        stats.income += 1;
      }
    }
    if (rand() < 0.3) {
      const day = `${month}-${pad(18 + Math.floor(rand() * 8))}`;
      if (day <= todayKey) {
        run('INSERT INTO income_entries (user_id, amount, category, note, received_on, created_at) VALUES (?,?,?,?,?,?)',
          user.id, kVnd(500 + rand() * 1500), 'gift', 'Thưởng dự án', day, isoAt(day, rand));
        stats.income += 1;
      }
    }
    // Thu nhập tháng người dùng tự nhập ở màn Báo cáo chi tiêu.
    run(`INSERT INTO monthly_income (user_id, month, amount, updated_at) VALUES (?,?,?,?)
         ON CONFLICT(user_id, month) DO NOTHING`, user.id, month, 12000000, new Date().toISOString());
  }
  // Lương định kỳ đã ghi tới tháng này, nên đặt `last_month` để không ghi lặp.
  run(`INSERT INTO income_recurring (user_id, amount, category, note, day_of_month, last_month, is_active, created_at)
       VALUES (?,?,?,?,?,?,1,?)`, user.id, 12000000, 'regular', 'Lương tháng', 5, months.at(-1), new Date().toISOString());

  // --- chi tiêu hằng ngày
  for (let d = start; dayKeyOf(d) <= todayKey; d = addDays(d, 1)) {
    const day = dayKeyOf(d);
    const weekend = [0, 6].includes(d.getUTCDay());
    for (const item of DAILY) {
      const id = catId(item.code);
      if (!id) continue;
      // Cuối tuần ăn ngoài, mua sắm nhiều hơn; đi làm thì ít đi.
      const mean = item.perDay * (weekend
        ? ({ wants_dining: 2.6, wants_shopping: 2.2, needs_transport: 0.6 }[item.code] ?? 1)
        : 1);
      for (let n = countFor(mean, rand); n > 0; n -= 1) {
        const note = item.notes[Math.floor(rand() * item.notes.length)];
        const amount = kVnd(item.min + rand() * (item.max - item.min));
        run(`INSERT INTO expenses (user_id, amount, category_id, note, spent_on, source, created_at)
             VALUES (?,?,?,?,?,?,?)`,
          user.id, amount, id, note, day, rand() < 0.12 ? 'bot' : 'manual', isoAt(day, rand));
        stats.expenses += 1;
      }
    }
  }

  // --- khoản cố định hằng tháng + một sự cố
  for (const month of months) {
    for (const item of MONTHLY) {
      const day = `${month}-${pad(item.day)}`;
      const id = catId(item.code);
      if (!id || day > todayKey) continue;
      run(`INSERT INTO expenses (user_id, amount, category_id, note, spent_on, source, created_at)
           VALUES (?,?,?,?,?,?,?)`,
        user.id, kVnd(item.amount + (rand() * 2 - 1) * item.spread), id, item.note, day, 'manual', isoAt(day, rand));
      stats.expenses += 1;
    }
    if (rand() < 0.5) {
      const day = `${month}-${pad(3 + Math.floor(rand() * 22))}`;
      const id = catId('incident');
      if (id && day <= todayKey) {
        run(`INSERT INTO expenses (user_id, amount, category_id, note, spent_on, source, created_at)
             VALUES (?,?,?,?,?,?,?)`,
          user.id, kVnd(350 + rand() * 900), id, rand() < 0.5 ? 'Sửa xe' : 'Thay màn hình điện thoại', day, 'manual', isoAt(day, rand));
        stats.expenses += 1;
      }
    }
  }
  // Tiền nhà là chi tiêu định kỳ; đã ghi tới tháng này.
  const rentCat = catId('needs_housing');
  if (rentCat) {
    run(`INSERT INTO recurring_expenses (user_id, amount, category_id, note, day_of_month, last_month, is_active, created_at)
         VALUES (?,?,?,?,?,?,1,?)`, user.id, 3500000, rentCat, 'Tiền nhà', 1, months.at(-1), new Date().toISOString());
  }

  // --- ngân sách: bỏ qua tháng đã có sẵn dòng, để không tạo hai hạn mức trùng nhóm
  for (const month of months) {
    if (get('SELECT 1 FROM budget_limits WHERE user_id = ? AND month = ?', user.id, month)) continue;
    const isCurrent = month === months.at(-1);
    for (const line of BUDGET) {
      const categoryId = catId(line.code);
      if (line.code && !categoryId) continue;
      run(`INSERT INTO budget_limits (user_id, month, group_code, category_id, amount, notify_80, set_on, repeat_next, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        user.id, month, line.group, categoryId, line.amount, 1, `${month}-01`, isCurrent ? 1 : 0,
        new Date(`${month}-01T09:00:00+07:00`).toISOString());
      stats.budget += 1;
    }
  }

  // --- mục tiêu + các lần nạp (bỏ qua tên đã có)
  for (const goal of GOALS) {
    if (get('SELECT 1 FROM goals WHERE user_id = ? AND name = ?', user.id, goal.name)) continue;
    const created = addDays(start, 2);
    const deadline = dayKeyOf(firstOfMonth(today, goal.months));
    const done = goal.saved >= goal.target;
    const info = run(`INSERT INTO goals (user_id, name, target_amount, saved_amount, deadline, icon, status, created_at, completed_at, period, template)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      user.id, goal.name, goal.target, goal.saved, deadline, goal.icon, done ? 'done' : 'active',
      created.toISOString(), done ? addDays(today, -3).toISOString() : null, 'month', goal.template);
    const goalId = Number(info.lastInsertRowid);
    stats.goals += 1;

    // Chia số đã tiết kiệm thành vài lần nạp rải đều: rút trọng số ngẫu nhiên,
    // chuẩn hoá về đúng tổng, lần cuối nhận phần lẻ — nên tổng các lần nạp luôn
    // bằng đúng `saved` và không lần nào âm.
    const parts = 3 + Math.floor(rand() * 3);
    const weights = Array.from({ length: parts }, () => 0.7 + rand() * 0.6);
    const sum = weights.reduce((a, b) => a + b, 0);
    let left = goal.saved;
    weights.forEach((w, i) => {
      const amount = i === parts - 1 ? left : Math.round((goal.saved * w) / sum / 1000) * 1000;
      left -= amount;
      const when = addDays(created, Math.floor(((i + 1) / parts) * ((today - created) / 86400000)));
      run('INSERT INTO goal_deposits (goal_id, amount, note, created_at) VALUES (?,?,?,?)',
        goalId, amount, null, when.toISOString());
      stats.deposits += 1;
    });
  }

  // --- kế hoạch + nhiệm vụ (bỏ qua tên đã có)
  for (const plan of PLANS) {
    if (get('SELECT 1 FROM plans WHERE user_id = ? AND name = ?', user.id, plan.name)) continue;
    const done = plan.done >= plan.tasks.length;
    const info = run(`INSERT INTO plans (user_id, name, total_tasks, completed_tasks, deadline, icon, period, template, status, created_at, completed_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      user.id, plan.name, plan.tasks.length, plan.done, dayKeyOf(firstOfMonth(today, plan.months)), plan.icon,
      plan.period, plan.template, done ? 'done' : 'active', addDays(start, 5).toISOString(),
      done ? addDays(today, -2).toISOString() : null);
    const planId = Number(info.lastInsertRowid);
    stats.plans += 1;
    plan.tasks.forEach((title, i) => {
      run('INSERT INTO plan_tasks (plan_id, title, status, note, created_at) VALUES (?,?,?,?,?)',
        planId, title, i < plan.done ? 'completed' : 'pending', null, addDays(start, 5 + i).toISOString());
      stats.tasks += 1;
    });
  }

  // --- tiết kiệm
  for (const item of SAVINGS) {
    if (get('SELECT 1 FROM savings_sources WHERE user_id = ? AND channel_name = ?', user.id, item.channel)) continue;
    const started = firstOfMonth(today, -item.startMonthsAgo);
    const ended = item.termMonths ? dayKeyOf(firstOfMonth(started, item.termMonths)) : null;
    run(`INSERT INTO savings_sources (user_id, channel_name, amount, rate_percent, rate_period, term_months, started_on, ended_on, direction, source, note, created_at)
         VALUES (?,?,?,?,'year',?,?,?,?,'manual',?,?)`,
      user.id, item.channel, item.amount, item.rate, item.termMonths, dayKeyOf(started), ended, item.direction,
      null, started.toISOString());
    stats.savings += 1;
  }

  return stats;
}

// --------------------------------------------------------------------- chạy
const users = USER_ARG === 'all'
  ? all('SELECT id, name, role FROM users ORDER BY id')
  : USER_ARG
    ? all('SELECT id, name, role FROM users WHERE id = ?', Number(USER_ARG))
    : all("SELECT id, name, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");

if (!users.length) {
  console.error('Không tìm thấy tài khoản nào. Mở app một lần để tài khoản được tạo, rồi chạy lại.');
  process.exit(1);
}

const pending = users.filter((u) => FORCE || !getSetting(`demo_seed:${u.id}`));
if (!pending.length) {
  console.log('Các tài khoản này đã có dữ liệu mẫu. Thêm --force nếu thật sự muốn sinh thêm một lượt.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backup = join(DATA_DIR, `backup-before-demo-${stamp}.sqlite`);
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`Đã sao lưu DB: ${backup}`);

const rand = prng(SEED);
tx(() => {
  for (const user of pending) {
    const stats = seedUser(user, rand);
    setSetting(`demo_seed:${user.id}`, new Date().toISOString());
    console.log(`\n${user.name} (#${user.id}, ${user.role})`);
    for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(9)} +${v}`);
  }
});
console.log(`\nXong: ${MONTHS} tháng, hạt giống ${SEED}.`);
