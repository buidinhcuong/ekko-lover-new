/** Programme health at a glance. */
import { el, formatDay } from '/shared/client.js';
import { badge, barChart, table } from '../ui.js';

const stat = (label, value, hint) => el('div.stat', {}, [
  el('div.stat__label', {}, label),
  el('div.stat__value', {}, String(value)),
  hint ? el('div.stat__hint', {}, hint) : null,
]);

export default async function dashboard(ctx) {
  const s = await ctx.api.get('/api/admin/stats/overview');
  const daily = s.dailyActive;
  const todayActive = daily.at(-1)?.users || 0;
  const peak = daily.reduce((a, b) => (b.users > a.users ? b : a), daily[0] || { users: 0, day: '' });
  const avgActive = daily.length ? daily.reduce((n, d) => n + d.users, 0) / daily.length : 0;
  const maxLevel = Math.max(1, ...s.levelDistribution.map((d) => d.members));

  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', {}, [
        el('h1', {}, 'Bảng điều khiển'),
        el('p', {}, 'Tình hình tham gia chương trình Giáo dục tài chính. Số liệu ở đây là tổng hợp, không hiển thị chi tiêu của từng cá nhân.'),
      ]),
    ]),

    el('div.stat-grid', {}, [
      stat('Người học', s.users.total, `${s.users.activeToday} hoạt động hôm nay`),
      stat('Đang giữ streak', s.users.withStreak, `${s.users.streak7Plus} người đạt từ 7 ngày`),
      stat('Bài học đã hoàn thành', s.engagement.lessonsCompleted, `trên ${s.content.lessons} bài đang xuất bản`),
      stat('Huy hiệu đã trao', s.engagement.badgesAwarded, `${s.content.badges} huy hiệu đang bật`),
    ]),

    el('div.split', {}, [
      el('div.panel', {}, [
        el('div.panel__head', {}, [el('h2', {}, 'Người hoạt động theo ngày'), el('span.cellmeta', {}, '14 ngày gần nhất')]),
        el('div.chartsum', {}, [
          el('div', {}, [el('small', {}, 'Hôm nay'), el('b', {}, `${todayActive} người`)]),
          el('div', {}, [el('small', {}, 'Trung bình / ngày'), el('b', {}, avgActive.toLocaleString('vi-VN', { maximumFractionDigits: 1 }))]),
          el('div', {}, [el('small', {}, 'Cao nhất'), el('b', {}, peak.users ? `${peak.users} · ${formatDay(peak.day)}` : '—')]),
        ]),
        barChart(daily.map((d) => ({
          label: d.day.slice(8),
          value: d.users,
          detail: `${formatDay(d.day)}: ${d.users} người hoạt động`,
        })), { height: 220 }),
      ]),

      el('div.panel', {}, [
        el('div.panel__head', {}, [el('h2', {}, 'Phân bố theo cấp độ')]),
        el('div.bars', {}, s.levelDistribution.map((level) => el('div.barrow', {}, [
          el('span', {}, `${level.order_index}. ${level.name}`),
          el('span.barrow__track', {}, [el('span.barrow__fill', { style: { width: `${Math.round((level.members / maxLevel) * 100)}%`, display: 'block' } })]),
          el('span.barrow__value', {}, String(level.members)),
        ]))),
      ]),
    ]),

    el('div.split', { style: { marginTop: '16px' } }, [
      el('div.panel', {}, [
        el('div.panel__head', {}, [el('h2', {}, 'Bài học được hoàn thành nhiều nhất')]),
        el('div.bars', {}, s.popularLessons.map((lesson) => el('div.barrow', {}, [
          el('span', { title: lesson.title, style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, lesson.title),
          el('span.barrow__track', {}, [el('span.barrow__fill', {
            style: {
              width: `${Math.round((lesson.completions / Math.max(1, s.popularLessons[0].completions)) * 100)}%`,
              display: 'block',
            },
          })]),
          el('span.barrow__value', {}, String(lesson.completions)),
        ]))),
      ]),

      el('div.panel', {}, [
        el('div.panel__head', {}, [el('h2', {}, 'Sử dụng ba chức năng')]),
        el('div.stat-grid', { style: { marginBottom: '0' } }, [
          stat('Ngân sách đã lập', s.engagement.budgets),
          stat('Mục tiêu đã tạo', s.engagement.goals),
          stat('Khoản chi đã ghi', s.engagement.expenses),
          stat('Tin nhắn tới Ekko bot', s.engagement.botMessages),
        ]),
      ]),
    ]),

    teamSection(s.teams),

    el('div.panel', {}, [
      el('div.panel__head', {}, [el('h2', {}, 'Nội dung đang xuất bản')]),
      el('div.stat-grid', { style: { marginBottom: '0' } }, [
        stat('Cấp độ', s.content.levels),
        stat('Mô đun', s.content.modules),
        stat('Bài học', s.content.lessons),
        stat('Frame nội dung', s.content.frames),
      ]),
    ]),
  ]);
}

