/**
 * Số liệu Bảng điều khiển của Admin (chương trình Giáo dục tài chính).
 *
 * `scope` (companyScope) lọc mọi số liệu về người học theo một công ty; phần nội
 * dung (bài học, tin đang đăng) thì giữ nguyên. Quản trị Ekko chọn công ty tuỳ ý;
 * HR doanh nghiệp luôn bị khoá vào công ty của mình (routes/feed.js).
 *
 * `minKeywordUsers`: từ khoá Ekko bot chỉ hiện khi có từ ngần này người cùng gõ —
 * HR dùng ngưỡng ẩn danh của công ty (mặc định 5), Ekko dùng 2.
 */
import { all, get } from '../db.js';
import { dayKey } from '../lib/time.js';
import { teamOverview } from './teamStats.js';
import { botKeywordReport } from './botTopics.js';

export function programOverview(scope, { today = dayKey(), minKeywordUsers } = {}) {
  const counts = (sql, ...args) => get(sql, ...args).n;
  const w = (col = 'user_id') => scope.where(col);
  const p = scope.params;

  return {
    employer: scope.employer,
    users: {
      total: counts(`SELECT COUNT(*) n FROM users WHERE ${w('id')}`, ...p),
      activeToday: counts(`SELECT COUNT(DISTINCT user_id) n FROM activity_log WHERE day = ? AND ${w()}`, today, ...p),
      withStreak: counts(`SELECT COUNT(*) n FROM user_state WHERE streak_count > 0 AND ${w()}`, ...p),
      streak7Plus: counts(`SELECT COUNT(*) n FROM user_state WHERE streak_count >= 7 AND ${w()}`, ...p),
    },
    content: {
      modules: counts('SELECT COUNT(*) n FROM modules WHERE is_published = 1'),
      lessons: counts('SELECT COUNT(*) n FROM lessons WHERE is_published = 1'),
      frames: counts('SELECT COUNT(*) n FROM frames'),
      badges: counts('SELECT COUNT(*) n FROM badges WHERE is_active = 1'),
      levels: counts('SELECT COUNT(*) n FROM levels WHERE is_active = 1'),
    },
    engagement: {
      lessonsCompleted: counts(`SELECT COUNT(*) n FROM lesson_progress WHERE status = ? AND ${w()}`, 'completed', ...p),
      badgesAwarded: counts(`SELECT COUNT(*) n FROM user_badges WHERE ${w()}`, ...p),
      budgets: counts(`SELECT COUNT(DISTINCT user_id || month) n FROM budget_limits WHERE ${w()}`, ...p),
      goals: counts(`SELECT COUNT(*) n FROM goals WHERE ${w()}`, ...p),
      expenses: counts(`SELECT COUNT(*) n FROM expenses WHERE ${w()}`, ...p),
      botMessages: counts(`SELECT COUNT(*) n FROM bot_messages WHERE role = ? AND ${w()}`, 'user', ...p),
    },
    levelDistribution: all(
      `SELECT l.name, l.order_index, COUNT(s.user_id) AS members
         FROM levels l LEFT JOIN user_state s ON s.level_id = l.id AND ${w('s.user_id')}
        GROUP BY l.id ORDER BY l.order_index`,
      ...p,
    ),
    popularLessons: all(
      `SELECT l.title, m.title AS module_title, COUNT(lp.user_id) AS completions
         FROM lessons l
         JOIN modules m ON m.id = l.module_id
         LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.status = 'completed' AND ${w('lp.user_id')}
        GROUP BY l.id ORDER BY completions DESC, l.order_index LIMIT 8`,
      ...p,
    ),
    // Heo Dream Team: số đội, streak trong đội, lời mời / lời nhắc, xếp hạng tháng.
    teams: teamOverview(today, scope),
    // Ekko bot: người dùng hỏi về chủ đề / từ khoá tài chính nào (30 ngày, chỉ số đếm).
    botTopics: botKeywordReport({ days: 30, today, scope, minUsers: minKeywordUsers }),
    // Tin tức được mở đọc nhiều nhất trong 30 ngày (mỗi người mỗi tin tính tối đa 1 lần/ngày).
    news: (() => {
      const from = new Date(`${today}T00:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 29);
      const since = from.toISOString().slice(0, 10);
      return {
        days: 30,
        published: counts('SELECT COUNT(*) n FROM news WHERE is_published = 1'),
        readers: counts(`SELECT COUNT(DISTINCT user_id) n FROM activity_log WHERE kind = 'news_read' AND day >= ? AND ${w()}`, since, ...p),
        opens: counts(`SELECT COUNT(*) n FROM activity_log WHERE kind = 'news_read' AND day >= ? AND ${w()}`, since, ...p),
        top: all(
          `SELECT n.id, n.title, n.category, COUNT(a.id) opens, COUNT(DISTINCT a.user_id) readers
             FROM activity_log a JOIN news n ON CAST(a.ref AS INTEGER) = n.id
            WHERE a.kind = 'news_read' AND a.day >= ? AND ${w('a.user_id')}
            GROUP BY n.id ORDER BY opens DESC, readers DESC LIMIT 10`,
          since, ...p,
        ),
      };
    })(),
    // 14 ngày gần nhất theo giờ Việt Nam, đủ từng ngày (ngày không ai hoạt động = 0).
    dailyActive: (() => {
      const days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(`${today}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - (13 - i));
        return d.toISOString().slice(0, 10);
      });
      const byDay = new Map(all(
        `SELECT day, COUNT(DISTINCT user_id) AS users FROM activity_log WHERE day BETWEEN ? AND ? AND ${w()} GROUP BY day`,
        days[0], today, ...p,
      ).map((r) => [r.day, r.users]));
      return days.map((day) => ({ day, users: byDay.get(day) || 0 }));
    })(),
  };
}
