/**
 * Catalogue seed: the ten levels, the badge set, the features, and the
 * expense categories. Everything here is editable afterwards in the Admin
 * portal - this file only supplies the starting state.
 */

/**
 * Mười cấp độ của chú heo. `perk` để trống có chủ đích: phúc lợi gắn với mỗi cấp
 * là quyết định của Ekko, quản trị viên tự điền trong Admin portal.
 *
 * Ngưỡng XP tính sao cho cấp 10 cần thời gian thật, dù XP không bị giới hạn
 * theo ngày: người cày tối đa (học hết khoá, đạt mọi huy hiệu làm được ngay, ngày
 * đầu khoảng 5.200 XP, sau đó khoảng 125 XP/ngày) mất khoảng 25 ngày; người chăm
 * (mỗi ngày 1 bài, 2 chức năng) khoảng 2,5 tháng. Học dồn cả khoá trong một ngày
 * (khoảng 2.560 XP kể cả huy hiệu học tập) là lên cấp 6.
 * Database cũ đổi một lần, chỉ ở cấp nào còn đúng ngưỡng của một bản thang
 * trước (xem `rebalanceXp` ở seed/index.js).
 *
 * Ảnh heo của Đi Học, Nhân Viên (sơ mi trắng, không áo khoác), Gia Đình, Phát
 * Triển và Tích Lũy là bộ vẽ mới chủ sản phẩm tải lên (`*-2.png`, `pig-saver.png`).
 */
export const LEVELS = [
  { order_index: 1,  name: 'Heo Mầm Non',     emoji: 'plant-02',       xp_required: 0,    pig: 'pig-1' },
  { order_index: 2,  name: 'Heo Đi Học',      emoji: 'backpack-01',    xp_required: 200,  pig: 'pig-study-2' },
  { order_index: 3,  name: 'Heo Học Việc',    emoji: 'mortarboard-01', xp_required: 500,  pig: 'pig-2' },
  { order_index: 4,  name: 'Heo Nhân Viên',   emoji: 'briefcase-01',   xp_required: 1000, pig: 'pig-office-2' },
  { order_index: 5,  name: 'Heo Gia Đình',    emoji: 'house-03',       xp_required: 1700, pig: 'pig-family-2' },
  { order_index: 6,  name: 'Heo Phát Triển',  emoji: 'sparkles',       xp_required: 2500, pig: 'pig-grow-2' },
  { order_index: 7,  name: 'Heo Tích Lũy',    emoji: 'piggy-bank',     xp_required: 3500, pig: 'pig-saver' },
  { order_index: 8,  name: 'Heo No Đủ',       emoji: 'money-bag-02',   xp_required: 4800, pig: 'pig-4' },
  { order_index: 9,  name: 'Heo Đầu Tư',      emoji: 'chart-increase', xp_required: 6500, pig: 'pig-5' },
  { order_index: 10, name: 'Heo Thịnh Vượng', emoji: 'crown',          xp_required: 8500, pig: 'pig-6' },
].map(({ pig, ...level }) => ({
  ...level,
  perk: '',
  character_image: `/assets/levels/${pig}.png`,
}));

/** Ngưỡng XP của các bản thang trước — chỉ cấp còn đúng một trong các số này mới được đổi. */
export const OLD_LEVEL_XP = [
  { 1: 0, 2: 15, 3: 30, 4: 45, 5: 60, 6: 70, 7: 80, 8: 160, 9: 260, 10: 350 },
  { 1: 0, 2: 60, 3: 150, 4: 300, 5: 500, 6: 800, 7: 1200, 8: 1800, 9: 2600, 10: 3600 },
  { 1: 0, 2: 120, 3: 300, 4: 600, 5: 1000, 6: 1600, 7: 2400, 8: 3600, 9: 5200, 10: 7200 },
];

/** Cấp cũ (sáu cấp) → vị trí trong mười cấp: dùng khi đổi dữ liệu đã có. */
export const OLD_LEVEL_TO_NEW = { 1: 1, 2: 3, 3: 7, 4: 8, 5: 9, 6: 10 };

/** Biểu tượng của từng mô đun, khớp thứ tự trong curriculum.js. */
export const MODULE_EMOJI = {
  1: 'flag-01',
  2: 'money-send-01',
  3: 'bank',
  4: 'umbrella',
  5: 'alert-02',
  6: 'briefcase-01',
  7: 'smart-phone-01',
  8: 'house-03',
};

/**
 * Sáu mô đun của bộ khoá học đầu tiên, đã bỏ hẳn (chủ sản phẩm quyết định,
 * 30/09/2026) — thay bằng tám mô đun dựng lại từ thiết kế Figma. Database nào
 * còn chúng sẽ được xoá một lần khi khởi động (xem seed/index.js).
 */
export const REMOVED_MODULE_SLUGS = [
  'bat-dau-voi-tien-cua-ban', 'lap-ngan-sach', 'quy-du-phong-va-muc-tieu',
  'no-va-ung-luong', 'bao-ve-va-dau-tu', 'lam-chu-tai-chinh-dai-han',
];

/**
 * Nhóm huy hiệu — tab lọc ở trang Huy hiệu (app) và Admin portal. Danh sách cố
 * định trong code như CATEGORY_GROUPS: thêm nhóm mới là một thay đổi sản phẩm,
 * không phải việc biên tập nội dung.
 */
