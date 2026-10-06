/**
 * XP, the levels, and the badge rule engine.
 *
 * Every rewarding action in the product funnels through `recordActivity`, which
 * is the single place that writes the activity log, moves the streak, grants XP,
 * re-evaluates the level, and awards badges. Routes never touch user_state
 * directly.
 */
import { all, get, getSetting, run } from '../db.js';
import { dayKey, daysBetween, nowIso } from '../lib/time.js';
import { readState, touchStreak } from './streak.js';
import { activeConcept } from './concepts.js';
import { monthsKeptWithinBudget } from './budgetLimits.js';
import { shareXpWithTeam } from './teams.js';

/** Actions that count towards the daily streak. */
const STREAK_KINDS = new Set(['lesson_completed', 'feature_used']);

export const BADGE_RULES = {
  lessons_completed: 'Số bài học đã hoàn thành',
  modules_completed: 'Số mô đun đã hoàn thành',
  quiz_perfect: 'Số bài trắc nghiệm mô đun đúng hết',
  streak_days: 'Độ dài chuỗi streak',
  streak_recovered: 'Số lần cứu được chuỗi đang đóng băng',
  feature_used: 'Số ngày dùng một chức năng',
  features_distinct: 'Số chức năng khác nhau đã dùng',
  expenses_logged: 'Số khoản chi tiêu đã ghi',
  expense_days_streak: 'Số ngày liền nhau có ghi chi tiêu (dài nhất)',
  quick_logs: 'Số khoản ghi nhanh (thanh ghi nhanh, Ekko bot, ảnh hoá đơn)',
  budgets_created: 'Số tháng đã lập ngân sách',
  budget_months_kept: 'Số tháng đã qua không vượt ngân sách',
  goals_created: 'Số mục tiêu đã tạo',
  goals_completed: 'Số mục tiêu đã hoàn thành',
  goal_deposits: 'Số lần nạp tiền vào mục tiêu',
  news_read: 'Số tin tức đã đọc',
  bot_chats: 'Số lượt trò chuyện với Ekko bot',
  level_reached: 'Đạt tới cấp độ thứ N',
  xp_total: 'Tổng XP tích luỹ',
};

// --- XP học tập (Admin portal → Chức năng) -------------------------------

/**
 * XP cho mỗi bài học hoàn tất, cho lần đầu hoàn thành bài test của một mô đun,
 * và cho lần check-in đầu tiên mỗi ngày (vào màn chính). Một mức chung, Admin
 * đặt ở trang Chức năng (setting `lesson_xp`, `module_quiz_xp`, `checkin_xp`).
 */
export const LEARNING_XP_DEFAULTS = { lesson: 30, moduleQuiz: 50, checkin: 10 };
const LEARNING_XP_KEYS = { lesson: 'lesson_xp', moduleQuiz: 'module_quiz_xp', checkin: 'checkin_xp' };

export function learningXp() {
  const read = (key, fallback) => {
    const n = Number(getSetting(LEARNING_XP_KEYS[key]));
    return getSetting(LEARNING_XP_KEYS[key]) !== null && Number.isInteger(n) && n >= 0 ? n : fallback;
  };
  return {
    lesson: read('lesson', LEARNING_XP_DEFAULTS.lesson),
    moduleQuiz: read('moduleQuiz', LEARNING_XP_DEFAULTS.moduleQuiz),
    checkin: read('checkin', LEARNING_XP_DEFAULTS.checkin),
  };
}

/**
 * Check-in Giáo dục tài chính: lần đầu vào màn chính trong ngày được cộng XP.
 * Chỉ là phần thưởng ghé thăm — không tính streak (streak cần làm một việc thật).
 */
export function dailyCheckin(userId, day = dayKey()) {
  if (get("SELECT 1 ok FROM activity_log WHERE user_id = ? AND kind = 'daily_checkin' AND day = ?", userId, day)) {
    return { xp: 0, already: true };
  }
  const xp = learningXp().checkin;
  if (!xp) return { xp: 0, already: false };
  return { ...recordActivity(userId, { kind: 'daily_checkin', xp, countsForStreak: false, day }), already: false };
}

export { LEARNING_XP_KEYS };

export function levels() {
  return all('SELECT * FROM levels WHERE is_active = 1 ORDER BY order_index');
}

/** Highest level whose xp_required is covered by `xp`. */
export function levelForXp(xp) {
  const list = levels();
  let current = list[0] || null;
  for (const level of list) {
    if (xp >= level.xp_required) current = level;
    else break;
  }
  return current;
}

export function nextLevel(level) {
  if (!level) return null;
  return get('SELECT * FROM levels WHERE is_active = 1 AND order_index > ? ORDER BY order_index LIMIT 1', level.order_index);
}

