/**
 * Thử thách — việc nhỏ tự làm mới theo kỳ, khác huy hiệu (đạt một lần là xong):
 *
 * - `once`   chặng khởi đầu cho người mới, đếm trên toàn bộ dữ liệu.
 * - `daily`  mỗi ngày chọn DAILY_PICKS thử thách trong bộ hằng ngày. Cách chọn
 *            cố định theo (người dùng, ngày), nên mở lại app không đổi đề.
 * - `weekly` mọi thử thách tuần đều hiện; tuần tính từ thứ Hai.
 *
 * Tiến độ luôn tính thẳng từ dữ liệu gốc (bài học, khoản chi, tin nhắn…) trong
 * đúng kỳ đó — không có bộ đếm nào lưu riêng để lệch. Bảng `user_challenges`
 * chỉ ghi lại phần thưởng đã nhận.
 */
import { all, get, run, tx } from '../db.js';
import { addDays, dayKey, endOfWeek, nowIso, startOfWeek } from '../lib/time.js';
import { evaluateBadges, levelProgress, metricFor, settleLevel } from './progression.js';
import { readState } from './streak.js';
import { shareXpWithTeam } from './teams.js';

export const DAILY_PICKS = 3;
/** Thưởng thêm khi xong cả bộ thử thách của kỳ (challenge_id = 0 trong user_challenges). */
export const BONUS_XP = { daily: 20, once: 40 };

export const CHALLENGE_PERIODS = { once: 'Chặng khởi đầu', daily: 'Hằng ngày', weekly: 'Hằng tuần' };

/** Điều kiện dùng được cho thử thách. Loại nào đếm được theo kỳ thì dùng được cho cả ngày/tuần. */
export const CHALLENGE_RULES = {
  lessons_completed: 'Số bài học hoàn thành trong kỳ',
  quizzes_taken: 'Số bài trắc nghiệm mô đun đã làm trong kỳ',
  expenses_logged: 'Số khoản chi đã ghi trong kỳ',
  expense_days: 'Số ngày có ghi chi tiêu trong kỳ',
  days_within_limits: 'Số ngày có ghi chi mà không nhóm nào vượt hạn mức chi trong ngày',
  bot_chats: 'Số lượt hỏi Ekko bot trong kỳ',
  goal_deposits: 'Số lần nạp tiền vào mục tiêu trong kỳ',
  news_read: 'Số tin tức đã đọc trong kỳ',
  feature_used: 'Số ngày dùng một chức năng trong kỳ',
  goals_created: 'Chỉ cho chặng khởi đầu: số mục tiêu đã tạo',
  budgets_created: 'Chỉ cho chặng khởi đầu: số tháng đã lập ngân sách',
};

/** Ngày đầu, ngày cuối và khoá của kỳ chứa `today`. */
export function periodWindow(period, today = dayKey()) {
  if (period === 'daily') return { key: today, from: today, to: today };
  if (period === 'weekly') return { key: startOfWeek(today), from: startOfWeek(today), to: endOfWeek(today) };
  return { key: 'once', from: null, to: null };
}

// --- đếm trong kỳ ---------------------------------------------------------

/** Mốc thời gian lưu theo UTC: lọc thô bằng SQL, rồi đổi ra ngày theo giờ Việt Nam. */
function countStampsInWindow(rows, from, to) {
  return rows.filter((r) => {
    const day = dayKey(new Date(r.at));
    return day >= from && day <= to;
  }).length;
}

const isoFloor = (day) => `${addDays(day, -1)}T00:00:00.000Z`;