export const BADGE_GROUPS = [
  { code: 'learning', name: 'Học tập' },
  { code: 'habit', name: 'Thói quen' },
  { code: 'expenses', name: 'Ghi chép chi tiêu' },
  { code: 'budget', name: 'Ngân sách' },
  { code: 'goals', name: 'Mục tiêu & Tiết kiệm' },
  { code: 'explore', name: 'Khám phá' },
  { code: 'level', name: 'Cấp độ' },
];

/**
 * Huy hiệu xếp theo nhóm, mỗi nhóm gồm vài **chuỗi** Đồng → Bạc → Vàng: cùng
 * một loại điều kiện, ngưỡng tăng dần. Một chuỗi không cần cột riêng — app gom
 * các huy hiệu cùng nhóm + cùng điều kiện + cùng phạm vi thành một chuỗi.
 *
 * Mười hai mã đầu tiên là bộ cũ, giữ nguyên mã vì `user_badges` của người học
 * đang trỏ vào. XP thưởng tính theo thang cấp độ mới (1 bài học ≈ 30 XP).
 */
export const BADGES = [
  // Học tập
  { code: 'first_lesson', group_code: 'learning', name: 'Bài học đầu tiên', description: 'Hoàn thành bài học đầu tiên của bạn.', icon: '📖', rule_type: 'lessons_completed', rule_value: 1, xp_reward: 20 },
  { code: 'lessons_10', group_code: 'learning', name: 'Chăm học', description: 'Hoàn thành 10 bài học.', icon: '📗', rule_type: 'lessons_completed', rule_value: 10, xp_reward: 80 },
  { code: 'lessons_all', group_code: 'learning', name: 'Học hết khoá', description: 'Hoàn thành cả 34 bài học của khoá.', icon: '📚', rule_type: 'lessons_completed', rule_value: 34, xp_reward: 200 },
  { code: 'first_module', group_code: 'learning', name: 'Mô đun đầu tiên', description: 'Hoàn thành trọn vẹn một mô đun học tập.', icon: '🎓', rule_type: 'modules_completed', rule_value: 1, xp_reward: 50 },
  { code: 'modules_4', group_code: 'learning', name: 'Nửa chặng đường', description: 'Hoàn thành 4 mô đun học tập.', icon: '🧭', rule_type: 'modules_completed', rule_value: 4, xp_reward: 100 },
  { code: 'modules_8', group_code: 'learning', name: 'Tốt nghiệp', description: 'Hoàn thành cả 8 mô đun học tập.', icon: '🏅', rule_type: 'modules_completed', rule_value: 8, xp_reward: 250 },
  { code: 'quiz_perfect_1', group_code: 'learning', name: 'Điểm tuyệt đối', description: 'Trả lời đúng hết một bài trắc nghiệm mô đun.', icon: '💯', rule_type: 'quiz_perfect', rule_value: 1, xp_reward: 40 },
  { code: 'quiz_perfect_3', group_code: 'learning', name: 'Thủ khoa', description: 'Đúng hết 3 bài trắc nghiệm mô đun.', icon: '🥇', rule_type: 'quiz_perfect', rule_value: 3, xp_reward: 80 },
  { code: 'quiz_perfect_8', group_code: 'learning', name: 'Bậc thầy trắc nghiệm', description: 'Đúng hết cả 8 bài trắc nghiệm mô đun.', icon: '🧠', rule_type: 'quiz_perfect', rule_value: 8, xp_reward: 200 },
  { code: 'module_scam', group_code: 'learning', name: 'Khiên chống lừa đảo', description: 'Học xong mô đun Phòng chống lừa đảo tài chính.', icon: '🛡️', rule_type: 'modules_completed', rule_value: 1, rule_target: 'phong-chong-lua-dao', xp_reward: 60 },
  { code: 'module_labor', group_code: 'learning', name: 'Hiểu quyền lợi', description: 'Học xong mô đun Hiểu và bảo vệ quyền lợi lao động.', icon: '⚖️', rule_type: 'modules_completed', rule_value: 1, rule_target: 'quyen-loi-lao-dong', xp_reward: 60 },

  // Thói quen
  { code: 'streak_3', group_code: 'habit', name: 'Khởi động', description: 'Giữ chuỗi 3 ngày liên tiếp.', icon: '✨', rule_type: 'streak_days', rule_value: 3, xp_reward: 15 },
  { code: 'streak_7', group_code: 'habit', name: 'Streak 7 ngày', description: 'Học hoặc dùng một chức năng 7 ngày liên tiếp.', icon: '🔥', rule_type: 'streak_days', rule_value: 7, xp_reward: 70 },
  { code: 'streak_20', group_code: 'habit', name: 'Streak 20 ngày', description: 'Giữ chuỗi 20 ngày liên tiếp.', icon: '🚀', rule_type: 'streak_days', rule_value: 20, xp_reward: 150 },
  { code: 'streak_30', group_code: 'habit', name: 'Streak 30 ngày', description: 'Giữ chuỗi 30 ngày liên tiếp. Rất ít người làm được.', icon: '⚡', rule_type: 'streak_days', rule_value: 30, xp_reward: 300 },
  { code: 'streak_80', group_code: 'habit', name: 'Không thể cản', description: 'Giữ chuỗi 80 ngày liên tiếp.', icon: '🌋', rule_type: 'streak_days', rule_value: 80, xp_reward: 500 },
  { code: 'streak_recovered', group_code: 'habit', name: 'Hồi sinh', description: 'Quay lại kịp lúc để cứu chuỗi đang bị đóng băng.', icon: '❄️', rule_type: 'streak_recovered', rule_value: 1, xp_reward: 30 },

  // Ghi chép chi tiêu
  { code: 'first_expense', group_code: 'expenses', name: 'Khoản chi đầu tiên', description: 'Ghi khoản chi tiêu đầu tiên.', icon: '🪙', rule_type: 'expenses_logged', rule_value: 1, xp_reward: 10 },
  { code: 'expense_10', group_code: 'expenses', name: 'Người ghi chép', description: 'Ghi 10 khoản chi tiêu.', icon: '✏️', rule_type: 'expenses_logged', rule_value: 10, xp_reward: 50 },
  { code: 'expense_50', group_code: 'expenses', name: 'Sổ tay dày dặn', description: 'Ghi 50 khoản chi tiêu.', icon: '📒', rule_type: 'expenses_logged', rule_value: 50, xp_reward: 150 },
  { code: 'expense_200', group_code: 'expenses', name: 'Kế toán trưởng', description: 'Ghi 200 khoản chi tiêu.', icon: '🗂️', rule_type: 'expenses_logged', rule_value: 200, xp_reward: 300 },
  { code: 'expense_days_7', group_code: 'expenses', name: 'Đều tay', description: 'Ngày nào cũng ghi chi tiêu, 7 ngày liền.', icon: '📅', rule_type: 'expense_days_streak', rule_value: 7, xp_reward: 60 },
  { code: 'expense_days_30', group_code: 'expenses', name: 'Thói quen vàng', description: 'Ngày nào cũng ghi chi tiêu, 30 ngày liền.', icon: '🏆', rule_type: 'expense_days_streak', rule_value: 30, xp_reward: 200 },
  { code: 'quick_log_10', group_code: 'expenses', name: 'Ghi nhanh như gió', description: 'Ghi 10 khoản bằng thanh ghi nhanh, Ekko bot hoặc ảnh hoá đơn.', icon: '💨', rule_type: 'quick_logs', rule_value: 10, xp_reward: 40 },

  // Ngân sách
  { code: 'first_budget', group_code: 'budget', name: 'Ngân sách đầu tiên', description: 'Lập ngân sách tháng đầu tiên của bạn.', icon: '🧾', rule_type: 'budgets_created', rule_value: 1, xp_reward: 40 },
  { code: 'budget_3', group_code: 'budget', name: 'Nhà hoạch định', description: 'Lập ngân sách cho 3 tháng.', icon: '📐', rule_type: 'budgets_created', rule_value: 3, xp_reward: 80 },
  { code: 'budget_6', group_code: 'budget', name: 'Nửa năm kỷ luật', description: 'Lập ngân sách cho 6 tháng.', icon: '🗓️', rule_type: 'budgets_created', rule_value: 6, xp_reward: 150 },
  { code: 'budget_kept_1', group_code: 'budget', name: 'Giữ kỷ luật', description: 'Hết một tháng mà tổng chi không vượt ngân sách.', icon: '🎯', rule_type: 'budget_months_kept', rule_value: 1, xp_reward: 80 },
  { code: 'budget_kept_3', group_code: 'budget', name: 'Chi tiêu có kế hoạch', description: 'Ba tháng không vượt ngân sách.', icon: '💎', rule_type: 'budget_months_kept', rule_value: 3, xp_reward: 200 },

  // Mục tiêu & Tiết kiệm
  { code: 'first_goal', group_code: 'goals', name: 'Mục tiêu đầu tiên', description: 'Đặt mục tiêu tiết kiệm đầu tiên.', icon: '🎯', rule_type: 'goals_created', rule_value: 1, xp_reward: 40 },
  { code: 'goals_3', group_code: 'goals', name: 'Nhiều ước mơ', description: 'Đặt 3 mục tiêu tiết kiệm.', icon: '🌈', rule_type: 'goals_created', rule_value: 3, xp_reward: 60 },
  { code: 'goal_done', group_code: 'goals', name: 'Cán đích', description: 'Hoàn thành một mục tiêu tiết kiệm.', icon: '🏆', rule_type: 'goals_completed', rule_value: 1, xp_reward: 120 },
  { code: 'goal_done_3', group_code: 'goals', name: 'Về đích ba lần', description: 'Hoàn thành 3 mục tiêu tiết kiệm.', icon: '👑', rule_type: 'goals_completed', rule_value: 3, xp_reward: 250 },
  { code: 'deposit_5', group_code: 'goals', name: 'Nạp đều tay', description: 'Nạp tiền vào mục tiêu 5 lần.', icon: '🐷', rule_type: 'goal_deposits', rule_value: 5, xp_reward: 40 },
  { code: 'deposit_20', group_code: 'goals', name: 'Heo đất đầy bụng', description: 'Nạp tiền vào mục tiêu 20 lần.', icon: '💰', rule_type: 'goal_deposits', rule_value: 20, xp_reward: 120 },
  { code: 'savings_first', group_code: 'goals', name: 'Săn lãi suất', description: 'Dùng chức năng Tiết kiệm lần đầu.', icon: '🏦', rule_type: 'feature_used', rule_value: 1, rule_target: 'savings', xp_reward: 20 },

  // Khám phá
  { code: 'bot_friend', group_code: 'explore', name: 'Bạn của Ekko bot', description: 'Trò chuyện với Ekko bot 5 lần.', icon: '🤖', rule_type: 'bot_chats', rule_value: 5, xp_reward: 30 },
  { code: 'bot_30', group_code: 'explore', name: 'Tri kỷ của Ekko bot', description: 'Trò chuyện với Ekko bot 30 lần.', icon: '💬', rule_type: 'bot_chats', rule_value: 30, xp_reward: 100 },
  { code: 'explorer', group_code: 'explore', name: 'Nhà thám hiểm', description: 'Dùng đủ 5 chức năng, mỗi chức năng ít nhất một lần.', icon: '🗺️', rule_type: 'features_distinct', rule_value: 5, xp_reward: 60 },
  { code: 'news_10', group_code: 'explore', name: 'Mọt tin', description: 'Đọc 10 tin tức tài chính.', icon: '📰', rule_type: 'news_read', rule_value: 10, xp_reward: 40 },

  // Cấp độ
  { code: 'level_3', group_code: 'level', name: 'Nhà Kế Hoạch', description: 'Đạt cấp độ 7.', icon: '🗺️', rule_type: 'level_reached', rule_value: 7, xp_reward: 60 },
  { code: 'level_6', group_code: 'level', name: 'Bậc thầy bầu trời', description: 'Đạt cấp độ 10, cấp cao nhất.', icon: '👑', rule_type: 'level_reached', rule_value: 10, xp_reward: 500 },
].map((badge, i) => ({ rule_target: null, ...badge, order_index: i + 1 }));

