/**
 * Ba người dùng dựng sẵn cho bản demo — nút chuyển nằm ngoài khung điện thoại,
 * cạnh nút về trang chính (xem `public/app/main.js`). Chỉ dùng ở chế độ phát
 * triển / demo, qua `/dev/persona?as=new|mid|veteran`.
 *
 * - `new`     — người vừa vào chức năng: heo cấp 1, 0 XP, chưa học bài nào,
 *               chưa có dữ liệu ở chức năng nào, chưa xem onboarding.
 * - `mid`     — người đang học, dùng được khoảng 1,5 tháng: học khoảng 30% số
 *               bài (và trắc nghiệm của mô-đun đã học xong), mọi chức năng đã
 *               có dữ liệu nhưng ít hơn.
 * - `veteran` — người đã dùng Ekko Lover khoảng 4 tháng: học hết mọi bài và làm
 *               hết trắc nghiệm, heo cấp cao nhất, mọi chức năng đều có dữ liệu.
 *
 * Mỗi lần bấm là dựng lại từ đầu (xoá người dùng cũ rồi tạo lại), nên demo
 * lúc nào cũng mở ra đúng một trạng thái, dù lần trước đã bấm gì bên trong.
 */
import { all, get, run, tx } from '../db.js';
import { addDays, dayKey, nowIso, shiftMonth } from '../lib/time.js';
import { evaluateBadges, learningXp, levelForXp, levels } from './progression.js';
import { skipOnboardingChallenges } from './challenges.js';

const EMPLOYER = 'Công ty TNHH Minh Phát';

export const PERSONAS = {
  new: { sub: 'demo-persona-new', name: 'Lê Minh Khang', email: 'khang.le@congty.vn' },
  mid: { sub: 'demo-persona-mid', name: 'Võ Thanh Tâm', email: 'tam.vo@congty.vn' },
  veteran: { sub: 'demo-persona-veteran', name: 'Phạm Thu Hà', email: 'ha.pham@congty.vn' },
};

/** Mã persona của một người dùng (theo mã Ekko), hoặc null nếu là người thường. */
export function personaOf(ekkoUserId) {
  return Object.keys(PERSONAS).find((key) => PERSONAS[key].sub === ekkoUserId) || null;
}

/**
 * Claims SSO để tạo người dùng của persona.
 *
 * Mang quyền quản trị vì trang preview (`/`) nhúng cả App lẫn Admin portal
 * trong cùng MỘT phiên và đòi phiên đó là quản trị viên. App người dùng không
 * đọc tới quyền này, nên với người xem app, đây vẫn là một người dùng bình
 * thường. Chỉ tồn tại ở chế độ demo, nơi `/dev/login?role=admin` vốn đã mở.
 */
export function personaClaims(key) {
  const p = PERSONAS[key];
  return { sub: p.sub, name: p.name, email: p.email, employer: EMPLOYER, role: 'admin' };
}

/** Xoá sạch người dùng của persona (mọi bảng con xoá theo nhờ ON DELETE CASCADE). */
export function dropPersona(key) {
  run('DELETE FROM users WHERE ekko_user_id = ?', PERSONAS[key].sub);
}

/** Nạp dữ liệu cho persona vừa tạo. Người dùng mới thì không có gì để nạp. */
export function buildPersona(key, userId) {
  const profile = PROFILES[key];
  if (profile) tx(() => buildActive(userId, profile));
}

// --- người dùng đã dùng một thời gian --------------------------------------

/** Số ngẫu nhiên có hạt giống, để dữ liệu demo lần nào cũng như nhau. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}


// [số tiền tối thiểu, tối đa, mã nhóm chi, ghi chú]
const DAILY = [
  [35000, 65000, 'needs_food', 'Cơm trưa văn phòng'],
  [40000, 60000, 'needs_food', 'Bún bò'],
  [25000, 55000, 'wants_entertainment', 'Cà phê sáng'],
  [30000, 45000, 'wants_entertainment', 'Trà sữa'],
  [120000, 280000, 'needs_food', 'Đi chợ'],
  [80000, 120000, 'needs_transport', 'Đổ xăng'],
  [15000, 30000, 'needs_transport', 'Gửi xe'],
  [150000, 450000, 'wants_dining', 'Ăn tối cùng gia đình'],
  [90000, 220000, 'wants_shopping', 'Mua sắm online'],
  [60000, 180000, 'wants_home', 'Đồ dùng gia đình'],
  [100000, 250000, 'needs_health', 'Thuốc, vitamin'],
  [90000, 150000, 'wants_entertainment', 'Vé xem phim'],
];

const round1k = (n) => Math.round(n / 1000) * 1000;

/**
 * Hồ sơ dữ liệu của từng persona. Ngày tháng tính lùi từ hôm nay (`…Ago` = số
 * ngày trước), nên bấm hôm nào dữ liệu cũng "vừa mới".
 */
