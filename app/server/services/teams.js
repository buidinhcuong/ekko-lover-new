/**
 * Heo Dream Team — rủ bạn bè vào chung một đội để giữ streak cùng nhau.
 *
 * - Mỗi người dùng có một mã ID riêng (`users.friend_code`, vd. EK7KQ2M9), hiện ở
 *   hồ sơ heo cá nhân để chia sẻ. Thêm bạn = nhập ID của bạn đó → gửi lời mời
 *   vào đội của mình.
 * - Mỗi người chỉ ở trong **một** đội (`team_members.user_id` là khoá chính).
 *   Đang ở trong một đội có người khác thì phải "Rời đội" rồi mới chấp nhận được
 *   lời mời khác. Đội chỉ có mình mình thì tự giải tán khi vào đội khác.
 * - Lời mời là "vào đội hiện tại của người mời": người mời chưa có đội thì đội
 *   được lập lúc lời mời đầu tiên được chấp nhận, người mời làm trưởng đội.
 * - Thành viên thấy nhau qua tên, cấp heo, XP, streak — không thấy chi tiêu,
 *   ngân sách hay mục tiêu của nhau.
 * - Tương tác chính: nhắc một bạn giữ streak khi hôm nay bạn đó chưa giữ
 *   streak (chưa vào app, hoặc vào mà chưa học / ghi chép gì). Mỗi người nhắc
 *   một bạn tối đa một lần mỗi ngày.
 */
import { randomInt } from 'node:crypto';
import { all, get, getSetting, run, tx } from '../db.js';
import { dayKey, nowIso } from '../lib/time.js';
import { levelProgress, settleLevel } from './progression.js';
import { readState, streakStatus } from './streak.js';

export const MAX_TEAM = 10;
/** Không có 0/O, 1/I/L: đọc qua điện thoại hay chép tay đỡ nhầm. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PREFIX = 'EK';
const CODE_LEN = 6;

const fail = (message) => ({ error: message });

// --- XP từ Dream Team -----------------------------------------------------

export const TEAM_XP_SHARE_KEY = 'team_xp_share_percent';
const TEAM_XP_SHARE_DEFAULT = 10;

/** % XP mỗi bạn cùng đội nhận được khi một người trong đội kiếm XP (Admin → Chức năng). */
export function teamXpShare() {
  const raw = getSetting(TEAM_XP_SHARE_KEY);
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 0 && n <= 100 ? n : TEAM_XP_SHARE_DEFAULT;
}

/**
 * Một người trong đội vừa kiếm `xp` (bài học, bài test, check-in, huy hiệu, thử
 * thách): mỗi bạn còn lại trong đội nhận thêm `xp × %` (làm tròn xuống). XP
 * nhận từ đội KHÔNG chia tiếp cho ai — tránh vòng lặp và "nuôi" XP qua lại.
 * Chỉ tính XP kiếm được trong lúc đang chung đội, không tính lại XP cũ.
 */
export function shareXpWithTeam(userId, xp, day = dayKey()) {
  if (!(xp > 0)) return;
  const percent = teamXpShare();
  if (!percent) return;
  const teamId = teamIdOf(userId);
  if (!teamId) return;
  const amount = Math.floor((xp * percent) / 100);
  if (!amount) return;
  const fromName = userName(userId);
  for (const { user_id: memberId } of all('SELECT user_id FROM team_members WHERE team_id = ? AND user_id <> ?', teamId, userId)) {
    const before = readState(memberId);
    run(
      'INSERT INTO activity_log (user_id, kind, ref, day, xp, meta, created_at) VALUES (?,?,?,?,?,?,?)',
      memberId, 'team_xp', String(userId), day, amount, JSON.stringify({ name: fromName }), nowIso(),
    );
    run(
      'UPDATE user_state SET xp = xp + ?, team_xp_total = team_xp_total + ?, team_xp_level = team_xp_level + ?, updated_at = ? WHERE user_id = ?',
      amount, amount, amount, nowIso(), memberId,
    );
    // Lên cấp nhờ chính phần XP này: settleLevel đã đặt team_xp_level = 0; phần
    // tràn sang cấp mới vẫn là XP từ đội.
    if (settleLevel(memberId, before.xp, day)) {
      const into = levelProgress(readState(memberId).xp).xpIntoLevel;
      run('UPDATE user_state SET team_xp_level = ? WHERE user_id = ?', Math.min(amount, into), memberId);
    }
  }
}