/**
 * Thử thách — việc nhỏ, tự làm mới (khác huy hiệu: đạt một lần là xong). Gọi
 * là "thử thách" vì chữ "Nhiệm vụ" đã là tên chức năng `plans`.
 *
 * - `once`: chặng khởi đầu cho người mới, hiện tới khi nhận hết thưởng.
 * - `daily`: mỗi ngày app chọn 3 thử thách trong bộ này (cố định trong ngày).
 * - `weekly`: mọi thử thách tuần đều hiện, tuần tính từ thứ Hai.
 *
 * Điều kiện đếm trong đúng kỳ đó — xem CHALLENGE_RULES ở services/challenges.js.
 */
export const CHALLENGES = [
  { code: 'start_goal', period: 'once', name: 'Đặt mục tiêu đầu tiên', description: 'Bạn muốn để dành cho điều gì? Đặt một mục tiêu nhé.', icon: '🎯', rule_type: 'goals_created', rule_value: 1, xp_reward: 15 },
  { code: 'start_budget', period: 'once', name: 'Lập ngân sách tháng này', description: 'Đặt hạn mức chi cho ít nhất một nhóm chi tiêu.', icon: '🧾', rule_type: 'budgets_created', rule_value: 1, xp_reward: 15 },
  { code: 'start_expense', period: 'once', name: 'Ghi khoản chi đầu tiên', description: 'Ghi một khoản bạn vừa chi, dù nhỏ thôi.', icon: '✏️', rule_type: 'expenses_logged', rule_value: 1, xp_reward: 15 },
  { code: 'start_lesson', period: 'once', name: 'Học bài đầu tiên', description: 'Hoàn thành một bài học bất kỳ.', icon: '📖', rule_type: 'lessons_completed', rule_value: 1, xp_reward: 15 },

  { code: 'daily_lesson', period: 'daily', name: 'Học 1 bài', description: 'Hoàn thành một bài học hôm nay.', icon: '📖', rule_type: 'lessons_completed', rule_value: 1, xp_reward: 15 },
  { code: 'daily_expense', period: 'daily', name: 'Ghi chi tiêu hôm nay', description: 'Ghi ít nhất một khoản chi trong ngày.', icon: '✏️', rule_type: 'expenses_logged', rule_value: 1, xp_reward: 10 },
  { code: 'daily_bot', period: 'daily', name: 'Hỏi Ekko bot', description: 'Hỏi Ekko bot một câu về tiền bạc.', icon: '🤖', rule_type: 'bot_chats', rule_value: 1, xp_reward: 10 },
  { code: 'daily_deposit', period: 'daily', name: 'Nạp vào mục tiêu', description: 'Nạp một khoản, dù nhỏ, vào mục tiêu của bạn.', icon: '🐷', rule_type: 'goal_deposits', rule_value: 1, xp_reward: 10 },
  { code: 'daily_news', period: 'daily', name: 'Đọc 1 tin', description: 'Đọc một tin tức tài chính.', icon: '📰', rule_type: 'news_read', rule_value: 1, xp_reward: 10 },

  { code: 'weekly_lessons', period: 'weekly', name: 'Học 3 bài trong tuần', description: 'Hoàn thành 3 bài học từ thứ Hai tới Chủ nhật.', icon: '📚', rule_type: 'lessons_completed', rule_value: 3, xp_reward: 40 },
  { code: 'weekly_expense_days', period: 'weekly', name: 'Ghi chép 5 ngày', description: 'Có ghi chi tiêu ở 5 ngày khác nhau trong tuần.', icon: '📅', rule_type: 'expense_days', rule_value: 5, xp_reward: 50 },
  { code: 'weekly_quiz', period: 'weekly', name: 'Làm 1 bài trắc nghiệm', description: 'Hoàn thành một bài trắc nghiệm mô đun.', icon: '💯', rule_type: 'quizzes_taken', rule_value: 1, xp_reward: 30 },
  { code: 'weekly_limits', period: 'weekly', name: 'Chi trong hạn mức', description: '5 ngày có ghi chi mà không nhóm nào vượt hạn mức chi trong ngày.', icon: '🛡️', rule_type: 'days_within_limits', rule_value: 5, xp_reward: 60 },
].map((challenge, i) => ({ rule_target: null, ...challenge, order_index: i + 1 }));

