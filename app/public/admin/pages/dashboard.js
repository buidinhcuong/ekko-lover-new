/** Programme health at a glance. */
import { el, formatDay } from '/shared/client.js';

const stat = (label, value, hint) => el('div.stat', {}, [
  el('div.stat__label', {}, label),
  el('div.stat__value', {}, String(value)),
  hint ? el('div.stat__hint', {}, hint) : null,
]);

export default async function dashboard(ctx) {
  const s = await ctx.api.get('/api/admin/stats/overview');
  const maxDaily = Math.max(1, ...s.dailyActive.map((d) => d.users));
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
        el('div.panel__head', {}, [el('h2', {}, 'Người hoạt động theo ngày')]),
        s.dailyActive.length
          ? el('div', {}, [
            el('div.spark', {}, s.dailyActive.map((d) => el('div', {
              style: { height: `${Math.round((d.users / maxDaily) * 100)}%` },
              title: `${formatDay(d.day)}: ${d.users} người`,
            }))),
            el('div.spark-labels', {}, s.dailyActive.map((d) => el('span', {}, d.day.slice(8)))),
          ])
          : el('p.hint', {}, 'Chưa có hoạt động nào trong 14 ngày qua.'),
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