/** Level plus the progress bar numbers the HUD needs. */
export function levelProgress(xp) {
  const current = levelForXp(xp);
  const next = nextLevel(current);
  const floor = current ? current.xp_required : 0;
  const ceiling = next ? next.xp_required : floor;
  const span = Math.max(1, ceiling - floor);
  return {
    level: current,
    next,
    xp,
    xpIntoLevel: xp - floor,
    xpForNextLevel: next ? ceiling - floor : 0,
    xpToNextLevel: next ? Math.max(0, ceiling - xp) : 0,
    percent: next ? Math.min(100, Math.round(((xp - floor) / span) * 100)) : 100,
  };
}

// --- badge evaluation ----------------------------------------------------

/**
 * Con số hiện tại của người học theo luật của huy hiệu, so với `rule_value`.
 * `memo` dùng chung trong một lượt xét để mỗi con số chỉ tính một lần.
 */
export function metricFor(userId, badge, state = readState(userId), memo = {}) {
  const key = `${badge.rule_type}:${badge.rule_target || ''}`;
  if (!(key in memo)) memo[key] = computeMetric(userId, badge, state);
  return memo[key];
}

function computeMetric(userId, badge, state) {
  const count = (sql, ...args) => get(sql, ...args).n;
  switch (badge.rule_type) {
    case 'lessons_completed':
      return count('SELECT COUNT(*) n FROM lesson_progress WHERE user_id = ? AND status = ?', userId, 'completed');
    case 'modules_completed':
      return countCompletedModules(userId, badge.rule_target || null);
    case 'quiz_perfect':
      return count('SELECT COUNT(*) n FROM module_quiz_results WHERE user_id = ? AND total > 0 AND correct >= total', userId);
    case 'streak_days':
      return state.streak_count;
    case 'streak_recovered':
      return count("SELECT COUNT(*) n FROM activity_log WHERE user_id = ? AND kind = 'streak_recovered'", userId);
    case 'feature_used':
      return badge.rule_target
        ? count('SELECT COUNT(*) n FROM activity_log WHERE user_id = ? AND kind = ? AND ref = ?', userId, 'feature_used', badge.rule_target)
        : count('SELECT COUNT(*) n FROM activity_log WHERE user_id = ? AND kind = ?', userId, 'feature_used');
    case 'features_distinct':
      return count("SELECT COUNT(DISTINCT ref) n FROM activity_log WHERE user_id = ? AND kind = 'feature_used' AND ref <> 'explore'", userId);
    case 'expenses_logged':
      return count('SELECT COUNT(*) n FROM expenses WHERE user_id = ?', userId);
    case 'expense_days_streak':
      return longestDayRun(all('SELECT DISTINCT spent_on AS day FROM expenses WHERE user_id = ? ORDER BY spent_on', userId).map((r) => r.day));
    case 'quick_logs':
      // Thanh ghi nhanh lưu khoản chi với nguồn `manual` (người dùng tự gõ), nên
      // đếm nó qua sổ hội thoại (source = 'quick'); Ekko bot và ảnh hoá đơn thì
      // nhận ra ngay trên khoản chi.
      return count("SELECT COUNT(*) n FROM expenses WHERE user_id = ? AND (source = 'bot' OR receipt_path IS NOT NULL)", userId)
        + count("SELECT COUNT(*) n FROM bot_messages WHERE user_id = ? AND role = 'user' AND source = 'quick'", userId);
    case 'goals_created':
      return count('SELECT COUNT(*) n FROM goals WHERE user_id = ?', userId);
    case 'goals_completed':
      return count('SELECT COUNT(*) n FROM goals WHERE user_id = ? AND status = ?', userId, 'done');
    case 'goal_deposits':
      return count('SELECT COUNT(*) n FROM goal_deposits d JOIN goals g ON g.id = d.goal_id WHERE g.user_id = ?', userId);
    case 'budgets_created':
      // Ngân sách kiểu mới nằm ở budget_limits (mỗi tháng một bộ hạn mức);
      // bảng budgets cũ chỉ còn dữ liệu lịch sử, không ai ghi vào nữa.
      return count('SELECT COUNT(*) n FROM budgets WHERE user_id = ?', userId)
        + count('SELECT COUNT(DISTINCT month) n FROM budget_limits WHERE user_id = ?', userId);
    case 'budget_months_kept':
      return monthsKeptWithinBudget(userId);
    case 'news_read':
      return count("SELECT COUNT(DISTINCT ref) n FROM activity_log WHERE user_id = ? AND kind = 'news_read'", userId);
    case 'level_reached': {
      const level = levelForXp(state.xp);
      return level ? level.order_index : 0;
    }
    case 'xp_total':
      return state.xp;
    case 'bot_chats':
      // Chỉ đếm trò chuyện thật. Thanh ghi nhanh cũng ghi vào sổ hội thoại
      // (source = 'quick') nhưng đó không phải là trò chuyện với bot.
      return count(
        "SELECT COUNT(*) n FROM bot_messages WHERE user_id = ? AND role = 'user' AND source = 'chat'",
        userId,
      );
    default:
      return 0;
  }
}

