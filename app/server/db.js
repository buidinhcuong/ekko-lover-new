/**
 * SQLite storage via Node's built-in `node:sqlite` (Node >= 22.5) so the whole
 * project installs with zero dependencies.
 */
import './env.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Trên Vercel chỉ /tmp ghi được (và mất khi hàm khởi động lại) — bản demo ở đó
// tự gieo lại dữ liệu mẫu mỗi lần khởi động. Chạy ở máy thì nằm trong app/data.
export const DATA_DIR = process.env.EKKO_DATA_DIR
  || (process.env.VERCEL ? '/tmp/ekko-gdtc' : join(here, '..', 'data'));
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, 'gdtc.sqlite'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

db.exec(`
-- ---------- identity ----------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  ekko_user_id  TEXT NOT NULL UNIQUE,          -- subject from the Ekko app SSO token
  name          TEXT NOT NULL,
  email         TEXT,
  avatar_url    TEXT,
  employer      TEXT,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT
);

CREATE TABLE IF NOT EXISTS user_state (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp                 INTEGER NOT NULL DEFAULT 0,
  level_id           INTEGER REFERENCES levels(id),
  streak_count       INTEGER NOT NULL DEFAULT 0,
  streak_best        INTEGER NOT NULL DEFAULT 0,
  last_active_day    TEXT,                     -- YYYY-MM-DD in app timezone
  streak_started_day TEXT,
  updated_at         TEXT NOT NULL
);

-- ---------- admin-managed catalogue ----------
CREATE TABLE IF NOT EXISTS levels (
  id              INTEGER PRIMARY KEY,
  order_index     INTEGER NOT NULL,
  name            TEXT NOT NULL,
  emoji           TEXT,                        -- shorthand icon for the rank
  perk            TEXT,                        -- what the member unlocks here
  tagline         TEXT,                        -- legacy, no longer edited
  description     TEXT,                        -- legacy, no longer edited
  xp_required     INTEGER NOT NULL DEFAULT 0,
  island_image    TEXT,                        -- island artwork for this level
  character_image TEXT,                        -- pig character artwork for this level
  is_active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS badges (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,                          -- emoji or asset path
  rule_type     TEXT NOT NULL,                 -- see services/progression.js RULES
  rule_value    INTEGER NOT NULL DEFAULT 1,
  rule_target   TEXT,                          -- optional scope (feature code, module slug)
  xp_reward     INTEGER NOT NULL DEFAULT 0,
  order_index   INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1
);

-- Thử thách tự làm mới theo kỳ (once | daily | weekly) — xem services/challenges.js.
CREATE TABLE IF NOT EXISTS challenges (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  period      TEXT NOT NULL CHECK (period IN ('once','daily','weekly')),
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  rule_type   TEXT NOT NULL,
  rule_value  INTEGER NOT NULL DEFAULT 1,
  rule_target TEXT,
  xp_reward   INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);

-- Thưởng thử thách đã nhận, theo kỳ: period_key = 'once' | 'YYYY-MM-DD' (ngày,
-- hoặc thứ Hai đầu tuần). challenge_id = 0 là thưởng thêm khi xong cả bộ của kỳ.
CREATE TABLE IF NOT EXISTS user_challenges (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL,
  period       TEXT NOT NULL,
  period_key   TEXT NOT NULL,
  claimed_at   TEXT NOT NULL,
  xp           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, challenge_id, period, period_key)
);

-- Mỗi lượt gọi AI một dòng, để giới hạn lượt mỗi người mỗi ngày (services/aiQuota.js).
CREATE TABLE IF NOT EXISTS ai_calls (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  kind       TEXT NOT NULL,                    -- bot | quick | receipt | advice
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_calls_user_day ON ai_calls(user_id, day);

-- Câu hỏi Ekko bot từ chối vì ngoài phạm vi tài chính / app, để Admin xem lại.
CREATE TABLE IF NOT EXISTS ai_out_of_scope (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at TEXT NOT NULL,
  PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS modules (
  id           INTEGER PRIMARY KEY,
  order_index  INTEGER NOT NULL,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  summary      TEXT,
  cover_image  TEXT,
  unlock_level INTEGER NOT NULL DEFAULT 1,     -- level order_index needed to open
  is_published INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lessons (
  id           INTEGER PRIMARY KEY,
  module_id    INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  order_index  INTEGER NOT NULL,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL,
  summary      TEXT,
  cover_image  TEXT,
  est_minutes  INTEGER NOT NULL DEFAULT 3,
  is_published INTEGER NOT NULL DEFAULT 1,
  UNIQUE (module_id, slug)
);

-- A lesson is an ordered list of frames. The kind column decides how the
-- player renders payload (JSON): text_image | slide | interactive | quiz.
CREATE TABLE IF NOT EXISTS frames (
  id          INTEGER PRIMARY KEY,
  lesson_id   INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('text_image','slide','interactive','quiz')),
  payload     TEXT NOT NULL DEFAULT '{}'
);

-- Trắc nghiệm cuối mô đun. Tách khỏi frames vì nó thuộc mô đun, không thuộc
-- một bài học cụ thể.
CREATE TABLE IF NOT EXISTS module_questions (
  id          INTEGER PRIMARY KEY,
  module_id   INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  question    TEXT NOT NULL,
  options     TEXT NOT NULL DEFAULT '[]'   -- [{ text, correct, explain }]
);

CREATE TABLE IF NOT EXISTS module_quiz_results (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id    INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  correct      INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  attempts     INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  PRIMARY KEY (user_id, module_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  frame_index  INTEGER NOT NULL DEFAULT 0,
  quiz_correct INTEGER NOT NULL DEFAULT 0,
  quiz_total   INTEGER NOT NULL DEFAULT 0,
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (user_id, lesson_id)
);

-- The three back-office features surfaced as islands in the world.
CREATE TABLE IF NOT EXISTS features (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,           -- budget | goals | expenses | explore
  name         TEXT NOT NULL,
  description  TEXT,
  island_image TEXT,
  route        TEXT NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  xp_per_day   INTEGER NOT NULL DEFAULT 10,    -- XP for first use of the day
  is_enabled   INTEGER NOT NULL DEFAULT 1
);

-- ---------- feature data ----------
-- Nhóm level 1 cố định: Nhu cầu / Mong muốn / Sự cố. Không tách bảng riêng vì
-- chỉ có ba nhóm, không đổi thường xuyên như nhóm chi tiêu (categories).
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  icon        TEXT,
  color       TEXT,
  keywords    TEXT,                            -- comma list used by the bot's parser
  group_code  TEXT,                            -- 'needs' | 'wants' | 'incident'
  group_label TEXT,                            -- 'Nhu cầu' | 'Mong muốn' | 'Sự cố'
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Mẫu chi tiêu lặp lại hằng tháng: mỗi lần vào sổ, server tự "vá" khoản của
-- tháng hiện tại nếu chưa có (xem services/recurring.js) — không cần một
-- tiến trình nền chạy nền, vì app này không có scheduler riêng.
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,
  category_id    INTEGER REFERENCES categories(id),
  note           TEXT,
  day_of_month   INTEGER NOT NULL DEFAULT 1,     -- 1-28, để tháng nào cũng có ngày này
  last_month     TEXT,                           -- YYYY-MM của lần vá gần nhất
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);

-- Sổ thu nhập: mỗi lần nhận tiền ghi một dòng, phân theo 4 loại cố định (TN
-- thường xuyên / TN không thường xuyên / quà, thưởng / khác) — cùng cấu trúc
-- lặp lại hằng tháng như expenses/recurring_expenses ở trên, "vá" khi mở màn
-- thay vì chạy nền, vì app không có scheduler.
CREATE TABLE IF NOT EXISTS income_recurring (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,
  category       TEXT NOT NULL,
  note           TEXT,
  day_of_month   INTEGER NOT NULL DEFAULT 1,
  last_month     TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS income_entries (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,
  category       TEXT NOT NULL CHECK (category IN ('regular','irregular','gift','other')),
  note           TEXT,
  received_on    TEXT NOT NULL,
  recurring_id   INTEGER REFERENCES income_recurring(id),
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      TEXT NOT NULL,                    -- YYYY-MM
  income     INTEGER NOT NULL DEFAULT 0,
  note       TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, month)
);

CREATE TABLE IF NOT EXISTS budget_items (
  id          INTEGER PRIMARY KEY,
  budget_id   INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  planned     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (budget_id, category_id)
);

-- Ngân sách kiểu mới: mỗi dòng là một hạn mức chi tối đa trong MỘT tháng dương
-- lịch, cho một nhóm chi tiêu con (category_id) hoặc cả nhóm level 1
-- (category_id = NULL). Không còn khái niệm thu nhập/phân bổ như bảng
-- budgets cũ — bảng đó giữ lại nguyên trạng cho dữ liệu lịch sử, không dùng
-- nữa. Cột edited_direction chỉ ghi nhớ CHIỀU của lần sửa hạn mức gần nhất
-- ('up'/'down'), để phần vượt ngân sách tô đậm/nhạt hơn — một tín hiệu hình
-- ảnh nhắc người dùng nhớ họ vừa sửa.
CREATE TABLE IF NOT EXISTS budget_limits (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month            TEXT NOT NULL,                 -- YYYY-MM
  group_code       TEXT NOT NULL,                 -- 'needs' | 'wants' | 'incident'
  category_id      INTEGER REFERENCES categories(id),
  amount           INTEGER NOT NULL,
  edited_direction TEXT,                          -- 'up' | 'down' | NULL
  notify_80        INTEGER NOT NULL DEFAULT 0,
  note             TEXT,
  set_on           TEXT,
  repeat_next      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  UNIQUE (user_id, month, group_code, category_id)
);

-- Người dùng có thể tắt banner tổng kết ngân sách của một tháng đã kết thúc
-- (nút "Chiến đấu"/"Tiếp tục") — nhớ theo tháng để không hiện lại.
CREATE TABLE IF NOT EXISTS budget_recap_dismissed (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,
  dismissed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, month)
);

-- Thu nhập tháng do người dùng tự gõ tay (không phải một sổ thu nhập thật) —
-- chỉ để tính "đã dùng bao nhiêu % thu nhập" ở báo cáo Ghi chép chi tiêu, có
-- hay không có số này thì việc ghi chép/phân tích chi tiêu vẫn chạy bình thường.
CREATE TABLE IF NOT EXISTS monthly_income (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      TEXT NOT NULL,
  amount     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, month)
);

CREATE TABLE IF NOT EXISTS goals (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  target_amount INTEGER NOT NULL,
  saved_amount  INTEGER NOT NULL DEFAULT 0,
  deadline      TEXT,
  icon          TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','archived')),
  created_at    TEXT NOT NULL,
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS goal_deposits (
  id         INTEGER PRIMARY KEY,
  goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);

-- Đối tác "Tiết kiệm cùng Ekko" và lãi suất theo từng kỳ hạn — dữ liệu mẫu,
-- Admin portal sửa được. Cột "rates" là JSON {"6": 8, "9": 8.3, ...} (kỳ hạn
-- tháng -> %/năm), cùng kiểu lưu JSON trong cột TEXT như "frames.payload".
CREATE TABLE IF NOT EXISTS savings_channels (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  logo        TEXT,
  rates       TEXT NOT NULL DEFAULT '{}',
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Một "nguồn tiết kiệm" của người dùng: tự thêm tay ("manual"), gửi qua
-- "Tiết kiệm cùng Ekko" ("ekko", gắn với một savings_channels + kỳ hạn), hoặc
-- tạo từ banner "tiền còn lại tháng trước" ("recap"). Không có dòng tiền thật
-- nào bị trừ — đây chỉ là ghi chép để theo dõi lãi dự kiến, giống cách
-- "goals"/"budget_limits" không đụng tới một ví tiền thật nào.
CREATE TABLE IF NOT EXISTS savings_sources (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  rate_percent REAL NOT NULL DEFAULT 0,
  rate_period  TEXT NOT NULL DEFAULT 'year' CHECK (rate_period IN ('month','year')),
  term_months  INTEGER,
  started_on   TEXT,                     -- ngày bắt đầu gửi — dùng tính lãi TÍCH LUỸ đến hôm nay
  ended_on     TEXT,                     -- ngày đáo hạn (nếu có) — chặn lãi không chạy quá hạn
  -- 'in' = nguồn tiết kiệm (cộng vào tổng), 'out' = rút tiết kiệm/vay (trừ
  -- khỏi tổng, cả gốc lẫn lãi — xem savingsPayload trong services/savings.js).
  direction    TEXT NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ekko','recap')),
  note         TEXT,
  created_at   TEXT NOT NULL
);

-- Cùng cơ chế với "budget_recap_dismissed": tắt banner "bổ sung tiền còn lại
-- vào Quỹ tiết kiệm Ekko" của một tháng thì nhớ theo tháng, không hiện lại.
CREATE TABLE IF NOT EXISTS savings_recap_dismissed (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,
  dismissed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, month)
);

-- Lãi suất tiết kiệm THAM KHẢO của các ngân hàng thật ngoài thị trường (khác
-- savings_channels — đó là 3 đối tác demo riêng cho luồng "Gửi tiết kiệm cùng
-- Ekko"). Widget so sánh trên màn Tiết kiệm, không phải dữ liệu sống — không
-- có API công khai miễn phí nào cho lãi suất ngân hàng VN, nên đây là số liệu
-- Admin portal tự cập nhật định kỳ. "rates" cùng khuôn JSON kỳ hạn->%/năm như
-- savings_channels.rates.
CREATE TABLE IF NOT EXISTS bank_interest_rates (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  group_code  TEXT NOT NULL CHECK (group_code IN ('state','joint_stock')),
  logo        TEXT,
  rates       TEXT NOT NULL DEFAULT '{}',
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plans (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  total_tasks   INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  deadline      TEXT,
  icon          TEXT,
  period        TEXT NOT NULL DEFAULT 'month',
  template      TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','archived')),
  created_at    TEXT NOT NULL,
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS plan_tasks (
  id         INTEGER PRIMARY KEY,
  plan_id    INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  note       TEXT,
  created_at TEXT NOT NULL
);

-- Tin tức / mẹo tài chính hiển thị ở carousel màn chủ (concept "Ekko Lover").
CREATE TABLE IF NOT EXISTS news (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  summary       TEXT,
  category      TEXT,                          -- nhãn nhỏ hiện phía trên tiêu đề, vd "Mẹo"
  image         TEXT,
  body          TEXT,                          -- nội dung đầy đủ, hiện ở màn xem chi tiết
  read_minutes  INTEGER NOT NULL DEFAULT 3,
  order_index   INTEGER NOT NULL DEFAULT 0,
  is_published  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  note        TEXT,
  spent_on    TEXT NOT NULL,                   -- YYYY-MM-DD
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','bot')),
  created_at  TEXT NOT NULL
);

-- ---------- gamification bookkeeping ----------
CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                    -- lesson_completed | module_completed | feature_used | ...
  ref        TEXT,
  day        TEXT NOT NULL,
  xp         INTEGER NOT NULL DEFAULT 0,
  meta       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_messages (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','bot')),
  text       TEXT NOT NULL,
  meta       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lessons_module   ON lessons(module_id, order_index);
CREATE INDEX IF NOT EXISTS idx_frames_lesson    ON frames(lesson_id, order_index);
CREATE INDEX IF NOT EXISTS idx_mquestions_module ON module_questions(module_id, order_index);
CREATE INDEX IF NOT EXISTS idx_progress_user    ON lesson_progress(user_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_user    ON expenses(user_id, spent_on);
CREATE INDEX IF NOT EXISTS idx_activity_user    ON activity_log(user_id, day);
CREATE INDEX IF NOT EXISTS idx_activity_kind    ON activity_log(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_botmsg_user      ON bot_messages(user_id, id);
`);

