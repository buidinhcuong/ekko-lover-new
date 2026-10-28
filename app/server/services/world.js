/**
 * Assembles the payload behind the main screen: the player's island, the pig
 * character, the four satellite islands, the HUD numbers and what to do next.
 */
import { companyKeyOf, moduleFlags } from './modules.js';
import { all, get } from '../db.js';
import { activeConcept } from './concepts.js';
import { dayKey } from '../lib/time.js';
import { learningXp, levelProgress, levels, metricFor } from './progression.js';
import { readState, streakStatus, MAX_FREEZE_DAYS } from './streak.js';
import { challengeBoard } from './challenges.js';
import { BADGE_GROUPS } from '../seed/catalogue.js';
import { friendCode, teamAlerts } from './teams.js';
import { displayName, genderOf, pigFor } from './profile.js';

/**
 * Mô đun đang hiển thị đầu tiên luôn mở, bất kể cấp độ yêu cầu: Admin ẩn các mô
 * đun phía trước thì người học vào học được ngay mô đun còn lại đầu tiên, không
 * bị kẹt ở một mô đun đòi cấp cao mà không có gì để học lên cấp.
 */
const FIRST_VISIBLE_MODULE = '(SELECT id FROM modules WHERE is_published = 1 ORDER BY order_index, id LIMIT 1)';

export const firstVisibleModuleId = () => get(`SELECT ${FIRST_VISIBLE_MODULE} AS id`)?.id ?? null;

/** Cấp độ thật sự cần để mở mô đun (mô đun hiển thị đầu tiên: cấp 1). */
export const withEffectiveUnlock = (module, firstId = firstVisibleModuleId()) => (
  module && module.id === firstId ? { ...module, unlock_level: 1 } : module
);

export function moduleOverview(userId) {
  const firstId = firstVisibleModuleId();
  return all(
    `SELECT m.*,
            (SELECT COUNT(*) FROM lessons l WHERE l.module_id = m.id AND l.is_published = 1) AS lesson_count,
            (SELECT COUNT(*) FROM lessons l
               JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ? AND p.status = 'completed'
              WHERE l.module_id = m.id AND l.is_published = 1) AS completed_count
       FROM modules m
      WHERE m.is_published = 1
      ORDER BY m.order_index`,
    userId,
  ).map((m) => withEffectiveUnlock(m, firstId));
}

/** First unfinished lesson in the first unlocked, unfinished module. */
export function nextLesson(userId, currentLevelOrder) {
  return get(
    `SELECT l.*, m.title AS module_title, m.slug AS module_slug, m.unlock_level
       FROM lessons l
       JOIN modules m ON m.id = l.module_id
       LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ?
      WHERE l.is_published = 1 AND m.is_published = 1
        AND (m.unlock_level <= ? OR m.id = ${FIRST_VISIBLE_MODULE})
        AND (p.status IS NULL OR p.status <> 'completed')
      ORDER BY m.order_index, l.order_index
      LIMIT 1`,
    userId, currentLevelOrder,
  );
}

export function badgeBoard(userId) {
  const state = readState(userId);
  const memo = {};
  return all(
    `SELECT b.*, ub.awarded_at, ub.claimed_at
       FROM badges b
       LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = ?
      WHERE b.is_active = 1
      ORDER BY b.order_index, b.id`,
    userId,
  ).map((b) => ({
    ...b,
    group_code: b.group_code || 'explore',
    earned: Boolean(b.awarded_at),
    // Đã đạt nhưng XP còn chờ người dùng bấm "Nhận thưởng" (Ekko Lover).
    claimable: Boolean(b.awarded_at) && !b.claimed_at && b.xp_reward > 0,
    // Tiến độ tới ngưỡng, cho thanh "7/10" và để xếp huy hiệu sắp đạt lên trước.
    progress: b.awarded_at ? b.rule_value : Math.min(b.rule_value, metricFor(userId, b, state, memo)),
  }));
}