/** Chuỗi ngày liền nhau dài nhất trong một danh sách ngày `YYYY-MM-DD` đã sắp xếp. */
export function longestDayRun(days) {
  let best = 0;
  let length = 0;
  let previous = null;
  for (const day of days) {
    length = previous && daysBetween(previous, day) === 1 ? length + 1 : 1;
    best = Math.max(best, length);
    previous = day;
  }
  return best;
}

/** Số mô đun đã học hết bài; `slug` (slug hoặc id mô đun) thì chỉ xét đúng mô đun đó (0 hoặc 1). */
export function countCompletedModules(userId, slug = null) {
  return get(
    `SELECT COUNT(*) n FROM (
       SELECT m.id
         FROM modules m
         JOIN lessons l ON l.module_id = m.id AND l.is_published = 1
         LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ? AND p.status = 'completed'
        WHERE m.is_published = 1 ${slug ? 'AND (m.slug = ? OR CAST(m.id AS TEXT) = ?)' : ''}
        GROUP BY m.id
       HAVING COUNT(l.id) > 0 AND COUNT(l.id) = COUNT(p.lesson_id)
     )`,
    ...(slug ? [userId, slug, String(slug)] : [userId]),
  ).n;
}

/**
 * Ekko Lover: đạt huy hiệu chưa cộng XP ngay — người dùng bấm "Nhận thưởng"
 * ở trang Huy hiệu thì XP mới vào (`claimBadge`). Các concept khác giữ cách cũ:
 * cộng luôn lúc trao.
 */
export const badgeClaimOnTap = () => activeConcept() === 'lover';

function creditBadge(userId, badge, day = dayKey()) {
  run('UPDATE user_state SET xp = xp + ?, updated_at = ? WHERE user_id = ?', badge.xp_reward, nowIso(), userId);
  run(
    'INSERT INTO activity_log (user_id, kind, ref, day, xp, meta, created_at) VALUES (?,?,?,?,?,?,?)',
    userId, 'badge_awarded', badge.code, day, badge.xp_reward, null, nowIso(),
  );
  shareXpWithTeam(userId, badge.xp_reward, day);
}

/** Cập nhật cấp theo XP hiện tại; trả về cấp mới nếu vừa lên cấp so với `beforeXp`. */
export function settleLevel(userId, beforeXp, day = dayKey()) {
  const beforeLevel = levelForXp(beforeXp);
  const after = readState(userId);
  const afterLevel = levelForXp(after.xp);
  if (afterLevel && afterLevel.id !== after.level_id) {
    // Sang cấp mới: XP từ Dream Team của cấp cũ không còn nằm trên thanh tiến độ.
    run('UPDATE user_state SET level_id = ?, team_xp_level = 0, updated_at = ? WHERE user_id = ?', afterLevel.id, nowIso(), userId);
  }
  const levelUp = afterLevel && beforeLevel && afterLevel.order_index > beforeLevel.order_index ? afterLevel : null;
  if (levelUp) {
    run(
      'INSERT INTO activity_log (user_id, kind, ref, day, xp, meta, created_at) VALUES (?,?,?,?,?,?,?)',
      userId, 'level_up', String(levelUp.id), day, 0, JSON.stringify({ name: levelUp.name }), nowIso(),
    );
  }
  return levelUp;
}

/**
 * Awards every active badge whose threshold is now met. Idempotent.
 *
 * `autoClaim`: cộng XP ngay lúc trao (mặc định ở mọi concept trừ Ekko Lover;
 * dữ liệu mẫu và người dùng mẫu luôn bật). Huy hiệu trả về có `claimable`
 * khi XP của nó còn chờ người dùng bấm nhận.
 */
export function evaluateBadges(userId, { autoClaim = !badgeClaimOnTap(), _depth = 0 } = {}) {
  const state = readState(userId);
  const owned = new Set(all('SELECT badge_id FROM user_badges WHERE user_id = ?', userId).map((r) => r.badge_id));
  const awarded = [];
  const memo = {};

  for (const badge of all('SELECT * FROM badges WHERE is_active = 1 ORDER BY order_index, id')) {
    if (owned.has(badge.id)) continue;
    if (metricFor(userId, badge, state, memo) < badge.rule_value) continue;

    const now = nowIso();
    const paidNow = autoClaim || !(badge.xp_reward > 0);
    run(
      'INSERT OR IGNORE INTO user_badges (user_id, badge_id, awarded_at, claimed_at) VALUES (?, ?, ?, ?)',
      userId, badge.id, now, paidNow ? now : null,
    );
    awarded.push({ ...badge, claimable: !paidNow });
    if (paidNow && badge.xp_reward > 0) creditBadge(userId, badge);
  }
  // XP vừa cộng từ huy hiệu có thể đưa người dùng lên cấp, và lên cấp lại mở
  // huy hiệu "Đạt cấp N" / "Tổng XP": chốt cấp rồi xét thêm một vòng.
  if (awarded.some((b) => !b.claimable && b.xp_reward > 0) && _depth < 3) {
    settleLevel(userId, state.xp);
    awarded.push(...evaluateBadges(userId, { autoClaim, _depth: _depth + 1 }));
  }
  return awarded;
}