export const FEATURES = [
  {
    code: 'explore',
    name: 'Khám phá',
    description: 'Các bài học về tài chính cá nhân, mở khoá dần theo cấp độ.',
    route: '/app/#/explore',
    order_index: 1,
    xp_per_day: 0,
  },
  {
    code: 'budget',
    name: 'Lập ngân sách',
    description: 'Lập và theo dõi ngân sách hằng tháng.',
    route: '/app/#/budget',
    order_index: 2,
    xp_per_day: 15,
  },
  {
    code: 'goals',
    name: 'Mục tiêu tài chính',
    description: 'Đặt và theo dõi mục tiêu tiết kiệm.',
    route: '/app/#/goals',
    order_index: 3,
    xp_per_day: 15,
  },
  {
    code: 'expenses',
    name: 'Ghi chép chi tiêu',
    description: 'Ghi nhanh chi tiêu với hỗ trợ AI.',
    route: '/app/#/expenses',
    order_index: 4,
    xp_per_day: 15,
  },
  {
    code: 'plans',
    name: 'Nhiệm vụ',
    description: 'Đặt nhiệm vụ và theo dõi từng việc cần làm cho tới khi xong.',
    route: '/app/#/plans',
    order_index: 5,
    xp_per_day: 15,
  },
  {
    code: 'savings',
    name: 'Tiết kiệm',
    description: 'Theo dõi các nguồn tiết kiệm và gửi tiết kiệm cùng Ekko.',
    route: '/app/#/savings',
    order_index: 6,
    xp_per_day: 15,
  },
];

