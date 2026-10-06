/**
 * Streak rules, exactly as specified for Giao duc tai chinh:
 *
 *  - The first qualifying action of a calendar day (+1): finishing a lesson, or
 *    doing something in one of the three tools: saving a budget, setting or
 *    topping up a goal, logging an expense. Merely opening a screen does not count.
 *  - Miss the next day and the streak FREEZES rather than breaking.
 *  - The freeze holds for at most 3 missed days.
 *  - Come back on any of those days and the streak continues (+1).
 *  - Miss a 4th day and the streak is lost; the next action starts again at 1.
 *
 * So with `gap` = days since the last active day:
 *    gap 0        already counted today, nothing changes
 *    gap 1        normal consecutive day            -> +1
 *    gap 2..4     1..3 frozen days were used        -> +1 (streak survived)
 *    gap >= 5     more than 3 days missed           -> reset to 1
 */
import { get, run } from '../db.js';
import { dayKey, daysBetween, nowIso } from '../lib/time.js';

export const MAX_FREEZE_DAYS = 3;
/** Largest gap that a streak can still survive. */
export const SURVIVABLE_GAP = MAX_FREEZE_DAYS + 1;

export function readState(userId) {
  let state = get('SELECT * FROM user_state WHERE user_id = ?', userId);
  if (!state) {
    run(
      'INSERT INTO user_state (user_id, level_id, updated_at) VALUES (?, (SELECT id FROM levels ORDER BY order_index LIMIT 1), ?)',
      userId,
      nowIso(),
    );
    state = get('SELECT * FROM user_state WHERE user_id = ?', userId);
  }
  return state;
}

/**
 * Read-only view of where the streak stands right now. Does not mutate, so it
 * is safe to call on every page load.
 *
 * status: 'none' | 'active' | 'frozen' | 'lost'
 */
export function streakStatus(userId, today = dayKey()) {
  const state = readState(userId);
  const base = {
    count: state.streak_count,
    best: state.streak_best,
    lastActiveDay: state.last_active_day,
    countedToday: false,
    frozenDays: 0,
    freezeDaysLeft: MAX_FREEZE_DAYS,
    status: 'none',
  };

  if (!state.last_active_day || state.streak_count === 0) return base;

  const gap = daysBetween(state.last_active_day, today);

  if (gap <= 0) return { ...base, countedToday: true, status: 'active' };
  if (gap === 1) return { ...base, status: 'active' };
  if (gap <= SURVIVABLE_GAP) {
    const frozenDays = gap - 1;
    return {
      ...base,
      status: 'frozen',
      frozenDays,
      freezeDaysLeft: MAX_FREEZE_DAYS - frozenDays,
    };
  }
  return { ...base, count: 0, status: 'lost', frozenDays: MAX_FREEZE_DAYS, freezeDaysLeft: 0 };
}

/**
 * Registers a qualifying action for `today`. Returns what happened so the UI can
 * celebrate (or warn) appropriately.
 */
export function touchStreak(userId, today = dayKey()) {
  const state = readState(userId);
  const previous = state.streak_count;

  if (!state.last_active_day || previous === 0) {
    return commit(userId, 1, today, today, previous, 'started');
  }

  const gap = daysBetween(state.last_active_day, today);
  if (gap <= 0) {
    // Already counted today. Return the untouched state.
    return {
      changed: false,
      outcome: 'already_counted',
      previous,
      count: previous,
      best: state.streak_best,
      frozenDaysRecovered: 0,
      ...streakStatus(userId, today),
    };
  }

  if (gap <= SURVIVABLE_GAP) {
    const outcome = gap === 1 ? 'continued' : 'recovered';
    return commit(userId, previous + 1, today, state.streak_started_day || today, previous, outcome, gap - 1);
  }

  return commit(userId, 1, today, today, previous, 'reset');
}

function commit(userId, count, today, startedDay, previous, outcome, frozenDaysRecovered = 0) {
  const best = Math.max(count, readState(userId).streak_best);
  run(
    `UPDATE user_state
        SET streak_count = ?, streak_best = ?, last_active_day = ?, streak_started_day = ?, updated_at = ?
      WHERE user_id = ?`,
    count,
    best,
    today,
    startedDay,
    nowIso(),
    userId,
  );
  return {
    changed: true,
    outcome,
    previous,
    count,
    best,
    frozenDaysRecovered,
    countedToday: true,
    status: 'active',
    lastActiveDay: today,
    frozenDays: 0,
    freezeDaysLeft: MAX_FREEZE_DAYS,
  };
}

