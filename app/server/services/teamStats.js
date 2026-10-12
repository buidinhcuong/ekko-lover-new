/**
 * Số liệu Heo Dream Team cho Bảng điều khiển của Admin: có bao nhiêu đội, người
 * trong đội giữ streak ra sao so với người chơi một mình, lời mời / lời nhắc,
 * và bảng xếp hạng đội trong tháng (Cuộc đua Ekko Lover).
 *
 * "Đội" = có từ 2 người trở lên (đội 1 người là người mời chưa có ai nhận).
 * XP tháng của đội = tổng XP các thành viên tự kiếm trong tháng, KHÔNG cộng phần
 * XP chia từ bạn cùng đội (kind 'team_xp') — phần đó chỉ là bản sao XP của người
 * khác, cộng vào sẽ tính một điểm hai lần.
 */
import { all, get } from '../db.js';
import { dayKey } from '../lib/time.js';
import { streakStatus } from './streak.js';
import { MAX_TEAM, teamXpShare } from './teams.js';

/** Quy mô đội được dự giải nhóm của Cuộc đua Ekko Lover. */
export const RACE_TEAM_SIZE = { min: 4, max: 6 };

function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function teamOverview(today = dayKey()) {
  const month = today.slice(0, 7);
  const weekAgo = shiftDay(today, -6);

  const teams = all(
    `SELECT t.id, t.owner_id, o.name owner_name, t.created_at, COUNT(m.user_id) size
       FROM teams t JOIN team_members m ON m.team_id = t.id JOIN users o ON o.id = t.owner_id
      GROUP BY t.id HAVING COUNT(m.user_id) >= 2`,
  );
  const teamIds = new Set(teams.map((t) => t.id));
  const members = all('SELECT user_id, team_id FROM team_members').filter((m) => teamIds.has(m.team_id));
  const inTeam = new Set(members.map((m) => m.user_id));
  const totalUsers = get('SELECT COUNT(*) n FROM users').n;

  // Giữ streak hôm nay: người trong đội so với người chơi một mình.
  let teamKept = 0;
  const keptByUser = new Map();
  for (const { user_id: id } of members) {
    const kept = streakStatus(id, today).countedToday;
    keptByUser.set(id, kept);
    if (kept) teamKept += 1;
  }
  const soloIds = all('SELECT id FROM users').map((u) => u.id).filter((id) => !inTeam.has(id));
  const soloKept = soloIds.filter((id) => streakStatus(id, today).countedToday).length;

  const sizes = { two: 0, three: 0, race: 0, big: 0 };
  for (const t of teams) {
    if (t.size === 2) sizes.two += 1;
    else if (t.size === 3) sizes.three += 1;
    else if (t.size <= RACE_TEAM_SIZE.max) sizes.race += 1;
    else sizes.big += 1;
  }

  // Lời mời và lời nhắc.
  const invites = get(
    `SELECT SUM(status = 'pending') pending, SUM(status = 'accepted') accepted,
            SUM(status = 'declined') declined, COUNT(*) total FROM team_invites`,
  );
  const nudgesToday = get('SELECT COUNT(*) n FROM team_nudges WHERE day = ?', today).n;
  const nudgesWeek = all('SELECT to_user_id, day, created_at FROM team_nudges WHERE day BETWEEN ? AND ?', weekAgo, today);
  // Lời nhắc "có tác dụng": người được nhắc có hoạt động (học / ghi chép…) sau lúc nhắc, cùng ngày.
  const nudgesWorked = nudgesWeek.filter((n) => get(
    "SELECT 1 FROM activity_log WHERE user_id = ? AND day = ? AND created_at >= ? AND kind NOT IN ('team_xp', 'daily_checkin') LIMIT 1",
    n.to_user_id, n.day, n.created_at,
  )).length;

  // Bảng xếp hạng đội trong tháng.
  const xpMonth = new Map(all(
    "SELECT user_id, COALESCE(SUM(xp), 0) xp FROM activity_log WHERE substr(day, 1, 7) = ? AND kind <> 'team_xp' GROUP BY user_id",
    month,
  ).map((r) => [r.user_id, r.xp]));
  const xpTotal = new Map(all('SELECT user_id, xp FROM user_state').map((r) => [r.user_id, r.xp]));
  const byTeam = new Map(teams.map((t) => [t.id, { ...t, xpMonth: 0, xpTotal: 0, keptToday: 0 }]));
  for (const m of members) {
    const t = byTeam.get(m.team_id);
    t.xpMonth += xpMonth.get(m.user_id) || 0;
    t.xpTotal += xpTotal.get(m.user_id) || 0;
    if (keptByUser.get(m.user_id)) t.keptToday += 1;
  }
  const leaderboard = [...byTeam.values()]
    .map((t) => ({
      id: t.id, ownerName: t.owner_name, size: t.size, createdAt: t.created_at,
      xpMonth: t.xpMonth, xpTotal: t.xpTotal, keptToday: t.keptToday,
      raceEligible: t.size >= RACE_TEAM_SIZE.min && t.size <= RACE_TEAM_SIZE.max,
    }))
    .sort((a, b) => b.xpMonth - a.xpMonth || b.xpTotal - a.xpTotal)
    .slice(0, 10);

  return {
    month,
    maxTeam: MAX_TEAM,
    raceSize: RACE_TEAM_SIZE,
    xpSharePercent: teamXpShare(),
    teams: teams.length,
    membersInTeams: inTeam.size,
    totalUsers,
    avgSize: teams.length ? inTeam.size / teams.length : 0,
    sizes,
    newTeamsWeek: teams.filter((t) => t.created_at.slice(0, 10) >= weekAgo).length,
    streakToday: {
      team: { kept: teamKept, total: inTeam.size },
      solo: { kept: soloKept, total: soloIds.length },
    },
    invites: { pending: invites.pending || 0, accepted: invites.accepted || 0, declined: invites.declined || 0, total: invites.total || 0 },
    nudges: { today: nudgesToday, week: nudgesWeek.length, worked: nudgesWorked },
    sharedXp: get('SELECT COALESCE(SUM(team_xp_total), 0) n FROM user_state').n,
    leaderboard,
  };
}