function windowMetric(userId, challenge, from, to) {
  const count = (sql, ...args) => get(sql, ...args).n;
  const activity = (kind, distinctRef = false) => count(
    `SELECT COUNT(${distinctRef ? 'DISTINCT ref' : '*'}) n FROM activity_log WHERE user_id = ? AND kind = ? AND day BETWEEN ? AND ?`,
    userId, kind, from, to,
  );

  switch (challenge.rule_type) {
    case 'lessons_completed':
      return activity('lesson_completed');
    case 'quizzes_taken':
      return activity('module_quiz');
    case 'news_read':
      return activity('news_read', true);
    case 'feature_used':
      return challenge.rule_target
        ? count("SELECT COUNT(*) n FROM activity_log WHERE user_id = ? AND kind = 'feature_used' AND ref = ? AND day BETWEEN ? AND ?",
          userId, challenge.rule_target, from, to)
        : activity('feature_used');
    case 'expenses_logged':
      return countStampsInWindow(
        all('SELECT created_at AS at FROM expenses WHERE user_id = ? AND created_at >= ?', userId, isoFloor(from)), from, to,
      );
    case 'expense_days':
      return count('SELECT COUNT(DISTINCT spent_on) n FROM expenses WHERE user_id = ? AND spent_on BETWEEN ? AND ?', userId, from, to);
    case 'days_within_limits':
      return daysWithinLimits(userId, from, to);
    case 'bot_chats':
      return countStampsInWindow(
        all("SELECT created_at AS at FROM bot_messages WHERE user_id = ? AND role = 'user' AND source = 'chat' AND created_at >= ?",
          userId, isoFloor(from)),
        from, to,
      );
    case 'goal_deposits':
      return countStampsInWindow(
        all('SELECT d.created_at AS at FROM goal_deposits d JOIN goals g ON g.id = d.goal_id WHERE g.user_id = ? AND d.created_at >= ?',
          userId, isoFloor(from)),
        from, to,
      );
    default:
      return 0;
  }
}

/** Số ngày trong kỳ có ghi chi mà không nhóm chi tiêu nào vượt `daily_limit` của nó. */
function daysWithinLimits(userId, from, to) {
  const days = all('SELECT DISTINCT spent_on AS day FROM expenses WHERE user_id = ? AND spent_on BETWEEN ? AND ?', userId, from, to);
  const over = new Set(all(
    `SELECT e.spent_on AS day
       FROM expenses e JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ? AND e.spent_on BETWEEN ? AND ? AND c.daily_limit IS NOT NULL
      GROUP BY e.spent_on, c.id
     HAVING SUM(e.amount) > c.daily_limit`,
    userId, from, to,
  ).map((r) => r.day));
  return days.filter((r) => !over.has(r.day)).length;
}

function progressOf(userId, challenge, window) {
  // Chặng khởi đầu đếm trên toàn bộ dữ liệu — dùng chung luật với huy hiệu.
  if (challenge.period === 'once') return metricFor(userId, challenge);
  return windowMetric(userId, challenge, window.from, window.to);
}

// --- chọn đề và bảng thử thách ------------------------------------------

/** Băm chuỗi ra số nguyên dương (FNV-1a), đủ để xáo đề ổn định theo ngày. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function activeChallenges(period) {
  return all('SELECT * FROM challenges WHERE is_active = 1 AND period = ? ORDER BY order_index, id', period);
}

/** Thử thách của kỳ đang chạy. Bộ hằng ngày: DAILY_PICKS cái, xáo theo người dùng + ngày. */
/** Đã học hết mọi bài đang xuất bản: thử thách "học bài" không còn làm được. */
function courseFinished(userId) {
  return get(
    `SELECT COUNT(*) n FROM lessons l
       LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ? AND p.status = 'completed'
      WHERE l.is_published = 1 AND p.lesson_id IS NULL`,
    userId,
  ).n === 0;
}