const PROFILES = {
  mid: {
    seed: 20261001,
    joinedDaysAgo: 45,
    lessonShare: 0.3,          // ~30% tổng số bài, học theo đúng thứ tự
    unclaimedBadges: 2,        // Ekko Lover: 2 huy hiệu mới nhất còn chờ "Nhận thưởng"
    streak: 12, best: 15,
    salary: 12000000, bonus: null,
    recurring: [
      [3000000, 'needs_housing', 'Tiền nhà', 5],
      [550000, 'needs_bills', 'Điện, nước, internet', 10],
    ],
    budgetMonths: 2,
    budget: [
      ['needs', 'needs_food', 3500000],
      ['needs', 'needs_transport', 1000000],
      ['needs', 'needs_housing', 3000000],
      ['wants', null, 3000000],
      ['incident', null, 800000],
    ],
    goals: [
      ['Quỹ khẩn cấp', 12000000, 3000000, 300, 'umbrella', 'emergency', 'active', 40],
      ['Mua xe máy', 30000000, 2500000, 500, 'motorbike-01', 'motorbike', 'active', 20],
    ],
    savings: [
      ['ekko', 5000000, null, 6, 30, 'ekko'],
    ],
    missions: [
      ['Hoàn thành khóa học', 'course', 'books-01',
        ['Học xong mô đun Mục tiêu', 'Học xong mô đun Quản lý tiền', 'Học xong mô đun Sản phẩm tài chính', 'Học xong mô đun Bảo hiểm', 'Làm hết bài trắc nghiệm'], 1, 35],
    ],
    chats: 2,
    featureChance: 0.35,
    // Người đang học được đặt ở giữa thang (cấp 5, 40% quãng tới cấp 6) cho
    // khác hẳn người lâu năm. Huy hiệu được xét theo đúng cấp này.
    levelOrder: 5,
  },
  veteran: {
    seed: 20260930,
    joinedDaysAgo: 120,
    lessonShare: 1,
    streak: 46, best: 62,
    salary: 16000000, bonus: [3000000, 40],
    recurring: [
      [3500000, 'needs_housing', 'Tiền nhà', 5],
      [650000, 'needs_bills', 'Điện, nước, internet', 10],
      [1200000, 'needs_education', 'Học phí tiếng Anh cho con', 15],
    ],
    budgetMonths: 4,
    budget: [
      ['needs', 'needs_food', 4000000],
      ['needs', 'needs_transport', 1200000],
      ['needs', 'needs_housing', 3500000],
      ['needs', 'needs_bills', 800000],
      ['wants', 'wants_entertainment', 1200000],
      ['wants', null, 3500000],
      ['incident', null, 1000000],
    ],
    // [tên, mục tiêu, đã có, hạn (ngày tới), icon, mẫu, trạng thái, tạo cách đây, xong cách đây]
    goals: [
      ['Quỹ khẩn cấp', 18000000, 12500000, 120, 'umbrella', 'emergency', 'active', 115],
      ['Mua laptop', 20000000, 20000000, -15, 'laptop', 'laptop', 'done', 110, 18],
      ['Học phí cho con', 10000000, 4200000, 95, 'backpack-01', 'tuition', 'active', 70],
    ],
    // [tên ('ekko' = đối tác đầu tiên), số tiền, lãi %/năm (null = lãi đối tác), kỳ hạn tháng, bắt đầu cách đây, nguồn]
    savings: [
      ['ekko', 20000000, null, 6, 62, 'ekko'],
      ['Sổ tiết kiệm Vietcombank', 30000000, 4.7, 12, 110, 'manual'],
      ['Tiền còn lại tháng trước', 1800000, 0, null, 28, 'recap'],
    ],
    missions: [
      ['Hoàn thành khóa học', 'course', 'books-01',
        ['Học xong mô đun Mục tiêu', 'Học xong mô đun Quản lý tiền', 'Học xong mô đun Bảo hiểm', 'Học xong mô đun Lừa đảo', 'Làm hết bài trắc nghiệm'], 5, 100],
      ['Tiết kiệm đều đặn', 'save', 'money-bag-02',
        ['Tháng 1: để dành 2 triệu', 'Tháng 2: để dành 2 triệu', 'Tháng 3: để dành 2 triệu', 'Tháng 4: để dành 2 triệu'], 3, 95],
    ],
    chats: 6,
    featureChance: 0.45,
    topLevel: true,           // luôn ở cấp cao nhất
  },
};