/** Mã ID của người dùng; chưa có thì tạo (người dùng cũ có từ trước khi có tính năng). */
export function friendCode(userId) {
  const row = get('SELECT friend_code FROM users WHERE id = ?', userId);
  if (!row) return null;
  if (row.friend_code) return row.friend_code;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = PREFIX;
    for (let i = 0; i < CODE_LEN; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
    if (get('SELECT 1 ok FROM users WHERE friend_code = ?', code)) continue;
    run('UPDATE users SET friend_code = ? WHERE id = ? AND friend_code IS NULL', code, userId);
    return get('SELECT friend_code FROM users WHERE id = ?', userId).friend_code;
  }
  throw new Error('Không tạo được mã ID');
}

/** Người dùng gõ "ek-7kq 2m9" vẫn tìm ra EK7KQ2M9. */
export const normalizeCode = (text) => String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Ghi nhận hôm nay người dùng đã mở app (gọi mỗi lần tải dữ liệu màn chủ). */
export function markOpened(userId, day = dayKey()) {
  readState(userId);
  run('UPDATE user_state SET last_open_day = ? WHERE user_id = ? AND (last_open_day IS NULL OR last_open_day <> ?)', day, userId, day);
}

const teamIdOf = (userId) => get('SELECT team_id FROM team_members WHERE user_id = ?', userId)?.team_id ?? null;
const memberCount = (teamId) => get('SELECT COUNT(*) n FROM team_members WHERE team_id = ?', teamId).n;
const userName = (userId) => get('SELECT name FROM users WHERE id = ?', userId)?.name || '';

/** Thông tin công khai của một người trong đội / trong lời mời. */
function publicProfile(userId, day) {
  const state = readState(userId);
  const progress = levelProgress(state.xp);
  const streak = streakStatus(userId, day);
  return {
    userId,
    name: userName(userId),
    level: progress.level ? {
      order: progress.level.order_index,
      name: progress.level.name,
      image: progress.level.character_image,
    } : null,
    xp: state.xp,
    percent: progress.percent,
    xpToNextLevel: progress.xpToNextLevel,
    nextLevelName: progress.next?.name ?? null,
    streak: { count: streak.count, countedToday: streak.countedToday, status: streak.status },
    openedToday: state.last_open_day === day,
  };
}

/** Toàn bộ những gì màn Heo Dream Team cần. */
export function teamBoard(userId, day = dayKey()) {
  const teamId = teamIdOf(userId);
  let team = null;
  if (teamId) {
    const row = get('SELECT * FROM teams WHERE id = ?', teamId);
    const nudgedByMe = new Set(all('SELECT to_user_id FROM team_nudges WHERE from_user_id = ? AND day = ?', userId, day).map((r) => r.to_user_id));
    const members = all('SELECT user_id, joined_at FROM team_members WHERE team_id = ? ORDER BY joined_at, user_id', teamId)
      .map((m) => {
        const p = publicProfile(m.user_id, day);
        const isMe = m.user_id === userId;
        return {
          ...p,
          isMe,
          isOwner: m.user_id === row.owner_id,
          nudgedToday: nudgedByMe.has(m.user_id),
          canNudge: !isMe && !p.streak.countedToday && !nudgedByMe.has(m.user_id),
        };
      })
      // Xếp theo cấp heo, rồi XP — người dẫn đầu ở trên cùng.
      .sort((a, b) => (b.level?.order ?? 0) - (a.level?.order ?? 0) || b.xp - a.xp || a.userId - b.userId)
      .map((m, i) => ({ ...m, rank: i + 1 }));
    team = {
      id: row.id,
      ownerId: row.owner_id,
      ownerName: userName(row.owner_id),
      isOwner: row.owner_id === userId,
      members,
      max: MAX_TEAM,
    };
  }

  const incoming = all(
    "SELECT id, from_user_id, created_at FROM team_invites WHERE to_user_id = ? AND status = 'pending' ORDER BY id DESC",
    userId,
  ).map((i) => ({ id: i.id, createdAt: i.created_at, from: publicProfile(i.from_user_id, day) }));
  const outgoing = all(
    "SELECT id, to_user_id, created_at FROM team_invites WHERE from_user_id = ? AND status = 'pending' ORDER BY id DESC",
    userId,
  ).map((i) => ({ id: i.id, createdAt: i.created_at, to: { userId: i.to_user_id, name: userName(i.to_user_id) } }));

  return {
    me: { userId, name: userName(userId), friendCode: friendCode(userId) },
    team,
    // Đang ở trong một đội có người khác: phải rời đội mới nhận được lời mời khác.
    inTeamWithOthers: Boolean(team && team.members.length > 1),
    invites: { incoming, outgoing },
    nudges: unseenNudges(userId, day),
  };
}