function challengesFor(userId, period, window) {
  // Học hết khoá rồi thì không đưa thử thách học bài vào đề (ngày lẫn tuần):
  // chúng không bao giờ xong được và còn chặn luôn thưởng "xong cả 3".
  const list = activeChallenges(period).filter((c) => !(period !== 'once' && c.rule_type === 'lessons_completed' && courseFinished(userId)));
  if (period !== 'daily') return list;
  return list
    .map((c) => ({ c, rank: hash(`${userId}:${window.key}:${c.code}`) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, DAILY_PICKS)
    .map(({ c }) => c)
    .sort((a, b) => a.order_index - b.order_index);
}

function claimedSet(userId, period, key) {
  return new Set(all('SELECT challenge_id FROM user_challenges WHERE user_id = ? AND period = ? AND period_key = ?', userId, period, key)
    .map((r) => r.challenge_id));
}

function section(userId, period, today) {
  const window = periodWindow(period, today);
  const claimed = claimedSet(userId, period, window.key);
  const items = challengesFor(userId, period, window).map((c) => {
    const progress = progressOf(userId, c, window);
    const done = progress >= c.rule_value;
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      icon: c.icon,
      xp_reward: c.xp_reward,
      target: c.rule_value,
      progress: Math.min(progress, c.rule_value),
      done,
      claimed: claimed.has(c.id),
      claimable: done && !claimed.has(c.id),
    };
  });
  const bonusXp = BONUS_XP[period] || 0;
  const bonus = bonusXp && items.length ? {
    xp: bonusXp,
    ready: items.every((i) => i.claimed),
    claimed: claimed.has(0),
  } : null;
  return {
    period,
    key: window.key,
    endsOn: window.to,
    items,
    bonus: bonus ? { ...bonus, claimable: bonus.ready && !bonus.claimed } : null,
  };
}

/** Toàn bộ thử thách của người dùng hôm nay. Chặng khởi đầu biến mất khi đã nhận hết thưởng. */
export function challengeBoard(userId, today = dayKey()) {
  const once = section(userId, 'once', today);
  const onboardingDone = once.items.every((i) => i.claimed) && (!once.bonus || once.bonus.claimed);
  const daily = section(userId, 'daily', today);
  const weekly = section(userId, 'weekly', today);
  const sections = [onboardingDone ? null : once, daily, weekly].filter(Boolean);
  return {
    onboarding: onboardingDone ? null : once,
    daily,
    weekly,
    claimable: sections.reduce((n, s) => n + s.items.filter((i) => i.claimable).length + (s.bonus?.claimable ? 1 : 0), 0),
  };
}

// --- nhận thưởng ---------------------------------------------------------

function credit(userId, { challengeId, period, key, xp, ref, name }) {
  const before = readState(userId);
  tx(() => {
    run('INSERT INTO user_challenges (user_id, challenge_id, period, period_key, claimed_at, xp) VALUES (?,?,?,?,?,?)',
      userId, challengeId, period, key, nowIso(), xp);
    run('INSERT INTO activity_log (user_id, kind, ref, day, xp, meta, created_at) VALUES (?,?,?,?,?,?,?)',
      userId, challengeId ? 'challenge_claimed' : 'challenge_bonus', ref, dayKey(), xp, JSON.stringify({ name }), nowIso());
    if (xp) run('UPDATE user_state SET xp = xp + ?, updated_at = ? WHERE user_id = ?', xp, nowIso(), userId);
  });
  shareXpWithTeam(userId, xp);
  const levelUp = settleLevel(userId, before.xp);
  const badges = evaluateBadges(userId);
  const finalState = readState(userId);
  return { xp, levelUp, badges, progress: levelProgress(finalState.xp), totals: { xp: finalState.xp } };
}

/**
 * Nhận thưởng một thử thách đã xong ở kỳ hiện tại. Trả về null nếu thử thách
 * không nằm trong đề của kỳ này; `{ error }` nếu chưa xong hoặc đã nhận.
 */
export function claimChallenge(userId, id, today = dayKey()) {
  const challenge = get('SELECT * FROM challenges WHERE id = ? AND is_active = 1', Number(id));
  if (!challenge) return null;
  const item = section(userId, challenge.period, today).items.find((i) => i.id === challenge.id);
  if (!item) return null;
  if (item.claimed) return { error: 'Bạn đã nhận thưởng thử thách này rồi' };
  if (!item.done) return { error: 'Thử thách này chưa hoàn thành' };
  const window = periodWindow(challenge.period, today);
  return credit(userId, {
    challengeId: challenge.id, period: challenge.period, key: window.key, xp: challenge.xp_reward, ref: challenge.code, name: challenge.name,
  });
}

/** Thưởng thêm khi đã nhận hết thưởng của một kỳ (`daily` hoặc `once`). */
export function claimChallengeBonus(userId, period, today = dayKey()) {
  if (!BONUS_XP[period]) return null;
  const s = section(userId, period, today);
  if (!s.bonus) return null;
  if (s.bonus.claimed) return { error: 'Bạn đã nhận phần thưởng này rồi' };
  if (!s.bonus.ready) return { error: 'Hãy hoàn thành và nhận thưởng mọi thử thách trước' };
  return credit(userId, {
    challengeId: 0, period, key: s.key, xp: s.bonus.xp, ref: period,
    name: period === 'daily' ? 'Xong cả thử thách hôm nay' : 'Xong chặng khởi đầu',
  });
}

/** Đánh dấu đã xong chặng khởi đầu (dùng cho người dùng mẫu đã dùng app lâu). */
export function skipOnboardingChallenges(userId) {
  const now = nowIso();
  for (const c of activeChallenges('once')) {
    run('INSERT OR IGNORE INTO user_challenges (user_id, challenge_id, period, period_key, claimed_at, xp) VALUES (?,?,?,?,?,0)',
      userId, c.id, 'once', 'once', now);
  }
  run("INSERT OR IGNORE INTO user_challenges (user_id, challenge_id, period, period_key, claimed_at, xp) VALUES (?, 0, 'once', 'once', ?, 0)",
    userId, now);
}