/**
 * Người dùng bấm "Nhận thưởng" một huy hiệu đã đạt: cộng XP của huy hiệu, cập
 * nhật cấp, và trao tiếp huy hiệu mà XP mới mở ra (vd. "Tổng XP", "Đạt cấp N").
 */
export function claimBadge(userId, code) {
  const row = get(
    `SELECT b.*, ub.claimed_at FROM badges b
       JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = ?
      WHERE b.code = ?`,
    userId, code,
  );
  if (!row) return null;
  if (row.claimed_at) return { already: true, xp: 0, badge: row, levelUp: null, badges: [] };

  const before = readState(userId);
  run('UPDATE user_badges SET claimed_at = ? WHERE user_id = ? AND badge_id = ?', nowIso(), userId, row.id);
  if (row.xp_reward > 0) creditBadge(userId, row);
  const levelUp = settleLevel(userId, before.xp);
  const badges = evaluateBadges(userId);
  const finalState = readState(userId);
  return {
    already: false,
    xp: row.xp_reward,
    badge: row,
    levelUp,
    badges,
    progress: levelProgress(finalState.xp),
    totals: { xp: finalState.xp },
  };
}

/**
 * The one entry point for anything that earns rewards.
 *
 * @returns rewards envelope consumed by the client to run its celebrations.
 */
export function recordActivity(userId, {
  kind,
  ref = null,
  xp = 0,
  meta = null,
  countsForStreak = STREAK_KINDS.has(kind),
  day = dayKey(),
}) {
  const before = readState(userId);

  run(
    'INSERT INTO activity_log (user_id, kind, ref, day, xp, meta, created_at) VALUES (?,?,?,?,?,?,?)',
    userId, kind, ref, day, xp, meta ? JSON.stringify(meta) : null, nowIso(),
  );

  if (xp) {
    run('UPDATE user_state SET xp = xp + ?, updated_at = ? WHERE user_id = ?', xp, nowIso(), userId);
    shareXpWithTeam(userId, xp, day);
  }

  const streak = countsForStreak ? touchStreak(userId, day) : null;
  // Cứu được chuỗi đang đóng băng: ghi lại cho huy hiệu "Hồi sinh".
  if (streak?.outcome === 'recovered') {
    run(
      'INSERT INTO activity_log (user_id, kind, ref, day, xp, meta, created_at) VALUES (?,?,?,?,?,?,?)',
      userId, 'streak_recovered', String(streak.count), day, 0, JSON.stringify({ frozenDays: streak.frozenDaysRecovered }), nowIso(),
    );
  }

  const levelUp = settleLevel(userId, before.xp, day);

  const badges = evaluateBadges(userId);
  const finalState = readState(userId);

  return {
    xp,
    streak,
    levelUp,
    badges,
    progress: levelProgress(finalState.xp),
    totals: { xp: finalState.xp },
  };
}

/**
 * Ghi nhận người dùng đã LÀM một việc trong một trong ba chức năng hôm nay (lưu
 * ngân sách, đặt/nạp mục tiêu, ghi một khoản chi). Chỉ riêng việc mở màn hình thì
 * không gọi tới đây, nên mở app rồi bấm quanh không sinh ra XP hay streak nào.
 *
 * Chỉ lần đầu mỗi ngày cho mỗi chức năng mới trả thưởng.
 */
export function useFeature(userId, featureCode, day = dayKey()) {
  const feature = get('SELECT * FROM features WHERE code = ? AND is_enabled = 1', featureCode);
  if (!feature) return null;

  const already = get(
    'SELECT id FROM activity_log WHERE user_id = ? AND kind = ? AND ref = ? AND day = ?',
    userId, 'feature_used', featureCode, day,
  );
  if (already) {
    // Still keep badges honest (e.g. a "use every tool" badge) but pay nothing.
    return { xp: 0, streak: null, levelUp: null, badges: evaluateBadges(userId), alreadyToday: true };
  }

  return { ...recordActivity(userId, { kind: 'feature_used', ref: featureCode, xp: feature.xp_per_day, day }), alreadyToday: false };
}