/** Lời nhắc giữ streak hôm nay mà người dùng chưa xem. */
export function unseenNudges(userId, day = dayKey()) {
  return all(
    `SELECT n.id, u.name FROM team_nudges n JOIN users u ON u.id = n.from_user_id
      WHERE n.to_user_id = ? AND n.day = ? AND n.seen_at IS NULL ORDER BY n.id`,
    userId, day,
  ).map((n) => ({ id: n.id, fromName: n.name }));
}

export function markNudgesSeen(userId, day = dayKey()) {
  run('UPDATE team_nudges SET seen_at = ? WHERE to_user_id = ? AND day = ? AND seen_at IS NULL', nowIso(), userId, day);
}

/** Số liệu nhỏ cho màn chủ / tabbar: lời mời đang chờ, lời nhắc chưa xem. */
export function teamAlerts(userId, day = dayKey()) {
  return {
    invites: get("SELECT COUNT(*) n FROM team_invites WHERE to_user_id = ? AND status = 'pending'", userId).n,
    nudges: unseenNudges(userId, day),
  };
}

/** Gửi lời mời vào đội của mình cho người có mã ID `code`. */
export function inviteByCode(userId, code) {
  const clean = normalizeCode(code);
  if (!clean) return fail('Nhập ID của bạn heo muốn mời');
  const target = get('SELECT id, name FROM users WHERE friend_code = ?', clean);
  if (!target) return fail('Không tìm thấy bạn heo nào có ID này');
  if (target.id === userId) return fail('Đây là ID của chính bạn');

  const myTeam = teamIdOf(userId);
  if (myTeam && teamIdOf(target.id) === myTeam) return fail('Bạn này đã ở trong đội của bạn');
  if (myTeam && memberCount(myTeam) >= MAX_TEAM) return fail(`Đội đã đủ ${MAX_TEAM} heo`);
  if (get("SELECT 1 ok FROM team_invites WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'", userId, target.id)) {
    return fail('Bạn đã mời bạn này rồi, đang chờ trả lời');
  }
  if (get("SELECT 1 ok FROM team_invites WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'", target.id, userId)) {
    return fail('Bạn này đã mời bạn vào đội — xem ở mục Lời mời');
  }
  const info = run('INSERT INTO team_invites (from_user_id, to_user_id, created_at) VALUES (?, ?, ?)', userId, target.id, nowIso());
  return { ok: true, inviteId: Number(info.lastInsertRowid), to: { userId: target.id, name: target.name } };
}

function pendingInviteTo(userId, inviteId) {
  return get("SELECT * FROM team_invites WHERE id = ? AND to_user_id = ? AND status = 'pending'", Number(inviteId), userId);
}

/** Rời đội, không kiểm tra gì (dùng chung cho "Rời đội" và lúc giải tán đội một người). */
function removeMember(userId) {
  const teamId = teamIdOf(userId);
  if (!teamId) return;
  run('DELETE FROM team_members WHERE user_id = ?', userId);
  const left = all('SELECT user_id FROM team_members WHERE team_id = ? ORDER BY joined_at, user_id', teamId);
  if (!left.length) {
    run('DELETE FROM teams WHERE id = ?', teamId);
  } else if (get('SELECT owner_id FROM teams WHERE id = ?', teamId).owner_id === userId) {
    // Trưởng đội rời đi: người vào đội sớm nhất làm trưởng đội.
    run('UPDATE teams SET owner_id = ? WHERE id = ?', left[0].user_id, teamId);
  }
}