function buildActive(userId, P) {
  const JOINED_DAYS_AGO = P.joinedDaysAgo;
  const STREAK = P.streak;
  const today = dayKey();
  const month = today.slice(0, 7);
  const rand = seeded(P.seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (lo, hi) => round1k(lo + rand() * (hi - lo));
  const cat = (code) => get('SELECT id FROM categories WHERE code = ?', code)?.id ?? null;
  const at = (day, hour = 9) => `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const log = (kind, ref, day, xp, meta = null) => run(
    'INSERT INTO activity_log (user_id, kind, ref, day, xp, meta, created_at) VALUES (?,?,?,?,?,?,?)',
    userId, kind, ref, day, xp, meta ? JSON.stringify(meta) : null, at(day, 12),
  );

  const joined = addDays(today, -JOINED_DAYS_AGO);
  run('UPDATE users SET created_at = ? WHERE id = ?', at(joined), userId);

  // ---- Học tập: `lessonShare` số bài đầu tiên (học tuần tự), trắc nghiệm của
  // mô-đun nào đã học hết bài ---------------------------------------------
  const allLessons = all(
    `SELECT l.id, l.title, l.module_id, m.title AS module_title,
            (SELECT COUNT(*) FROM frames f WHERE f.lesson_id = l.id AND f.kind = 'quiz') AS quizzes
       FROM lessons l JOIN modules m ON m.id = l.module_id
      WHERE l.is_published = 1 AND m.is_published = 1
      ORDER BY m.order_index, l.order_index`,
  );
  const lessons = allLessons.slice(0, Math.round(allLessons.length * P.lessonShare));
  // Rải đều từ tuần đầu tới ba ngày trước, như một người học vài bài mỗi tuần.
  const span = JOINED_DAYS_AGO - 5;
  lessons.forEach((lesson, i) => {
    const day = addDays(today, -(JOINED_DAYS_AGO - 2) + Math.round((i * span) / Math.max(1, lessons.length - 1)));
    run(
      `INSERT INTO lesson_progress (user_id, lesson_id, status, frame_index, quiz_correct, quiz_total, started_at, completed_at)
       VALUES (?,?,'completed',999,?,?,?,?)`,
      userId, lesson.id, lesson.quizzes, lesson.quizzes, at(day, 20), at(day, 20),
    );
    log('lesson_completed', String(lesson.id), day, learningXp().lesson,
      { title: lesson.title, quizCorrect: lesson.quizzes, quizTotal: lesson.quizzes });

    // Bài cuối của mô-đun (theo cả giáo trình, không phải theo số bài đã học).
    const nextInCourse = allLessons[i + 1];
    const last = !nextInCourse || nextInCourse.module_id !== lesson.module_id;
    if (!last) return;
    log('module_completed', String(lesson.module_id), day, 0, { title: lesson.module_title });
    const questions = get('SELECT COUNT(*) n FROM module_questions WHERE module_id = ?', lesson.module_id).n;
    if (questions > 0) {
      const quizDay = addDays(day, 1) > today ? today : addDays(day, 1);
      run(
        `INSERT INTO module_quiz_results (user_id, module_id, correct, total, attempts, completed_at)
         VALUES (?,?,?,?,1,?)`,
        userId, lesson.module_id, questions, questions, at(quizDay, 21),
      );
      log('module_quiz', String(lesson.module_id), quizDay, learningXp().moduleQuiz,
        { title: lesson.module_title, correct: questions, total: questions });
    }
  });

  // ---- Ghi chép chi tiêu: ~4 tháng, có khoản cố định hằng tháng ------------
  const addExpense = (amount, code, note, day, source = 'manual', recurringId = null) => run(
    `INSERT INTO expenses (user_id, amount, category_id, note, spent_on, source, recurring_id, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    userId, amount, cat(code), note, day, source, recurringId, at(day, 11),
  );
  for (let ago = JOINED_DAYS_AGO - 1; ago >= 0; ago -= 1) {
    const day = addDays(today, -ago);
    const count = ago === 0 ? 2 : 1 + (rand() < 0.5 ? 1 : 0);
    for (let k = 0; k < count; k += 1) {
      const [lo, hi, code, note] = ago === 0 ? DAILY[k] : pick(DAILY);
      addExpense(between(lo, hi), code, note, day, rand() < 0.3 ? 'bot' : 'manual');
    }
  }
  const recurring = P.recurring;
  const firstMonth = joined.slice(0, 7);
  for (const [amount, code, note, dom] of recurring) {
    const info = run(
      `INSERT INTO recurring_expenses (user_id, amount, category_id, note, day_of_month, last_month, is_active, created_at)
       VALUES (?,?,?,?,?,?,1,?)`,
      userId, amount, cat(code), note, dom, month, at(joined),
    );
    for (let m = firstMonth; m <= month; m = shiftMonth(m, 1)) {
      const day = `${m}-${String(dom).padStart(2, '0')}`;
      if (day < joined || day > today) continue;
      addExpense(amount, code, note, day, 'manual', Number(info.lastInsertRowid));
    }
  }

  // ---- Thu nhập -----------------------------------------------------------
  const salary = run(
    `INSERT INTO income_recurring (user_id, amount, category, note, day_of_month, last_month, is_active, created_at)
     VALUES (?,?,?,?,?,?,1,?)`,
    userId, P.salary, 'regular', 'Lương tháng', 1, month, at(joined),
  );
  for (let m = firstMonth; m <= month; m = shiftMonth(m, 1)) {
    const day = `${m}-01`;
    if (day >= joined) {
      run(
        `INSERT INTO income_entries (user_id, amount, category, note, received_on, recurring_id, created_at)
         VALUES (?,?,?,?,?,?,?)`,
        userId, P.salary, 'regular', 'Lương tháng', day, Number(salary.lastInsertRowid), at(day),
      );
    }
    run('INSERT INTO monthly_income (user_id, month, amount, updated_at) VALUES (?,?,?,?)', userId, m, P.salary, nowIso());
  }
  if (P.bonus) {
    const [bonus, bonusAgo] = P.bonus;
    const bonusDay = addDays(today, -bonusAgo);
    run(
      'INSERT INTO income_entries (user_id, amount, category, note, received_on, created_at) VALUES (?,?,?,?,?,?)',
      userId, bonus, 'gift', 'Thưởng quý', bonusDay, at(bonusDay),
    );
  }

  // ---- Ngân sách: tháng này và (budgetMonths − 1) tháng trước -------------
  const plan = P.budget;
  for (let back = P.budgetMonths - 1; back >= 0; back -= 1) {
    const m = shiftMonth(month, -back);
    for (const [group, code, amount] of plan) {
      run(
        `INSERT INTO budget_limits (user_id, month, group_code, category_id, amount, notify_80, set_on, repeat_next, created_at)
         VALUES (?,?,?,?,?,1,?,1,?)`,
        userId, m, group, code ? cat(code) : null, amount, m, at(`${m}-01`),
      );
    }
  }

  // Đã xử lý banner tổng kết của tháng trước rồi (bấm Tiếp tục / Bỏ qua).
  const lastMonth = shiftMonth(month, -1);
  run('INSERT INTO budget_recap_dismissed (user_id, month, dismissed_at) VALUES (?,?,?)', userId, lastMonth, at(`${month}-01`));
  run('INSERT INTO savings_recap_dismissed (user_id, month, dismissed_at) VALUES (?,?,?)', userId, lastMonth, at(`${month}-01`));

  // ---- Mục tiêu -----------------------------------------------------------
  const goal = (name, target, saved, deadline, icon, template, status, createdAgo, completedAgo = null) => {
    const info = run(
      `INSERT INTO goals (user_id, name, target_amount, saved_amount, deadline, icon, period, template, status, created_at, completed_at)
       VALUES (?,?,?,?,?,?,'month',?,?,?,?)`,
      userId, name, target, saved, deadline, icon, template, status,
      at(addDays(today, -createdAgo)), completedAgo == null ? null : at(addDays(today, -completedAgo)),
    );
    // Nạp đều mỗi tháng tới đúng số đã có.
    const deposits = Math.max(1, Math.round(createdAgo / 30));
    let left = saved;
    for (let k = 0; k < deposits && left > 0; k += 1) {
      const amount = k === deposits - 1 ? left : round1k(saved / deposits);
      left -= amount;
      const day = addDays(today, -createdAgo + 3 + k * 30);
      run('INSERT INTO goal_deposits (goal_id, amount, note, created_at) VALUES (?,?,?,?)',
        Number(info.lastInsertRowid), amount, null, at(day > today ? today : day));
    }
  };
  for (const [name, target, saved, dueIn, icon, template, status, createdAgo, doneAgo] of P.goals) {
    goal(name, target, saved, addDays(today, dueIn), icon, template, status, createdAgo, doneAgo ?? null);
  }

  // ---- Tiết kiệm ----------------------------------------------------------
  const channel = get("SELECT name, rates FROM savings_channels ORDER BY order_index LIMIT 1");
  const channelRate = channel ? Number(JSON.parse(channel.rates || '{}')['6']) || 5.5 : 5.5;
  const saving = (name, amount, rate, term, startAgo, source, direction = 'in', note = null) => {
    const started = addDays(today, -startAgo);
    const ended = term ? addDays(started, term * 30) : null;
    run(
      `INSERT INTO savings_sources (user_id, channel_name, amount, rate_percent, rate_period, term_months, started_on, ended_on, direction, source, note, created_at)
       VALUES (?,?,?,?,'year',?,?,?,?,?,?,?)`,
      userId, name, amount, rate, term, started, ended, direction, source, note, at(started),
    );
  };
  for (const [name, amount, rate, term, startAgo, source] of P.savings) {
    if (name === 'ekko') { if (channel) saving(channel.name, amount, channelRate, term, startAgo, 'ekko'); }
    else saving(name, amount, rate, term, startAgo, source);
  }

  // ---- Nhiệm vụ -----------------------------------------------------------
  const mission = (name, template, icon, tasks, done, createdAgo) => {
    const status = done >= tasks.length ? 'done' : 'active';
    const info = run(
      `INSERT INTO plans (user_id, name, total_tasks, completed_tasks, deadline, icon, period, template, status, created_at, completed_at)
       VALUES (?,?,?,?,?,?,'month',?,?,?,?)`,
      userId, name, tasks.length, done, addDays(today, 60), icon, template, status,
      at(addDays(today, -createdAgo)), status === 'done' ? at(addDays(today, -10)) : null,
    );
    tasks.forEach((title, k) => run(
      'INSERT INTO plan_tasks (plan_id, title, status, note, created_at) VALUES (?,?,?,?,?)',
      Number(info.lastInsertRowid), title, k < done ? 'completed' : 'pending', null, at(addDays(today, -createdAgo)),
    ));
  };
  for (const m of P.missions) mission(...m);

  // ---- Trò chuyện với Ekko bot ------------------------------------------
  const chats = [
    ['Quỹ khẩn cấp nên bằng bao nhiêu tháng lương?', 'Thường là 3 đến 6 tháng chi phí thiết yếu. Bạn đang có khoảng 12,5 triệu, tương đương gần 2 tháng rồi đó!'],
    ['Tháng này mình chi ăn uống nhiều không?', 'Bạn đã dùng khoảng 70% ngân sách Thực phẩm, vẫn trong tầm kiểm soát.'],
    ['Gửi tiết kiệm 6 tháng hay 12 tháng thì hơn?', 'Kỳ hạn dài thường lãi cao hơn, nhưng hãy giữ phần tiền có thể cần gấp ở kỳ hạn ngắn.'],
    ['Làm sao nhận biết tin nhắn lừa đảo?', 'Cẩn thận với đường link lạ, lời hứa lợi nhuận cao và yêu cầu chuyển tiền gấp. Đừng bao giờ gửi mã OTP.'],
    ['Có nên mua bảo hiểm sức khoẻ không?', 'Nếu thu nhập của bạn là trụ cột gia đình, bảo hiểm sức khoẻ giúp tránh một khoản chi lớn bất ngờ.'],
    ['Gợi ý cách tiết kiệm thêm 500 nghìn mỗi tháng', 'Thử pha cà phê ở nhà 3 buổi mỗi tuần và gom đơn mua sắm online về một ngày cố định.'],
  ];
  chats.slice(0, P.chats).forEach(([q, a], k) => {
    const day = addDays(today, -Math.round((JOINED_DAYS_AGO - 20) * (1 - k / Math.max(1, P.chats))));
    run("INSERT INTO bot_messages (user_id, role, text, meta, source, created_at) VALUES (?,?,?,?, 'chat', ?)", userId, 'user', q, null, at(day, 13));
    run("INSERT INTO bot_messages (user_id, role, text, meta, source, created_at) VALUES (?,?,?,?, 'chat', ?)", userId, 'bot', a, null, at(day, 13));
  });

  // ---- Dấu vết dùng chức năng mỗi ngày (giữ đúng chuỗi ngày) ---------------
  const codes = all('SELECT code, xp_per_day FROM features WHERE is_enabled = 1').filter((f) => f.code !== 'explore');
  for (let ago = STREAK - 1; ago >= 0; ago -= 1) {
    const day = addDays(today, -ago);
    for (const f of codes) {
      if (ago === 0 || rand() < P.featureChance) log('feature_used', f.code, day, f.xp_per_day);
    }
  }

  // ---- Trạng thái: chuỗi, đã xem onboarding, XP và cấp ------------------
  run(
    `UPDATE user_state SET streak_count = ?, streak_best = ?, last_active_day = ?, streak_started_day = ?,
            lover_intro_at = ?, updated_at = ? WHERE user_id = ?`,
    STREAK, P.best, today, addDays(today, -(STREAK - 1)), at(joined), nowIso(), userId,
  );
  const target = P.levelOrder ? (() => {
    const list = levels();
    const lv = list.find((l) => l.order_index === P.levelOrder);
    const next = list.find((l) => l.order_index > P.levelOrder);
    return lv ? Math.round(lv.xp_required + ((next?.xp_required ?? lv.xp_required + 100) - lv.xp_required) * 0.4) : null;
  })() : null;
  const settle = () => {
    const xp = target ?? get('SELECT COALESCE(SUM(xp), 0) n FROM activity_log WHERE user_id = ?', userId).n;
    run('UPDATE user_state SET xp = ? WHERE user_id = ?', xp, userId);
  };
  settle();
  evaluateBadges(userId, { autoClaim: true }); // huy hiệu cộng thêm XP của nó vào activity_log/user_state
  settle();

  // Luôn ở cấp cao nhất, kể cả khi Admin nâng ngưỡng XP của các cấp.
  const top = levels().at(-1);
  const xp = get('SELECT xp FROM user_state WHERE user_id = ?', userId).xp;
  if (P.topLevel && top && xp < top.xp_required) {
    log('bonus', 'persona', today, top.xp_required - xp + 40, { note: 'demo' });
    settle();
    evaluateBadges(userId, { autoClaim: true });
    settle();
  }
  // Vài huy hiệu mới nhất để ngỏ phần thưởng, cho thấy nút "Nhận thưởng ngay"
  // và viền nhấp nháy ở trang Huy hiệu. XP của chúng rút khỏi nhật ký (người
  // dùng nhận lại khi bấm); XP tổng giữ theo mốc cấp của hồ sơ.
  if (P.unclaimedBadges) {
    const recent = all(
      `SELECT ub.badge_id, b.code FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
        WHERE ub.user_id = ? AND b.xp_reward > 0 ORDER BY ub.awarded_at DESC, b.order_index DESC LIMIT ?`,
      userId, P.unclaimedBadges,
    );
    for (const r of recent) {
      run('UPDATE user_badges SET claimed_at = NULL WHERE user_id = ? AND badge_id = ?', userId, r.badge_id);
      run("DELETE FROM activity_log WHERE user_id = ? AND kind = 'badge_awarded' AND ref = ?", userId, r.code);
    }
    settle();
  }
  const finalXp = get('SELECT xp FROM user_state WHERE user_id = ?', userId).xp;
  run('UPDATE user_state SET level_id = ? WHERE user_id = ?', levelForXp(finalXp)?.id ?? null, userId);
  // Người đã dùng app một thời gian thì đã qua chặng khởi đầu từ lâu.
  skipOnboardingChallenges(userId);
}