/**
 * Đối tác "Tiết kiệm cùng Ekko" — dữ liệu mẫu để minh hoạ, không kết nối ngân
 * hàng thật. `rates`: kỳ hạn (tháng) -> lãi suất %/năm. Admin portal sửa được
 * trong trang "Tiết kiệm" (bảng `savings_channels`, cột `rates` là JSON).
 */
export const SAVINGS_CHANNELS = [
  {
    name: 'MBV Bank',
    logo: '/assets/banks/mbv-bank.svg',
    order_index: 1,
    rates: { 3: 5.8, 5: 7.5, 6: 8, 9: 8.3, 12: 8.6 },
  },
  {
    name: 'Bản Việt Bank',
    logo: '/assets/banks/bvbank.png',
    order_index: 2,
    rates: { 3: 4.8, 5: 6, 6: 6.5, 9: 6.8, 12: 7 },
  },
  {
    name: 'MB Bank',
    logo: '/assets/banks/mb-bank.png',
    order_index: 3,
    rates: { 3: 4, 5: 5.2, 6: 5.7, 9: 5.9, 12: 6.1 },
  },
];

/**
 * Lãi suất tiết kiệm THAM KHẢO của các ngân hàng thật (không phải dữ liệu
 * sống — không có API công khai miễn phí cho lãi suất ngân hàng VN). Số liệu
 * lấy từ báo chí tổng hợp niêm yết gửi online giữa tháng 9/2026, làm điểm
 * khởi đầu — Admin portal cập nhật lại định kỳ ở trang "Lãi suất ngân hàng".
 */
export const BANK_INTEREST_RATES = [
  { name: 'Agribank', group: 'state', logo: '/assets/banks/agribank.png', order_index: 1, rates: { 3: 4.75, 6: 6.6, 12: 6.8 } },
  { name: 'Vietcombank', group: 'state', logo: '/assets/banks/vietcombank.webp', order_index: 2, rates: { 3: 4.75, 6: 6.6, 12: 6.8 } },
  { name: 'BIDV', group: 'state', logo: '/assets/banks/bidv.png', order_index: 3, rates: { 3: 4.75, 6: 6.6, 12: 6.8 } },
  { name: 'VietinBank', group: 'state', logo: '/assets/banks/vietinbank.svg', order_index: 4, rates: { 3: 4.75, 6: 6.6, 12: 6.8 } },
  { name: 'ACB', group: 'joint_stock', logo: '/assets/banks/acb.svg', order_index: 5, rates: { 3: 4.75, 6: 6.8, 12: 7.8 } },
  { name: 'Sacombank', group: 'joint_stock', logo: '/assets/banks/sacombank.png', order_index: 6, rates: { 3: 4.75, 6: 6.7, 12: 7.5 } },
  { name: 'VPBank', group: 'joint_stock', logo: '/assets/banks/vpbank.svg', order_index: 7, rates: { 3: 4.75, 6: 6.6, 12: 6.9 } },
  { name: 'Techcombank', group: 'joint_stock', logo: '/assets/banks/techcombank.png', order_index: 8, rates: { 3: 4.75, 6: 6.5, 12: 6.75 } },
  { name: 'MB Bank', group: 'joint_stock', logo: '/assets/banks/mb-bank.png', order_index: 9, rates: { 3: 4.75, 6: 6, 12: 6.35 } },
];