// --- tiny query helpers -------------------------------------------------
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const get = (sql, ...args) => db.prepare(sql).get(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);

/** Runs `fn` inside a transaction, rolling back if it throws. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

/**
 * Adds a column to an existing database. SQLite's ALTER TABLE ADD COLUMN is
 * cheap and non-destructive, so this is safe to run on every boot.
 */
function addColumn(table, column, definition) {
  const present = all(`PRAGMA table_info(${table})`).some((c) => c.name === column);
  if (!present) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Bỏ một cột đã ngừng dùng. Chỉ gọi cho cột không nằm trong index hay ràng buộc
 * nào, vì SQLite từ chối DROP COLUMN trong các trường hợp đó.
 */
function dropColumn(table, column) {
  const present = all(`PRAGMA table_info(${table})`).some((c) => c.name === column);
  if (present) db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
}

addColumn('levels', 'emoji', 'TEXT');
// Nhóm huy hiệu (learning | habit | expenses | budget | goals | explore | level),
// xem BADGE_GROUPS ở seed/catalogue.js.
addColumn('badges', 'group_code', 'TEXT');
addColumn('levels', 'perk', 'TEXT');
addColumn('modules', 'emoji', 'TEXT');
// text = trang chữ và hình · slides = bộ slide ảnh 1:1,371
addColumn('lessons', 'content_type', "TEXT NOT NULL DEFAULT 'text'");
// Kỳ tiết kiệm của mục tiêu (month | week) và mã mục tiêu gợi ý đã chọn.
addColumn('goals', 'period', "TEXT NOT NULL DEFAULT 'month'");
addColumn('goals', 'template', 'TEXT');
// Kết quả tư vấn lúc tạo mục tiêu (JSON: verdict, headline, points, tip, source,
// monthsNeeded, reachDate, at) — xem POST /api/goals/advice.
addColumn('goals', 'advice', 'TEXT');
// Tin nhắn đến từ đâu: chat = khung trò chuyện · quick = thanh ghi nhanh ở đáy.
addColumn('bot_messages', 'source', "TEXT NOT NULL DEFAULT 'chat'");
// Ngưỡng cảnh báo cho MỘT khoản chi trong nhóm. NULL = không cảnh báo theo ngưỡng
// (tiền nhà, học phí vốn đã lớn); chỉ đặt cho các nhóm chi thường ngày.
addColumn('categories', 'daily_limit', 'INTEGER');
addColumn('categories', 'group_code', 'TEXT');
addColumn('categories', 'group_label', 'TEXT');
addColumn('expenses', 'receipt_path', 'TEXT');
// Mã công ty ổn định từ SSO của app Ekko (claim employer_id). Có mã thì số liệu
// Admin nhóm theo mã; tên (users.employer) chỉ để hiển thị — xem companyScope.js.
addColumn('users', 'employer_id', 'TEXT');
// Token & chi phí của từng lượt gọi AI (services/aiUsage.js · trang Admin "Sử dụng AI").
addColumn('ai_calls', 'model', 'TEXT');
addColumn('ai_calls', 'input_tokens', 'INTEGER');
addColumn('ai_calls', 'output_tokens', 'INTEGER');
addColumn('ai_calls', 'cache_read_tokens', 'INTEGER');
addColumn('ai_calls', 'cache_write_tokens', 'INTEGER');
addColumn('ai_calls', 'cost_usd', 'REAL');
addColumn('expenses', 'recurring_id', 'INTEGER');
addColumn('news', 'body', 'TEXT');
addColumn('savings_sources', 'started_on', 'TEXT');
addColumn('savings_sources', 'ended_on', 'TEXT');
addColumn('savings_sources', 'direction', "TEXT NOT NULL DEFAULT 'in'");
// Lúc người dùng xem xong (hoặc đóng) 3 màn giới thiệu của concept Ekko Lover.
// NULL = chưa xem, nên lần đầu vào màn chủ sẽ hiện onboarding.
addColumn('user_state', 'lover_intro_at', 'TEXT');
// Thu nhập / số tiền để dành mỗi tháng người dùng TỰ ƯỚC TÍNH khi được tư vấn mục
// tiêu (services/goalAdvisor.js) — dùng khi chưa có dữ liệu ghi chép thật.
addColumn('user_state', 'est_monthly_income', 'INTEGER');
addColumn('user_state', 'est_monthly_saving', 'INTEGER');
// Heo Dream Team (services/teams.js): mã ID riêng để bạn bè mời nhau vào đội,
// và ngày gần nhất người dùng mở app (để biết hôm nay "đã vào app" chưa).
addColumn('users', 'friend_code', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_friend_code ON users(friend_code)');
addColumn('user_state', 'last_open_day', 'TEXT');
// XP nhận từ bạn cùng đội (services/teams.js · shareXpWithTeam): tổng từ trước tới
// nay, và phần nằm trong cấp hiện tại (để thanh tiến độ tô màu riêng).
addColumn('user_state', 'team_xp_total', 'INTEGER NOT NULL DEFAULT 0');
addColumn('user_state', 'team_xp_level', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
-- user_id là khoá chính: mỗi người chỉ ở trong đúng một đội.
CREATE TABLE IF NOT EXISTS team_members (
  user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_id   INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS team_members_team ON team_members(team_id);
CREATE TABLE IF NOT EXISTS team_invites (
  id           INTEGER PRIMARY KEY,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at   TEXT NOT NULL,
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS team_invites_to ON team_invites(to_user_id, status);
CREATE INDEX IF NOT EXISTS team_invites_from ON team_invites(from_user_id, status);
-- Tài khoản email + mật khẩu để thử nghiệm nội bộ (services/localAuth.js).
CREATE TABLE IF NOT EXISTS local_accounts (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
-- Lời nhắc giữ streak: mỗi người nhắc một bạn tối đa một lần mỗi ngày.
CREATE TABLE IF NOT EXISTS team_nudges (
  id           INTEGER PRIMARY KEY,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  seen_at      TEXT,
  UNIQUE (from_user_id, to_user_id, day)
);
`);
// Lúc người dùng bấm "Nhận thưởng" của một huy hiệu (Ekko Lover). NULL = XP của
// huy hiệu còn chờ nhận. Huy hiệu trao trước khi có cột này đã được cộng XP ngay
// lúc trao, nên đánh dấu là đã nhận.
if (!all('PRAGMA table_info(user_badges)').some((c) => c.name === 'claimed_at')) {
  addColumn('user_badges', 'claimed_at', 'TEXT');
  db.exec('UPDATE user_badges SET claimed_at = awarded_at');
}

// "Xu" đã bị bỏ khỏi sản phẩm: không có gì tiêu xu, nên nó chỉ là một con số
// tăng dần vô nghĩa. Bỏ luôn cột để không ai tưởng đây là dữ liệu còn dùng.
dropColumn('user_state', 'coins');
dropColumn('activity_log', 'coins');
dropColumn('lessons', 'coin_reward');
// XP cố định theo từng bài học và thưởng hoàn thành trọn mô đun đã bỏ: XP học tập
// giờ là hai mức chung (mỗi bài học, mỗi bài test mô đun) ở trang Chức năng —
// xem learningXp() trong services/progression.js.
dropColumn('lessons', 'xp_reward');
dropColumn('modules', 'xp_reward');

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    String(value),
  );
}
