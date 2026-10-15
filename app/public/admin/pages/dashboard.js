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
    botTopicSection(s.botTopics),
    newsSection(s.news, s.users.total),

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

// --- Ekko bot: người dùng hỏi gì ------------------------------------------------
function hbars(rows, { empty }) {
  if (!rows.length) return el('p.hint', {}, empty);
  const max = Math.max(1, ...rows.map((r) => r.messages));
  return el('div.bars', {}, rows.map((r) => el('div.barrow.barrow--wide', { title: `${r.label}: ${r.messages} câu hỏi từ ${r.users} người` }, [
    el('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.label),
    el('span.barrow__track', {}, [el('span.barrow__fill', { style: { width: `${Math.round((r.messages / max) * 100)}%`, display: 'block' } })]),
    el('span.barrow__value', {}, [`${r.messages}`, el('span.cellmeta', { style: { display: 'inline', marginLeft: '4px' } }, `· ${r.users} người`)]),
  ])));
}

function botTopicSection(b) {
  const t = b.totals;
  return el('div.panel', { style: { marginBottom: '16px' } }, [
    el('div.panel__head', {}, [
      el('h2', {}, 'Người dùng hỏi Ekko bot về gì'),
      el('span.cellmeta', {}, `${b.days} ngày gần nhất`),
    ]),
    el('div.chartsum', {}, [
      el('div', {}, [el('small', {}, 'Câu hỏi'), el('b', {}, `${t.questions}`)]),
      el('div', {}, [el('small', {}, 'Người hỏi'), el('b', {}, `${t.askers}`)]),
      el('div', {}, [el('small', {}, 'Tin ghi chi tiêu (không tính)'), el('b', {}, `${t.expenseLogs}`)]),
      el('div', {}, [el('small', {}, 'Câu ngoài phạm vi'), el('b', {}, `${t.outOfScope}`)]),
    ]),
    el('div.split', {}, [
      el('div', {}, [
        el('h3', { style: { margin: '0 0 8px' } }, 'Chủ đề tài chính'),
        hbars(b.topics, { empty: 'Chưa có câu hỏi nào trong kỳ.' }),
        t.untagged ? el('p.hint', { style: { margin: '8px 0 0' } }, `${t.untagged} câu hỏi chưa khớp chủ đề nào (chào hỏi, hỏi về app…).`) : null,
      ]),
      el('div', {}, [
        el('h3', { style: { margin: '0 0 8px' } }, 'Từ khoá hay gặp'),
        hbars(b.keywords.slice(0, 12).map((k) => ({ label: k.text, messages: k.messages, users: k.users })), {
          empty: `Chưa có từ khoá nào được ít nhất ${b.minUsers} người cùng hỏi.`,
        }),
      ]),
    ]),
    el('p.hint', { style: { margin: '12px 0 0' } }, `Chỉ tính câu hỏi (bỏ tin ghi chi tiêu, đổi mục). Một câu có thể thuộc nhiều chủ đề. Từ khoá chỉ hiện khi có từ ${b.minUsers} người trở lên cùng gõ — không hiển thị câu gốc của ai.`),
  ]);
}

// --- Tin tức được đọc nhiều nhất ------------------------------------------------
function newsSection(n, totalUsers) {
  const max = Math.max(1, ...n.top.map((x) => x.opens));
  return el('div.panel', { style: { marginBottom: '16px' } }, [
    el('div.panel__head', {}, [el('h2', {}, 'Tin tức được đọc nhiều nhất'), el('span.cellmeta', {}, `${n.days} ngày gần nhất`)]),
    el('div.chartsum', {}, [
      el('div', {}, [el('small', {}, 'Lượt mở tin'), el('b', {}, `${n.opens}`)]),
      el('div', {}, [el('small', {}, 'Người đọc'), el('b', {}, `${n.readers}`)]),
      el('div', {}, [el('small', {}, 'Tỷ lệ người học có đọc tin'), el('b', {}, totalUsers ? `${Math.round((n.readers / totalUsers) * 100)}%` : '—')]),
      el('div', {}, [el('small', {}, 'Tin đang đăng'), el('b', {}, `${n.published}`)]),
    ]),
    n.top.length
      ? el('div.bars', {}, n.top.map((x, i) => el('div.barrow.barrow--news', { title: `${x.title}: ${x.opens} lượt mở, ${x.readers} người đọc` }, [
        el('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [
          el('b', { style: { marginRight: '6px', color: 'var(--text-tertiary)' } }, `${i + 1}.`), x.title,
          x.category ? el('span.cellmeta', { style: { display: 'inline', marginLeft: '6px' } }, x.category) : null,
        ]),
        el('span.barrow__track', {}, [el('span.barrow__fill', { style: { width: `${Math.round((x.opens / max) * 100)}%`, display: 'block' } })]),
        el('span.barrow__value', {}, [`${x.opens}`, el('span.cellmeta', { style: { display: 'inline', marginLeft: '4px' } }, `· ${x.readers} người`)]),
      ])))
      : el('p.hint', {}, 'Chưa có ai mở tin nào trong kỳ.'),
    el('p.hint', { style: { margin: '12px 0 0' } }, 'Lượt mở: mỗi người mở một tin được tính tối đa 1 lần mỗi ngày.'),
  ]);
}