/**
 * Mẹo tài chính hiển thị ở carousel màn chủ (concept "Ekko Lover"). Dùng lại
 * artwork bài học có sẵn thay vì tự tạo ảnh mới. Chỉ là nội dung khởi đầu —
 * quản trị viên sửa/thêm/xoá tự do trong Admin portal.
 */
export const NEWS = [
  {
    title: 'Cách quản lý chi tiêu',
    summary: 'Mẹo quản lý tiền bạc hiệu quả mỗi ngày, bắt đầu từ việc ghi chép đều đặn.',
    category: 'Mẹo',
    image: '/assets/lessons/ghi-chep-3-phut.svg',
    read_minutes: 5,
    order_index: 1,
    body: `Bước đầu tiên luôn là nhìn thấy. Thử trả lời nhanh: tháng trước bạn tiêu bao nhiêu cho ăn uống? Gần như ai cũng ngập ngừng — không phải vì tiêu hoang, mà vì tiền rời khỏi ví theo hàng chục lần nhỏ lẻ mà não không ghi nhớ nổi.

**Ghi chép không cần phức tạp.** Chỉ cần 3 phút mỗi ngày: mở app, gõ một dòng như "cà phê 35k", xong. Không cần phân loại kỹ càng ngay từ đầu — cứ ghi trước, nhìn lại sau.

Sau một tuần, bạn sẽ thấy một bức tranh rõ ràng hơn: tiền thật sự chảy đi đâu, khoản nào lặp lại mỗi ngày, khoản nào chỉ là ngẫu hứng. Đó là lúc quyết định cắt giảm hay giữ nguyên trở nên dễ dàng — vì nó dựa trên số liệu, không phải cảm giác.

- Ghi ngay lúc chi, đừng để dồn cuối ngày
- Không cần chính xác tuyệt đối, ước lượng cũng tốt hơn không ghi gì
- Xem lại vào cuối tuần, không phải mỗi ngày — tránh áp lực

Thói quen nhỏ này, giữ đều trong một tháng, thường thay đổi cách một người nhìn về tiền bạc nhiều hơn bất kỳ mẹo tiết kiệm nào.`,
  },
  {
    title: 'Quy tắc 50/30/20 là gì?',
    summary: 'Một cách chia thu nhập đơn giản: 50% nhu cầu thiết yếu, 30% mong muốn, 20% tiết kiệm.',
    category: 'Mẹo',
    image: '/assets/lessons/quy-tac-50-30-20.svg',
    read_minutes: 4,
    order_index: 2,
    body: `Không phải ai cũng có thời gian lập một bảng ngân sách chi tiết từng dòng. Quy tắc 50/30/20 sinh ra cho đúng nhóm người đó: đơn giản, dễ nhớ, và đủ tốt để bắt đầu.

Chia thu nhập sau thuế thành ba phần:

- **50% cho nhu cầu thiết yếu** — tiền nhà, ăn uống, đi lại, hoá đơn điện nước
- **30% cho mong muốn** — giải trí, mua sắm, những thứ làm cuộc sống dễ chịu hơn
- **20% cho tương lai** — tiết kiệm, trả nợ, hoặc đầu tư

Con số 50-30-20 không phải luật bất biến. Người mới đi làm ở thành phố lớn có thể phải chi 65% cho nhu cầu thiết yếu vì tiền nhà đắt đỏ — không sao cả. Điều quan trọng là có một tỷ lệ tham chiếu để nhận ra khi nào một nhóm đang phình to bất thường.

> Ngân sách tốt không phải là ngân sách khắt khe nhất, mà là ngân sách bạn thực sự theo được trong nhiều tháng liền.

Bắt đầu bằng cách áp dụng thử một tháng, rồi điều chỉnh tỷ lệ cho khớp với hoàn cảnh thật của mình.`,
  },
  {
    title: 'Vì sao cần quỹ khẩn cấp?',
    summary: 'Một khoản đệm 3-6 tháng chi phí giúp bạn không vay nợ khi có việc bất ngờ.',
    category: 'Kiến thức',
    image: '/assets/lessons/quy-khan-cap.svg',
    read_minutes: 6,
    order_index: 3,
    body: `Xe hỏng đột ngột. Mất việc không báo trước. Một đợt ốm phải nằm viện. Không ai lên kế hoạch cho những việc này — nhưng chúng vẫn xảy ra, và thường đúng lúc túi tiền đang eo hẹp nhất.

Quỹ khẩn cấp là khoản tiền để riêng, chỉ dùng khi có việc thật sự bất ngờ — không phải để mua thứ đang giảm giá hay đi du lịch. Mục tiêu phổ biến là **3 đến 6 tháng chi phí sinh hoạt thiết yếu**, gửi ở nơi rút ra được ngay khi cần, không phải đầu tư dài hạn.

Vì sao con số này quan trọng? Vì không có nó, một sự cố nhỏ dễ biến thành một khoản nợ lớn. Vay nóng để sửa xe, rồi trả lãi trong nhiều tháng sau đó — đó là cái giá của việc không có tấm đệm.

Bắt đầu từ đâu nếu chưa có gì? Không cần đủ 6 tháng ngay lập tức.

- Đặt mục tiêu nhỏ trước: 1 tháng chi phí thiết yếu
- Để dành tự động mỗi khi nhận lương, dù chỉ một khoản nhỏ
- Giữ quỹ này tách biệt khỏi tài khoản chi tiêu hàng ngày, để đỡ tiện tay dùng vào việc khác

Đạt mốc đầu tiên rồi mới nâng dần lên — quỹ khẩn cấp không phải một cuộc đua, mà là một tấm lưới an toàn xây dần theo thời gian.`,
  },
  {
    title: 'Phân biệt nợ tốt và nợ xấu',
    summary: 'Không phải khoản vay nào cũng xấu — điều quan trọng là nó sinh ra giá trị gì.',
    category: 'Kiến thức',
    image: '/assets/lessons/no-tot-no-xau.svg',
    read_minutes: 5,
    order_index: 4,
    body: `Nợ thường bị coi là điều nên tránh bằng mọi giá. Nhưng thực tế, không phải khoản vay nào cũng như nhau — điều quyết định là nó có giúp bạn tạo ra giá trị hay không.

**Nợ tốt** là khoản vay dùng để tạo ra thu nhập hoặc giá trị lớn hơn trong tương lai: vay học tập để nâng cao thu nhập, vay mua nhà (tài sản thường tăng giá theo thời gian), vay để mở rộng một việc kinh doanh đang hiệu quả.

**Nợ xấu** là khoản vay cho những thứ mất giá trị ngay khi mua, hoặc không tạo ra lợi ích gì thêm: vay tiêu dùng lãi suất cao để mua sắm, dùng thẻ tín dụng cho những khoản không thực sự cần và không trả hết trong tháng.

Ranh giới đôi khi không tuyệt đối — một chiếc xe máy vay mua có thể là nợ tốt nếu nó giúp bạn đi làm, kiếm thêm thu nhập; nhưng cũng có thể là nợ xấu nếu chỉ để theo kịp bạn bè.

Câu hỏi đáng hỏi trước khi vay: khoản này có giúp tôi kiếm nhiều hơn, hoặc giữ giá trị theo thời gian không? Nếu câu trả lời là không, có lẽ nên để dành trước rồi mua sau.`,
  },
];