/** Huỷ các lời mời mình đã gửi mà chưa ai trả lời (vì đội của mình đã đổi). */
function cancelOutgoing(userId) {
  run("UPDATE team_invites SET status = 'cancelled', responded_at = ? WHERE from_user_id = ? AND status = 'pending'", nowIso(), userId);
}

export function acceptInvite(userId, inviteId) {
  return tx(() => {
    const invite = pendingInviteTo(userId, inviteId);
    if (!invite) return fail('Lời mời không còn hiệu lực');
    const inviterId = invite.from_user_id;
    const myTeam = teamIdOf(userId);
    const inviterTeam = teamIdOf(inviterId);
    if (myTeam && myTeam === inviterTeam) {
      run("UPDATE team_invites SET status = 'accepted', responded_at = ? WHERE id = ?", nowIso(), invite.id);
      return { ok: true };
    }
    if (myTeam && memberCount(myTeam) > 1) {
      return fail('Bạn đang ở trong một đội. Rời đội hiện tại rồi mới vào được đội khác.');
    }
    if (inviterTeam && memberCount(inviterTeam) >= MAX_TEAM) return fail(`Đội này đã đủ ${MAX_TEAM} heo`);

    const now = nowIso();
    // Đội chỉ có mình mình: giải tán để vào đội mới.
    if (myTeam) removeMember(userId);
    let teamId = inviterTeam;
    if (!teamId) {
      teamId = Number(run('INSERT INTO teams (owner_id, created_at) VALUES (?, ?)', inviterId, now).lastInsertRowid);
      run('INSERT INTO team_members (user_id, team_id, joined_at) VALUES (?, ?, ?)', inviterId, teamId, now);
    }
    run('INSERT INTO team_members (user_id, team_id, joined_at) VALUES (?, ?, ?)', userId, teamId, now);
    run("UPDATE team_invites SET status = 'accepted', responded_at = ? WHERE id = ?", now, invite.id);
    // Lời mình đã mời người khác là mời vào đội cũ (đội một người) — huỷ đi.
    cancelOutgoing(userId);
    return { ok: true, teamId };
  });
}

export function declineInvite(userId, inviteId) {
  const invite = pendingInviteTo(userId, inviteId);
  if (!invite) return fail('Lời mời không còn hiệu lực');
  run("UPDATE team_invites SET status = 'declined', responded_at = ? WHERE id = ?", nowIso(), invite.id);
  return { ok: true };
}

export function cancelInvite(userId, inviteId) {
  const info = run(
    "UPDATE team_invites SET status = 'cancelled', responded_at = ? WHERE id = ? AND from_user_id = ? AND status = 'pending'",
    nowIso(), Number(inviteId), userId,
  );
  return info.changes ? { ok: true } : fail('Lời mời không còn hiệu lực');
}

export function leaveTeam(userId) {
  return tx(() => {
    if (!teamIdOf(userId)) return fail('Bạn chưa ở trong đội nào');
    removeMember(userId);
    cancelOutgoing(userId);
    return { ok: true };
  });
}

/** Nhắc một bạn cùng đội giữ streak hôm nay. */
export function nudgeMember(userId, targetId, day = dayKey()) {
  const target = Number(targetId);
  if (target === userId) return fail('Không tự nhắc mình được');
  const teamId = teamIdOf(userId);
  if (!teamId || teamIdOf(target) !== teamId) return fail('Bạn này không ở trong đội của bạn');
  if (streakStatus(target, day).countedToday) return fail('Bạn này đã giữ streak hôm nay rồi');
  const info = run(
    'INSERT OR IGNORE INTO team_nudges (from_user_id, to_user_id, day, created_at) VALUES (?, ?, ?, ?)',
    userId, target, day, nowIso(),
  );
  if (!info.changes) return fail('Hôm nay bạn đã nhắc bạn này rồi');
  return { ok: true };
}