export function buildWorld(userId) {
  const state = readState(userId);
  const progress = levelProgress(state.xp);
  const levelOrder = progress.level ? progress.level.order_index : 1;
  const streak = streakStatus(userId, dayKey());
  const modules = moduleOverview(userId);
  const badges = badgeBoard(userId);

  const features = all('SELECT * FROM features WHERE is_enabled = 1 ORDER BY order_index').map((f) => ({
    ...f,
    usedToday: Boolean(get(
      'SELECT 1 ok FROM activity_log WHERE user_id = ? AND kind = ? AND ref = ? AND day = ?',
      userId, 'feature_used', f.code, dayKey(),
    )),
  }));

  // Giới tính Nữ: mọi cấp dùng ảnh heo nữ (nếu Admin đã tải lên).
  const gender = genderOf(userId);

  const lessonsDone = get('SELECT COUNT(*) n FROM lesson_progress WHERE user_id = ? AND status = ?', userId, 'completed').n;
  const lessonsTotal = get('SELECT COUNT(*) n FROM lessons WHERE is_published = 1').n;

  return {
    today: dayKey(),
    // Concept đang bật (Ekko Lover hoặc bản Colors): app gắn nó lên <html> để
    // CSS riêng của từng bản bám vào.
    concept: activeConcept(),
    // Đã xem 3 màn giới thiệu của Ekko Lover chưa — chưa thì màn chủ mở chúng ra.
    // profile: màn Thông tin cá nhân đã tự mở lần đầu (sau onboarding + tour) chưa.
    onboarding: { lover: Boolean(state.lover_intro_at), profile: Boolean(state.profile_prompted_at) },
    level: pigFor(progress.level, gender),
    nextLevel: pigFor(progress.next, gender),
    levels: levels().map((l) => ({ ...pigFor(l, gender), unlocked: l.order_index <= levelOrder })),
    progress: {
      xp: state.xp,
      percent: progress.percent,
      xpIntoLevel: progress.xpIntoLevel,
      xpForNextLevel: progress.xpForNextLevel,
      xpToNextLevel: progress.xpToNextLevel,
      // Phần XP trong cấp hiện tại do bạn cùng Dream Team kiếm hộ (tô màu riêng).
      teamXpIntoLevel: Math.min(state.team_xp_level || 0, progress.xpIntoLevel),
      teamPercent: progress.xpForNextLevel
        ? Math.min(progress.percent, Math.round((Math.min(state.team_xp_level || 0, progress.xpIntoLevel) / progress.xpForNextLevel) * 100))
        : 0,
      teamXpTotal: state.team_xp_total || 0,
    },
    streak: { ...streak, maxFreezeDays: MAX_FREEZE_DAYS },
    features,
    modules,
    badges: {
      earned: badges.filter((b) => b.earned).length,
      total: badges.length,
      claimable: badges.filter((b) => b.claimable).length,
      recent: badges.filter((b) => b.earned).slice(-3),
      all: badges,
      groups: BADGE_GROUPS,
    },
    challenges: { claimable: challengeBoard(userId).claimable },
    // Heo Dream Team: mã ID để chia sẻ, lời mời đang chờ, lời nhắc giữ streak chưa xem.
    me: { friendCode: friendCode(userId), name: displayName(userId), gender },
    team: teamAlerts(userId),
    // EkkoFeed: số phản hồi của công ty chưa đọc — dòng nhắc vàng ở màn chủ.
    // Chức năng đang bật / tắt (Admin → Chức năng) — app ẩn phần đang tắt.
    modules: moduleFlags(companyKeyOf(get('SELECT employer, employer_id FROM users WHERE id = ?', userId))),
    feed: {
      unreadReplies: get(
        `SELECT COUNT(*) n FROM feed_replies r JOIN feed_posts p ON p.id = r.post_id
          WHERE p.user_id = ? AND r.seen_at IS NULL`,
        userId,
      ).n,
    },
    learning: {
      lessonsDone,
      lessonsTotal,
      percent: lessonsTotal ? Math.round((lessonsDone / lessonsTotal) * 100) : 0,
      next: (() => {
        const next = nextLesson(userId, levelOrder);
        return next ? { ...next, xp_reward: learningXp().lesson } : null;
      })(),
    },
  };
}