/** `keywords` powers Ekko bot's quick-expense parser. */
/**
 * `daily_limit` = ngưỡng cảnh báo cho MỘT khoản chi trong nhóm.
 *
 * Chỉ đặt cho các nhóm chi **thường ngày**, nơi một con số lớn gần như luôn là
 * gõ nhầm (thêm một số 0) chứ không phải chi thật. Các nhóm vốn đã lớn theo bản
 * chất — tiền nhà, học phí, gia đình, tiết kiệm — để `null`, cảnh báo ở đó chỉ
 * là tiếng ồn. Mức lấy theo thu nhập phổ thông ở Việt Nam; Admin sửa được.
 */
/**
 * Ba nhóm level 1 cố định, không đổi theo thời gian như danh sách nhóm chi
 * tiêu bên dưới — mỗi nhóm chi tiêu (`CATEGORIES`) luôn thuộc đúng một nhóm
 * này. "Sự cố" cố tình chỉ có một nhóm chi tiêu duy nhất trùng tên nó: chọn
 * nhóm level 1 này là xong luôn, không cần chọn thêm nhóm con nào nữa.
 */
export const CATEGORY_GROUPS = {
  needs: 'Nhu cầu',
  wants: 'Mong muốn',
  incident: 'Sự cố',
};

export const CATEGORIES = [
  // ---------- Nhu cầu ----------
  { code: 'needs_food', name: 'Thực phẩm', icon: 'vegetarian-food', color: '#EC5962', group_code: 'needs', order_index: 1, daily_limit: 500000, keywords: 'ăn sáng,ăn trưa,ăn tối,cơm,phở,bún,đi chợ,siêu thị,winmart,bách hoá xanh,co.opmart,thực phẩm,đồ ăn,rau,thịt,cá,trứng,gạo' },
  { code: 'needs_housing', name: 'Nhà ở', icon: 'home-01', color: '#4A8D8B', group_code: 'needs', order_index: 2, daily_limit: null, keywords: 'thuê nhà,tiền nhà,tiền trọ,thuê trọ,sửa nhà' },
  { code: 'needs_bills', name: 'Hoá đơn tháng', icon: 'invoice-01', color: '#3E58F1', group_code: 'needs', order_index: 3, daily_limit: null, keywords: 'điện,nước,internet,wifi,rác,quản lý,gas,hoá đơn,cước' },
  { code: 'needs_transport', name: 'Di chuyển', icon: 'car-01', color: '#F97316', group_code: 'needs', order_index: 4, daily_limit: 500000, keywords: 'xăng,grab,xe ôm,taxi,gửi xe,vé xe,xe buýt,bus,tàu,vé máy bay,sửa xe,rửa xe,be,gojek' },
  { code: 'needs_health', name: 'Y tế', icon: 'hospital-01', color: '#7CC731', group_code: 'needs', order_index: 5, daily_limit: null, keywords: 'thuốc,khám bệnh,bệnh viện,nha khoa,phòng khám,y tế' },
  { code: 'needs_education', name: 'Giáo dục', icon: 'mortarboard-02', color: '#1283EB', group_code: 'needs', order_index: 6, daily_limit: null, keywords: 'sách,khoá học,học phí,tiền học,đóng học,học thêm,tiếng anh,lớp học,giáo dục' },
  { code: 'needs_insurance', name: 'Bảo hiểm (nhân thọ, xe, nhà)', icon: 'shield-01', color: '#6366F1', group_code: 'needs', order_index: 7, daily_limit: null, keywords: 'bảo hiểm,bảo hiểm nhân thọ,bảo hiểm xe,bảo hiểm nhà,bảo hiểm y tế' },
  { code: 'needs_debt', name: 'Trả nợ/lãi vay', icon: 'credit-card', color: '#B91C1C', group_code: 'needs', order_index: 8, daily_limit: null, keywords: 'trả nợ,lãi vay,vay,trả góp,thẻ tín dụng' },
  { code: 'needs_other', name: 'Khác', icon: 'package', color: '#7C7C7C', group_code: 'needs', order_index: 9, daily_limit: null, keywords: '' },

  // ---------- Mong muốn ----------
  { code: 'wants_dining', name: 'Nhà hàng', icon: 'restaurant-01', color: '#FB7185', group_code: 'wants', order_index: 10, daily_limit: 500000, keywords: 'nhà hàng,quán ăn,quán nhậu,ăn ngoài,ship đồ ăn,grabfood,shopeefood,cơm văn phòng,el gaucho,pizza 4p,pizza hut,domino,lotteria,kfc,mcdonald,jollibee,texas chicken,popeyes,gogi house,sumo bbq,manwah,kichi kichi,hutong,al fresco,baemin,buffet,lẩu,nướng,bbq,steak,sushi,food court,cơm tấm,bún đậu,hải sản' },
  { code: 'wants_home', name: 'Gia dụng', icon: 'sofa-01', color: '#A78BFA', group_code: 'wants', order_index: 11, daily_limit: 2000000, keywords: 'nội thất,đồ gia dụng,trang trí nhà,điện máy' },
  { code: 'wants_entertainment', name: 'Cà phê, giải trí', icon: 'coffee-01', color: '#7B61FF', group_code: 'wants', order_index: 12, daily_limit: 1000000, keywords: 'cà phê,cafe,trà sữa,phim,rạp,game,netflix,spotify,karaoke,nhậu,highlands,the coffee house,phúc long,starbucks,katinat,cộng cà phê,trung nguyên,gong cha,toco toco,ding tea,koi thé,cgv,lotte cinema,galaxy cinema,bhd,milano coffee' },
  { code: 'wants_shopping', name: 'Mua sắm', icon: 'shopping-bag-01', color: '#C000BD', group_code: 'wants', order_index: 13, daily_limit: 2000000, keywords: 'mua,quần áo,áo,quần,váy,đầm,áo khoác,áo phao,giày,dép,túi xách,mũ,nón,thời trang,mỹ phẩm,shopee,lazada,tiki,tạp hoá,đồ dùng,uniqlo,zara' },
  { code: 'wants_travel', name: 'Du lịch', icon: 'airplane-01', color: '#06B6D4', group_code: 'wants', order_index: 14, daily_limit: null, keywords: 'du lịch,vé máy bay,khách sạn,tour,resort' },
  { code: 'wants_hobby', name: 'Sở thích cá nhân', icon: 'paint-board', color: '#F59E0B', group_code: 'wants', order_index: 15, daily_limit: 1000000, keywords: 'sở thích,thể thao,gym,câu lạc bộ,nhạc cụ,sưu tầm' },
  { code: 'wants_gift', name: 'Quà tặng, hiếu hỉ', icon: 'gift', color: '#FCC902', group_code: 'wants', order_index: 16, daily_limit: null, keywords: 'quà,hiếu hỉ,đám cưới,giỗ,biếu,mừng' },
  { code: 'wants_beauty', name: 'Làm đẹp', icon: 'perfume', color: '#EC4899', group_code: 'wants', order_index: 17, daily_limit: 1000000, keywords: 'làm đẹp,mỹ phẩm,spa,tóc,nail,skincare' },
  { code: 'wants_other', name: 'Khác', icon: 'package', color: '#A5A5A5', group_code: 'wants', order_index: 18, daily_limit: null, keywords: '' },

  // ---------- Sự cố (không có nhóm con — chọn thẳng nhóm này) ----------
  { code: 'incident', name: 'Sự cố', icon: 'alert-02', color: '#D5394A', group_code: 'incident', order_index: 19, daily_limit: null, keywords: 'sự cố,khẩn cấp,tai nạn,mất,hỏng,sửa chữa khẩn cấp' },
];

/**
 * Từ khoá bổ sung cho nhóm chi tiêu đã có trên server — chỉ THÊM từ còn thiếu,
 * không xoá / đổi từ khoá Admin đã sửa (seed/index.js · addCategoryKeywords).
 * v2 (08/10/2026): đồ mặc (áo, quần, váy, giày…) vào Mua sắm — "Áo phao lông vũ
 * 415k" từng rơi vào "Khác" khi không có AI (BUG-007).
 */
export const ADDED_KEYWORDS_VERSION = '1';
export const CATEGORY_KEYWORD_ADDITIONS = {
  wants_shopping: ['áo', 'quần', 'váy', 'đầm', 'áo khoác', 'áo phao', 'dép', 'túi xách', 'mũ', 'nón', 'thời trang', 'uniqlo', 'zara'],
};