// --- Heo Dream Team ------------------------------------------------------------
const pctOf = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const num = (n) => Math.round(n || 0).toLocaleString('vi-VN');

function teamSection(t) {
  const team = t.streakToday.team;
  const solo = t.streakToday.solo;
  const maxSize = Math.max(1, t.sizes.two, t.sizes.three, t.sizes.race, t.sizes.big);
  const sizeRow = (label, n) => el('div.barrow', {}, [
    el('span', {}, label),
    el('span.barrow__track', {}, [el('span.barrow__fill', { style: { width: `${Math.round((n / maxSize) * 100)}%`, display: 'block' } })]),
    el('span.barrow__value', {}, String(n)),
  ]);
  const race = `${t.raceSize.min}–${t.raceSize.max}`;
  const [year, mon] = t.month.split('-');

  return el('div.panel', { style: { marginBottom: '16px' } }, [
    el('div.panel__head', {}, [el('h2', {}, 'Heo Dream Team')]),
    el('div.stat-grid', {}, [
      stat('Số đội', num(t.teams), `${num(t.newTeamsWeek)} đội mới trong 7 ngày · TB ${t.avgSize.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} người/đội`),
      stat('Người học trong đội', num(t.membersInTeams), `${pctOf(t.membersInTeams, t.totalUsers)} tổng người học`),
      stat('Giữ streak hôm nay', pctOf(team.kept, team.total), `trong đội ${team.kept}/${team.total} · chơi một mình ${pctOf(solo.kept, solo.total)} (${solo.kept}/${solo.total})`),
      stat('Lời nhắc giữ streak', num(t.nudges.today), `hôm nay · 7 ngày: ${num(t.nudges.week)}, ${num(t.nudges.worked)} lần người được nhắc vào giữ streak`),
    ]),
    el('div.split', {}, [
      el('div', {}, [
        el('h3', { style: { margin: '0 0 8px' } }, 'Quy mô đội'),
        el('div.bars', {}, [
          sizeRow('2 người', t.sizes.two),
          sizeRow('3 người', t.sizes.three),
          sizeRow(`${race} người (đủ điều kiện đua nhóm)`, t.sizes.race),
          sizeRow(`${t.raceSize.max + 1}–${t.maxTeam} người`, t.sizes.big),
        ]),
      ]),
      el('div', {}, [
        el('h3', { style: { margin: '0 0 8px' } }, 'Lời mời & XP chia sẻ'),
        el('div.stat-grid', { style: { marginBottom: '0' } }, [
          stat('Lời mời đang chờ', num(t.invites.pending)),
          stat('Tỷ lệ nhận lời mời', pctOf(t.invites.accepted, t.invites.accepted + t.invites.declined), `${num(t.invites.accepted)} nhận · ${num(t.invites.declined)} từ chối`),
          stat('XP chia cho bạn cùng đội', num(t.sharedXp), `mức chia hiện tại ${t.xpSharePercent}%`),
        ]),
      ]),
    ]),
    el('h3', { style: { margin: '16px 0 4px' } }, `Bảng xếp hạng đội — tháng ${mon}/${year}`),
    el('p.hint', { style: { margin: '0 0 8px' } }, `Theo tổng XP các thành viên tự kiếm trong tháng (không tính XP được chia từ bạn cùng đội). Giải nhóm Cuộc đua Ekko Lover dành cho đội ${race} người.`),
    t.leaderboard.length ? table(
      [{ label: '#' }, { label: 'Đội (trưởng đội)' }, { label: 'Số người', align: 'right' }, { label: 'XP tháng này', align: 'right' }, { label: 'XP tổng', align: 'right' }, { label: 'Giữ streak hôm nay', align: 'right' }, { label: 'Đua nhóm' }],
      t.leaderboard,
      (row) => el('tr', {}, [
        el('td', {}, String(t.leaderboard.indexOf(row) + 1)),
        el('td', {}, [el('strong', {}, `Đội của ${row.ownerName}`), el('span.cellmeta', {}, `lập ${formatDay(row.createdAt.slice(0, 10))}`)]),
        el('td.num', {}, String(row.size)),
        el('td.num', {}, el('strong', {}, num(row.xpMonth))),
        el('td.num', {}, num(row.xpTotal)),
        el('td.num', {}, `${row.keptToday}/${row.size}`),
        el('td', {}, row.raceEligible ? badge('Đủ điều kiện', 'success') : badge(row.size < t.raceSize.min ? `Cần thêm ${t.raceSize.min - row.size}` : `Quá ${t.raceSize.max} người`, 'neutral')),
      ]),
    ) : el('p.hint', {}, 'Chưa có đội nào (đội cần từ 2 người).'),
  ]);
}
