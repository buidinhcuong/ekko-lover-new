/**
 * Idempotent seeding. Runs on every boot but only fills in what is missing, so
 * admin edits made in the portal are never overwritten.
 */
import { all, get, run, tx, getSetting, setSetting } from '../db.js';
import { nowIso } from '../lib/time.js';
import { BADGES, BANK_INTEREST_RATES, CATEGORIES, CATEGORY_GROUPS, ADDED_KEYWORDS_VERSION, CATEGORY_KEYWORD_ADDITIONS, CHALLENGES, FEATURES, LEVELS, MODULE_EMOJI, NEWS, OLD_LEVEL_TO_NEW, OLD_LEVEL_XP, REMOVED_MODULE_SLUGS, SAVINGS_CHANNELS } from './catalogue.js';
import { MORE_NEWS } from './news.js';
import { MODULES } from './curriculum.js';
import { EN } from '../i18n/en.js';
import { parseSaid } from './chatReplay.js';
import { migrateEmojiIcons, restoreBadgeEmoji } from './emojiIcons.js';

const CURRICULUM_VERSION = '1';
const GOALS_MODULE_VERSION = '1';
const SMART_MONEY_MODULE_VERSION = '1';
const FINANCE_MODULE_VERSION = '1';
const INSURANCE_MODULE_VERSION = '1';
const SCAM_MODULE_VERSION = '1';
const LABOR_MODULE_VERSION = '1';
const DIGITAL_FAMILY_MODULES_VERSION = '1';
const REMOVE_OLD_MODULES_VERSION = '1';
const REMOVE_ISLAND_CONCEPTS_VERSION = '1';
const GOALS_FEATURE_LESSON_VERSION = '1';
const BUDGET_FEATURE_LESSON_VERSION = '1';
const EXPENSE_FEATURE_LESSON_VERSION = '1';
const SAVINGS_FEATURE_LESSON_VERSION = '1';
const LEVELS_VERSION = '2';
const MODULE_QUIZ_VERSION = '1';
const CATEGORY_LIMITS_VERSION = '1';
const CHAT_LOGGED_VERSION = '3';
const NEWS_VERSION = '1';
const NEWS_BODY_VERSION = '1';
const MORE_NEWS_VERSION = '1';
const CATEGORY_GROUPS_VERSION = '1';
const CATEGORY_KEYWORDS_VERSION = '1';
const CATEGORY_KEYWORDS_VERSION_2 = '1';
const EMOJI_ICONS_VERSION = '3';
const PLANS_RENAME_VERSION = '1';
const TEN_LEVELS_VERSION = '1';
const OFFICE_PIG_VERSION = '1';
const NEW_PIGS_VERSION = '1';
const XP_BALANCE_VERSION = '3';
const CHALLENGES_VERSION = '1';
const GOAL_DEPOSITS_OFF_VERSION = '1';

export function seed() {
  tx(() => {
    // Phải chạy TRƯỚC seedLevels: dời sáu cấp cũ sang vị trí mới trước, để
    // seed (khớp theo order_index) không ghi tên cấp mới đè lên hàng cấp cũ.
    if (getSetting('ten_levels_version') !== TEN_LEVELS_VERSION) {
      expandToTenLevels();
      setSetting('ten_levels_version', TEN_LEVELS_VERSION);
    }
    // Heo Nhân Viên đổi sang ảnh nhân viên văn phòng (tên tệp mới để không dính
    // cache 7 ngày của ảnh cũ). Chỉ đổi khi admin chưa thay ảnh khác.
    if (getSetting('office_pig_version') !== OFFICE_PIG_VERSION) {
      run("UPDATE levels SET character_image = '/assets/levels/pig-office.png' WHERE character_image = '/assets/levels/pig-staff.png'");
      setSetting('office_pig_version', OFFICE_PIG_VERSION);
    }
    // Bộ ảnh heo mới cho năm cấp (Đi Học, Nhân Viên, Gia Đình, Phát Triển, Tích
    // Lũy). Tên tệp mới để không dính cache 7 ngày của ảnh cũ. Chỉ đổi hàng nào
    // còn đúng ảnh mặc định cũ — ảnh Admin đã tự thay thì giữ nguyên.
    if (getSetting('new_pigs_version') !== NEW_PIGS_VERSION) {
      const swaps = [
        [2, 'pig-study', 'pig-study-2'], [4, 'pig-office', 'pig-office-2'], [5, 'pig-family', 'pig-family-2'],
        [6, 'pig-grow', 'pig-grow-2'], [7, 'pig-3', 'pig-saver'],
      ];
      for (const [order, from, to] of swaps) {
        run('UPDATE levels SET character_image = ? WHERE order_index = ? AND character_image = ?',
          `/assets/levels/${to}.png`, order, `/assets/levels/${from}.png`);
      }
      setSetting('new_pigs_version', NEW_PIGS_VERSION);
    }
    if (getSetting('levels_version') !== LEVELS_VERSION) {
      seedLevels();
      setSetting('levels_version', LEVELS_VERSION);
    }
    seedBadges();
    // Bỏ 1 ngày là mất streak (không còn đóng băng): huy hiệu "Hồi sinh" — cứu
    // chuỗi đang đóng băng — không đạt được nữa, nên tắt một lần. Ai đã nhận
    // vẫn giữ trong lịch sử; Admin bật lại được nếu sau này có lại đóng băng.
    if (getSetting('streak_rules_version') !== STREAK_RULES_VERSION) {
      run("UPDATE badges SET is_active = 0 WHERE code = 'streak_recovered'");
      setSetting('streak_rules_version', STREAK_RULES_VERSION);
    }
    // Thang XP giãn ra và huy hiệu chia nhóm: chạy một lần, SAU seedLevels và
    // seedBadges để dữ liệu mới và cũ đều đã có mặt.
    if (getSetting('xp_balance_version') !== XP_BALANCE_VERSION) {
      rebalanceXp();
      setSetting('xp_balance_version', XP_BALANCE_VERSION);
    }
    // Thử thách: gieo một lần, rồi để Admin tự quản — xoá một thử thách thì nó
    // không mọc lại ở lần khởi động sau.
    if (getSetting('challenges_version') !== CHALLENGES_VERSION) {
      seedChallenges();
      setSetting('challenges_version', CHALLENGES_VERSION);
    }
    // Mục tiêu tài chính không còn nạp tiền (Ekko Lover): tắt một lần các huy hiệu
    // và thử thách chỉ đạt được bằng nạp tiền / hoàn thành mục tiêu. Admin bật lại được.
    if (getSetting('goal_deposits_off_version') !== GOAL_DEPOSITS_OFF_VERSION) {
      run("UPDATE badges SET is_active = 0 WHERE rule_type IN ('goal_deposits', 'goals_completed')");
      run("UPDATE challenges SET is_active = 0 WHERE rule_type = 'goal_deposits'");
      setSetting('goal_deposits_off_version', GOAL_DEPOSITS_OFF_VERSION);
    }
    seedFeatures();
    seedSavingsChannels();
    seedBankInterestRates();
    seedCategories();
    if (getSetting('category_groups_version') !== CATEGORY_GROUPS_VERSION) {
      migrateCategoryGroups();
      setSetting('category_groups_version', CATEGORY_GROUPS_VERSION);
    }
    if (getSetting('category_keywords_version') !== CATEGORY_KEYWORDS_VERSION) {
      backfillCategoryKeywords();
      setSetting('category_keywords_version', CATEGORY_KEYWORDS_VERSION);
    }
    if (getSetting('category_keywords_version_2') !== CATEGORY_KEYWORDS_VERSION_2) {
      backfillCategoryKeywordsV2();
      setSetting('category_keywords_version_2', CATEGORY_KEYWORDS_VERSION_2);
    }
    // Sau các bước đổi nhóm chi tiêu ở trên, để nhóm mới đã có mặt.
    if (getSetting('added_keywords_version') !== ADDED_KEYWORDS_VERSION) {
      addCategoryKeywords();
      setSetting('added_keywords_version', ADDED_KEYWORDS_VERSION);
    }
    if (getSetting('category_limits_version') !== CATEGORY_LIMITS_VERSION) {
      seedCategoryLimits();
      setSetting('category_limits_version', CATEGORY_LIMITS_VERSION);
    }
    if (getSetting('curriculum_version') !== CURRICULUM_VERSION) {
      seedCurriculum();
      setSetting('curriculum_version', CURRICULUM_VERSION);
    }
    if (getSetting('module_quiz_version') !== MODULE_QUIZ_VERSION) {
      liftQuizzesToModules();
      setSetting('module_quiz_version', MODULE_QUIZ_VERSION);
    }
    // Mô đun "Đặt mục tiêu tài chính" (thiết kế cũ trên Figma) thêm sau khi
    // database đã seed: chỉ gieo đúng mô đun này, để mô đun Admin đã xoá không
    // bị gieo lại.
    if (getSetting('goals_module_version') !== GOALS_MODULE_VERSION) {
      seedCurriculum(['dat-muc-tieu-tai-chinh']);
      setSetting('goals_module_version', GOALS_MODULE_VERSION);
    }
    if (getSetting('smart_money_module_version') !== SMART_MONEY_MODULE_VERSION) {
      seedCurriculum(['quan-ly-tien-bac-thong-minh']);
      setSetting('smart_money_module_version', SMART_MONEY_MODULE_VERSION);
    }
    if (getSetting('finance_module_version') !== FINANCE_MODULE_VERSION) {
      seedCurriculum(['to-chuc-tai-chinh']);
      setSetting('finance_module_version', FINANCE_MODULE_VERSION);
    }
    if (getSetting('insurance_module_version') !== INSURANCE_MODULE_VERSION) {
      seedCurriculum(['bao-hiem-quan-ly-rui-ro']);
      setSetting('insurance_module_version', INSURANCE_MODULE_VERSION);
    }
    // Bản gieo đầu của mô đun 10 lỡ đổi ngoặc kép thành ngoặc đơn ở một câu hỏi,
    // làm câu đó không khớp bản dịch. Sửa lại (chỉ khi Admin chưa sửa câu này).
    run("UPDATE module_questions SET question = ? WHERE question = ?",
      '"Loại trừ" trong hợp đồng bảo hiểm nghĩa là gì?', "'Loại trừ' trong hợp đồng bảo hiểm nghĩa là gì?");
    if (getSetting('scam_module_version') !== SCAM_MODULE_VERSION) {
      seedCurriculum(['phong-chong-lua-dao']);
      setSetting('scam_module_version', SCAM_MODULE_VERSION);
    }
    if (getSetting('labor_module_version') !== LABOR_MODULE_VERSION) {
      seedCurriculum(['quyen-loi-lao-dong']);
      setSetting('labor_module_version', LABOR_MODULE_VERSION);
    }
    if (getSetting('digital_family_modules_version') !== DIGITAL_FAMILY_MODULES_VERSION) {
      seedCurriculum(['tai-chinh-so-thong-minh', 'tuong-lai-gia-dinh']);
      setSetting('digital_family_modules_version', DIGITAL_FAMILY_MODULES_VERSION);
    }
    if (getSetting('remove_old_modules_version') !== REMOVE_OLD_MODULES_VERSION) {
      removeOldModules();
      setSetting('remove_old_modules_version', REMOVE_OLD_MODULES_VERSION);
    }
    // Ba concept có đảo / lối nút tròn đã bị xoá: bỏ ảnh đảo mặc định (tệp không
    // còn nữa) khỏi cấp độ và chức năng, và ai đang bật chúng thì sang Ekko Lover.
    // Ảnh Admin tự tải lên (không nằm trong /assets/islands/) giữ nguyên.
    if (getSetting('remove_island_concepts_version') !== REMOVE_ISLAND_CONCEPTS_VERSION) {
      run("UPDATE levels SET island_image = NULL WHERE island_image LIKE '/assets/islands/%'");
      run("UPDATE features SET island_image = NULL WHERE island_image LIKE '/assets/islands/%'");
      if (['sky', 'islands', 'path', 'hex'].includes(getSetting('explore_concept'))) setSetting('explore_concept', 'lover');
      setSetting('remove_island_concepts_version', REMOVE_ISLAND_CONCEPTS_VERSION);
    }
    // Bài "Dùng chức năng Mục tiêu" thêm vào mô đun Đặt mục tiêu tài chính đã có:
    // gieo lại mô đun đó chỉ điền bài còn thiếu, bài cũ giữ nguyên.
    if (getSetting('goals_feature_lesson_version') !== GOALS_FEATURE_LESSON_VERSION) {
      seedCurriculum(['dat-muc-tieu-tai-chinh']);
      setSetting('goals_feature_lesson_version', GOALS_FEATURE_LESSON_VERSION);
    }
    // Bài "Dùng chức năng Ngân sách" chen vào giữa mô đun Quản lý tiền bạc thông
    // minh (sau bài Tạo ngân sách), nên sau khi gieo phải đánh số lại các bài.
    if (getSetting('budget_feature_lesson_version') !== BUDGET_FEATURE_LESSON_VERSION) {
      seedCurriculum(['quan-ly-tien-bac-thong-minh']);
      renumberLessons('quan-ly-tien-bac-thong-minh');
      setSetting('budget_feature_lesson_version', BUDGET_FEATURE_LESSON_VERSION);
    }
    // Bài "Dùng chức năng Ghi chép" thêm vào cuối mô đun Quản lý tiền bạc thông minh.
    if (getSetting('expense_feature_lesson_version') !== EXPENSE_FEATURE_LESSON_VERSION) {
      seedCurriculum(['quan-ly-tien-bac-thong-minh']);
      renumberLessons('quan-ly-tien-bac-thong-minh');
      setSetting('expense_feature_lesson_version', EXPENSE_FEATURE_LESSON_VERSION);
    }
    // Bài "Dùng chức năng Tiết kiệm" chen vào sau bài Chọn sản phẩm tiết kiệm
    // của mô đun Tự tin sử dụng các sản phẩm và dịch vụ của các tổ chức tài chính.
    if (getSetting('savings_feature_lesson_version') !== SAVINGS_FEATURE_LESSON_VERSION) {
      seedCurriculum(['to-chuc-tai-chinh']);
      renumberLessons('to-chuc-tai-chinh');
      setSetting('savings_feature_lesson_version', SAVINGS_FEATURE_LESSON_VERSION);
    }
    if (getSetting('chat_logged_version') !== CHAT_LOGGED_VERSION) {
      backfillChatLogged();
      setSetting('chat_logged_version', CHAT_LOGGED_VERSION);
    }
    if (getSetting('news_version') !== NEWS_VERSION) {
      seedNews();
      setSetting('news_version', NEWS_VERSION);
    }
    if (getSetting('news_body_version') !== NEWS_BODY_VERSION) {
      backfillNewsBody();
      setSetting('news_body_version', NEWS_BODY_VERSION);
    }
    if (getSetting('more_news_version') !== MORE_NEWS_VERSION) {
      seedMoreNews();
      setSetting('more_news_version', MORE_NEWS_VERSION);
    }
    if (getSetting('plans_rename_version') !== PLANS_RENAME_VERSION) {
      renamePlansToMissions();
      setSetting('plans_rename_version', PLANS_RENAME_VERSION);
    }
    if (getSetting('emoji_icons_version') !== EMOJI_ICONS_VERSION) {
      migrateEmojiIcons();
      restoreBadgeEmoji();
      setSetting('emoji_icons_version', EMOJI_ICONS_VERSION);
    }
  });
}

/**
 * Upserts the six default ranks by `order_index`. Gated on LEVELS_VERSION, so a
 * change to the default ladder reaches existing databases exactly once. Extra
 * levels an admin added by hand are left alone.
 */
function seedLevels() {
  for (const l of LEVELS) {
    const existing = get('SELECT id FROM levels WHERE order_index = ?', l.order_index);
    if (existing) {
      run(
        `UPDATE levels
            SET name = ?, emoji = ?, perk = COALESCE(NULLIF(perk, ''), ?), xp_required = ?,
                character_image = ?
          WHERE id = ?`,
        l.name, l.emoji, l.perk, l.xp_required, l.character_image, existing.id,
      );
      continue;
    }
    run(
      `INSERT INTO levels (order_index, name, emoji, perk, xp_required, character_image, is_active)
       VALUES (?,?,?,?,?,?,1)`,
      l.order_index, l.name, l.emoji, l.perk, l.xp_required, l.character_image,
    );
  }
}

/**
 * Gieo huy hiệu của bộ khởi tạo. Mỗi mã chỉ gieo MỘT lần (danh sách mã đã gieo
 * lưu ở setting `seeded_badge_codes`): Admin xoá một huy hiệu thì nó không mọc lại
 * ở lần khởi động sau; huy hiệu mới thêm vào catalogue thì vẫn được gieo.
 */
const STREAK_RULES_VERSION = '2';   // 2: bỏ đóng băng streak (10/2026)

function seedBadges() {
  const seeded = new Set(JSON.parse(getSetting('seeded_badge_codes') || '[]'));
  for (const b of BADGES) {
    if (seeded.has(b.code)) continue;
    seeded.add(b.code);
    if (get('SELECT id FROM badges WHERE code = ?', b.code)) continue;
    // Huy hiệu mới chen vào giữa danh mục (vd Streak 20 ngày): đẩy các huy hiệu
    // đứng sau lùi một bậc để nó nằm đúng chỗ, không trùng thứ tự.
    run('UPDATE badges SET order_index = order_index + 1 WHERE order_index >= ?', b.order_index);
    run(
      `INSERT INTO badges (code, group_code, name, description, icon, rule_type, rule_value, rule_target, xp_reward, order_index, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
      b.code, b.group_code, b.name, b.description, b.icon, b.rule_type, b.rule_value, b.rule_target ?? null, b.xp_reward, b.order_index,
    );
  }
  setSetting('seeded_badge_codes', JSON.stringify([...seeded]));
}

function seedChallenges() {
  for (const c of CHALLENGES) {
    if (get('SELECT id FROM challenges WHERE code = ?', c.code)) continue;
    run(
      `INSERT INTO challenges (code, period, name, description, icon, rule_type, rule_value, rule_target, xp_reward, order_index, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
      c.code, c.period, c.name, c.description, c.icon, c.rule_type, c.rule_value, c.rule_target, c.xp_reward, c.order_index,
    );
  }
}

/**
 * Database có từ trước khi giãn thang XP:
 * - cấp nào còn đúng ngưỡng cũ thì đổi sang ngưỡng mới (Admin đã tự sửa thì giữ);
 * - huy hiệu của bộ khởi tạo nhận nhóm và thứ tự mới; huy hiệu Admin tự thêm
 *   chưa có nhóm thì xếp theo loại điều kiện;
 * - tính lại cấp của mọi người theo XP hiện có.
 */
function rebalanceXp() {
  for (const level of LEVELS) {
    for (const ladder of OLD_LEVEL_XP) {
      run('UPDATE levels SET xp_required = ? WHERE order_index = ? AND xp_required = ?',
        level.xp_required, level.order_index, ladder[level.order_index]);
    }
  }
  for (const b of BADGES) {
    run('UPDATE badges SET group_code = COALESCE(group_code, ?), order_index = ? WHERE code = ?', b.group_code, b.order_index, b.code);
  }
  const byRule = {
    lessons_completed: 'learning', modules_completed: 'learning', quiz_perfect: 'learning',
    streak_days: 'habit', streak_recovered: 'habit',
    expenses_logged: 'expenses', expense_days_streak: 'expenses', quick_logs: 'expenses',
    budgets_created: 'budget', budget_months_kept: 'budget',
    goals_created: 'goals', goals_completed: 'goals', goal_deposits: 'goals',
    level_reached: 'level', xp_total: 'level',
  };
  for (const badge of all('SELECT id, rule_type FROM badges WHERE group_code IS NULL')) {
    run('UPDATE badges SET group_code = ? WHERE id = ?', byRule[badge.rule_type] || 'explore', badge.id);
  }

  const levels = all('SELECT id, xp_required FROM levels WHERE is_active = 1 ORDER BY order_index');
  for (const state of all('SELECT user_id, xp FROM user_state')) {
    let current = levels[0];
    for (const level of levels) if (state.xp >= level.xp_required) current = level;
    if (current) run('UPDATE user_state SET level_id = ? WHERE user_id = ?', current.id, state.user_id);
  }
}

/** Đối tác "Tiết kiệm cùng Ekko" — natural key là `name`, giống `seedFeatures`. */
function seedSavingsChannels() {
  for (const c of SAVINGS_CHANNELS) {
    if (get('SELECT id FROM savings_channels WHERE name = ?', c.name)) continue;
    run(
      'INSERT INTO savings_channels (name, logo, rates, order_index) VALUES (?,?,?,?)',
      c.name, c.logo, JSON.stringify(c.rates), c.order_index,
    );
  }
}

/** Lãi suất tham khảo của ngân hàng thật — natural key là `name`. */
function seedBankInterestRates() {
  for (const b of BANK_INTEREST_RATES) {
    if (get('SELECT id FROM bank_interest_rates WHERE name = ?', b.name)) continue;
    run(
      'INSERT INTO bank_interest_rates (name, group_code, logo, rates, order_index) VALUES (?,?,?,?,?)',
      b.name, b.group, b.logo, JSON.stringify(b.rates), b.order_index,
    );
  }
}

function seedFeatures() {
  for (const f of FEATURES) {
    if (get('SELECT id FROM features WHERE code = ?', f.code)) continue;
    run(
      `INSERT INTO features (code, name, description, route, order_index, xp_per_day, is_enabled)
       VALUES (?,?,?,?,?,?,1)`,
      f.code, f.name, f.description, f.route, f.order_index, f.xp_per_day,
    );
  }
}

/**
 * Nội dung khởi đầu cho carousel "Tin tức" — chạy đúng một lần (gate bằng
 * NEWS_VERSION), vì bảng `news` không có mã tự nhiên để kiểm tra trùng như
 * `features`/`categories`, chạy lại mỗi lần boot sẽ tạo trùng dòng.
 */
function seedNews() {
  for (const n of NEWS) {
    run(
      `INSERT INTO news (title, summary, category, image, body, read_minutes, order_index, is_published)
       VALUES (?,?,?,?,?,?,?,1)`,
      n.title, n.summary, n.category, n.image, n.body ?? null, n.read_minutes, n.order_index,
    );
  }
}

/**
 * Điền `body` cho các dòng tin tức đã seed TRƯỚC KHI cột này ra đời (nên đang
 * để trống) — chỉ điền chỗ trống, khớp theo tiêu đề, không đụng vào dòng nào
 * admin đã tự viết hay sửa nội dung.
 */
function backfillNewsBody() {
  for (const n of NEWS) {
    if (!n.body) continue;
    run(
      `UPDATE news SET body = ? WHERE title = ? AND (body IS NULL OR body = '')`,
      n.body, n.title,
    );
  }
}

/**
 * Đợt tin thứ hai (seed/news.js), xếp sau các tin đang có. Chạy một lần; bỏ qua
 * tin trùng tiêu đề (Admin đã tự thêm) — tin Admin đã xoá sẽ không quay lại.
 */
function seedMoreNews() {
  let order = get('SELECT COALESCE(MAX(order_index), 0) m FROM news').m;
  for (const n of MORE_NEWS) {
    if (get('SELECT 1 ok FROM news WHERE title = ?', n.title)) continue;
    order += 1;
    run(
      `INSERT INTO news (title, summary, category, image, body, read_minutes, order_index, is_published)
       VALUES (?,?,?,?,?,?,?,1)`,
      n.title, n.summary, n.category, n.image, n.body, n.read_minutes, order,
    );
  }
}

/** Thêm từ khoá còn thiếu cho nhóm chi tiêu đã có (giữ nguyên từ Admin đã sửa). */
function addCategoryKeywords() {
  for (const [code, words] of Object.entries(CATEGORY_KEYWORD_ADDITIONS)) {
    const row = get('SELECT id, keywords FROM categories WHERE code = ?', code);
    if (!row) continue;
    const have = String(row.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
    const lower = new Set(have.map((k) => k.toLowerCase()));
    const add = words.filter((w) => !lower.has(w.toLowerCase()));
    if (add.length) run('UPDATE categories SET keywords = ? WHERE id = ?', [...have, ...add].join(','), row.id);
  }
}

function seedCategories() {
  for (const c of CATEGORIES) {
    if (get('SELECT id FROM categories WHERE code = ?', c.code)) continue;
    run(
      'INSERT INTO categories (code, name, icon, color, keywords, group_code, group_label, order_index, daily_limit) VALUES (?,?,?,?,?,?,?,?,?)',
      c.code, c.name, c.icon, c.color, c.keywords, c.group_code ?? null, CATEGORY_GROUPS[c.group_code] ?? null, c.order_index, c.daily_limit ?? null,
    );
  }
}

/**
 * Đổi từ 10 nhóm chi tiêu phẳng sang 19 nhóm chia theo Nhu cầu/Mong muốn/Sự cố
 * (một lần, gate theo CATEGORY_GROUPS_VERSION): map lại mọi khoản chi và dòng
 * ngân sách đang trỏ vào nhóm cũ sang nhóm mới gần nghĩa nhất, rồi mới xoá
 * nhóm cũ — xoá trước thì FOREIGN KEY chặn lại vì còn dữ liệu tham chiếu.
 */
const OLD_CATEGORY_REMAP = {
  food: 'needs_food',
  transport: 'needs_transport',
  housing: 'needs_housing',
  shopping: 'wants_shopping',
  health: 'needs_health',
  family: 'wants_gift',
  entertainment: 'wants_entertainment',
  education: 'needs_education',
  saving: 'needs_other',
  other: 'needs_other',
};

function migrateCategoryGroups() {
  for (const [oldCode, newCode] of Object.entries(OLD_CATEGORY_REMAP)) {
    const oldRow = get('SELECT id FROM categories WHERE code = ?', oldCode);
    if (!oldRow) continue;
    const newRow = get('SELECT id FROM categories WHERE code = ?', newCode);
    if (!newRow) continue;

    run('UPDATE expenses SET category_id = ? WHERE category_id = ?', newRow.id, oldRow.id);

    // `budget_items` có ràng buộc UNIQUE (budget_id, category_id) — hai nhóm
    // cũ cùng dồn vào một nhóm mới (vd 'saving' và 'other' đều thành
    // 'needs_other') có thể tạo trùng khoá trong cùng một ngân sách. Cộng dồn
    // `planned` vào dòng đã có sẵn thay vì UPDATE thẳng.
    for (const item of all('SELECT * FROM budget_items WHERE category_id = ?', oldRow.id)) {
      const existing = get('SELECT * FROM budget_items WHERE budget_id = ? AND category_id = ?', item.budget_id, newRow.id);
      if (existing) {
        run('UPDATE budget_items SET planned = planned + ? WHERE id = ?', item.planned, existing.id);
        run('DELETE FROM budget_items WHERE id = ?', item.id);
      } else {
        run('UPDATE budget_items SET category_id = ? WHERE id = ?', newRow.id, item.id);
      }
    }

    run('DELETE FROM categories WHERE id = ?', oldRow.id);
  }
}

/**
 * Bot ghi nhanh đoán sai nhóm cho khá nhiều quán/thương hiệu thật (vd "El
 * Gaucho" rơi vào Thực phẩm chỉ vì từ khoá "ăn" quá chung chung) — bổ sung tên
 * thương hiệu quán ăn/cà phê phổ biến và bỏ từ khoá "ăn" trơ trọi.
 *
 * Chỉ UPDATE khi `keywords` hiện tại còn khớp NGUYÊN VĂN giá trị mặc định cũ —
 * nếu Admin đã tự sửa danh sách từ khoá của nhóm nào thì dòng đó không khớp
 * điều kiện `WHERE`, nên không bị ghi đè.
 */
const OLD_KEYWORDS = {
  needs_food: 'ăn,ăn sáng,ăn trưa,ăn tối,cơm,phở,bún,chợ,siêu thị,thực phẩm,đồ ăn,rau,thịt,cá',
  wants_dining: 'nhà hàng,quán ăn,quán nhậu,ăn ngoài,ship đồ ăn,grabfood,shopeefood,cơm văn phòng',
  wants_entertainment: 'cà phê,cafe,trà sữa,phim,rạp,game,netflix,spotify,karaoke,nhậu',
};

function backfillCategoryKeywords() {
  for (const c of CATEGORIES) {
    const old = OLD_KEYWORDS[c.code];
    if (!old) continue;
    run('UPDATE categories SET keywords = ? WHERE code = ? AND keywords = ?', c.keywords, c.code, old);
  }
}

/**
 * Vòng 2: đổi `guessCategory` sang match theo RANH GIỚI TỪ (xem nlp.js) và bỏ
 * từ khoá "chợ" trơ trọi — mất dấu thành "cho", trùng hệt giới từ "cho" cực
 * phổ biến trong tiếng Việt ("mua giày CHO Benz", "đóng tiền học CHO ai đó"…)
 * nên cứ câu nào có chữ "cho" là rơi tuốt vào Thực phẩm. Thêm luôn vài cách
 * nói "đóng tiền học" cho Giáo dục — case thực tế bị đoán sai.
 */
const OLD_KEYWORDS_V2 = {
  needs_food: 'ăn sáng,ăn trưa,ăn tối,cơm,phở,bún,chợ,siêu thị,winmart,bách hoá xanh,co.opmart,thực phẩm,đồ ăn,rau,thịt,cá,trứng,gạo',
  needs_education: 'sách,khoá học,học phí,tiếng anh,lớp học,giáo dục',
};

function backfillCategoryKeywordsV2() {
  for (const c of CATEGORIES) {
    const old = OLD_KEYWORDS_V2[c.code];
    if (!old) continue;
    run('UPDATE categories SET keywords = ? WHERE code = ? AND keywords = ?', c.keywords, c.code, old);
  }
}

/**
 * Điền ngưỡng cảnh báo mặc định cho cơ sở dữ liệu đã có sẵn. Chỉ chạy một lần
 * (gated theo version) và chỉ ghi vào nhóm còn để trống, nên ngưỡng do Admin đặt
 * không bị ghi đè.
 */
function seedCategoryLimits() {
  for (const c of CATEGORIES) {
    if (!c.daily_limit) continue;
    run('UPDATE categories SET daily_limit = ? WHERE code = ? AND daily_limit IS NULL', c.daily_limit, c.code);
  }
}

/**
 * Xoá hẳn sáu mô đun cũ (bài học, trang, câu hỏi, tiến độ đi theo nhờ ON DELETE
 * CASCADE), rồi đánh số lại các mô đun còn lại từ 1 theo đúng thứ tự đang có.
 */
function removeOldModules() {
  // seed() đã bọc mọi bước trong một giao dịch nên ở đây không mở thêm.
  for (const slug of REMOVED_MODULE_SLUGS) run('DELETE FROM modules WHERE slug = ?', slug);
  all('SELECT id FROM modules ORDER BY order_index, id')
    .forEach((m, i) => run('UPDATE modules SET order_index = ? WHERE id = ?', i + 1, m.id));
}

/**
 * Xếp lại thứ tự bài trong một mô đun theo đúng curriculum.js — dùng khi chèn
 * bài mới vào giữa. Bài Admin tự thêm (không có trong curriculum) đứng sau,
 * giữ nguyên thứ tự tương đối của chúng.
 */
function renumberLessons(moduleSlug) {
  const spec = MODULES.find((m) => m.slug === moduleSlug);
  const moduleRow = get('SELECT id FROM modules WHERE slug = ?', moduleSlug);
  if (!spec || !moduleRow) return;
  const rank = new Map(spec.lessons.map((l, i) => [l.slug, i]));
  all('SELECT id, slug, order_index FROM lessons WHERE module_id = ?', moduleRow.id)
    .sort((a, b) => (rank.get(a.slug) ?? 1e6 + a.order_index) - (rank.get(b.slug) ?? 1e6 + b.order_index))
    .forEach((l, i) => run('UPDATE lessons SET order_index = ? WHERE id = ?', i + 1, l.id));
}

/** @param {string[]} [only] chỉ gieo các mô đun có slug này (mặc định: tất cả) */
function seedCurriculum(only) {
  MODULES.forEach((m, mi) => {
    if (only && !only.includes(m.slug)) return;
    let moduleRow = get('SELECT * FROM modules WHERE slug = ?', m.slug);
    if (!moduleRow) {
      // Xếp sau mô đun cuối hiện có (seed mới thì trùng với mi + 1).
      const order = get('SELECT COALESCE(MAX(order_index), 0) n FROM modules').n + 1;
      const info = run(
        `INSERT INTO modules (order_index, title, slug, summary, emoji, cover_image, unlock_level, is_published)
         VALUES (?,?,?,?,?,?,?,1)`,
        order, m.title, m.slug, m.summary, MODULE_EMOJI[mi + 1] ?? null, m.cover_image, m.unlock_level,
      );
      moduleRow = get('SELECT * FROM modules WHERE id = ?', Number(info.lastInsertRowid));
    }

    m.lessons.forEach((l, li) => {
      let lessonRow = get('SELECT * FROM lessons WHERE module_id = ? AND slug = ?', moduleRow.id, l.slug);
      if (!lessonRow) {
        const info = run(
          `INSERT INTO lessons (module_id, order_index, title, slug, summary, cover_image, est_minutes, is_published)
           VALUES (?,?,?,?,?,?,?,1)`,
          moduleRow.id, li + 1, l.title, l.slug, l.summary, l.cover_image ?? m.cover_image,
          l.est_minutes,
        );
        lessonRow = get('SELECT * FROM lessons WHERE id = ?', Number(info.lastInsertRowid));
        // Bài chỉ gồm slide (bỏ qua câu trắc nghiệm, vốn thuộc mô đun) là một bộ slide.
        const pages = l.frames.filter((f) => f.kind !== 'quiz');
        if (pages.length && pages.every((f) => f.kind === 'slide')) {
          run("UPDATE lessons SET content_type = 'slides' WHERE id = ?", lessonRow.id);
        }
      }

      if (get('SELECT COUNT(*) n FROM frames WHERE lesson_id = ?', lessonRow.id).n > 0) return;

      // A lesson holds pages; its quiz question belongs to the module's
      // end-of-module test instead of sitting inside the lesson.
      let order = 0;
      l.frames.forEach((f) => {
        if (f.kind === 'quiz') {
          const next = get('SELECT COALESCE(MAX(order_index), 0) n FROM module_questions WHERE module_id = ?', moduleRow.id).n + 1;
          run(
            'INSERT INTO module_questions (module_id, order_index, question, options) VALUES (?,?,?,?)',
            moduleRow.id, next, f.payload.question, JSON.stringify(f.payload.options || []),
          );
          return;
        }
        order += 1;
        run(
          'INSERT INTO frames (lesson_id, order_index, kind, payload) VALUES (?,?,?,?)',
          lessonRow.id, order, f.kind, JSON.stringify(f.payload),
        );
      });
    });
  });
}

/**
 * One-time move for databases seeded before the module quiz existed: lift each
 * lesson's quiz frame up to its module, in lesson order, then drop the frame.
 * Also fills in the derived fields the new admin UI needs.
 */
function liftQuizzesToModules() {
  const stale = all(
    `SELECT f.id, f.payload, l.module_id, m.order_index AS mi, l.order_index AS li, f.order_index AS fi
       FROM frames f
       JOIN lessons l ON l.id = f.lesson_id
       JOIN modules m ON m.id = l.module_id
      WHERE f.kind = 'quiz'
      ORDER BY m.order_index, l.order_index, f.order_index`,
  );

  for (const frame of stale) {
    let payload = {};
    try { payload = JSON.parse(frame.payload || '{}'); } catch { /* skip malformed */ }
    if (payload.question) {
      const next = get('SELECT COALESCE(MAX(order_index), 0) n FROM module_questions WHERE module_id = ?', frame.module_id).n + 1;
      run(
        'INSERT INTO module_questions (module_id, order_index, question, options) VALUES (?,?,?,?)',
        frame.module_id, next, payload.question, JSON.stringify(payload.options || []),
      );
    }
    run('DELETE FROM frames WHERE id = ?', frame.id);
  }

  // Renumber the frames each lesson has left so there are no gaps.
  for (const lesson of all('SELECT id FROM lessons')) {
    all('SELECT id FROM frames WHERE lesson_id = ? ORDER BY order_index', lesson.id)
      .forEach((f, i) => run('UPDATE frames SET order_index = ? WHERE id = ?', i + 1, f.id));
  }

  // A lesson made only of slides authors as a deck; anything else is text.
  for (const lesson of all('SELECT id FROM lessons')) {
    const counts = get(
      "SELECT SUM(kind = 'slide') slides, COUNT(*) total FROM frames WHERE lesson_id = ?",
      lesson.id,
    );
    const type = counts.total > 0 && counts.slides === counts.total ? 'slides' : 'text';
    run('UPDATE lessons SET content_type = ? WHERE id = ?', type, lesson.id);
  }

  for (const [order, emoji] of Object.entries(MODULE_EMOJI)) {
    run("UPDATE modules SET emoji = ? WHERE order_index = ? AND COALESCE(emoji, '') = ''", emoji, Number(order));
  }
}

/** Sample expenses + a budget + a goal, so a fresh demo account is not empty. */
/**
 * Chức năng "Kế hoạch" đổi tên thành "Nhiệm vụ" (việc con bên trong gọi là
 * "việc"). Seed chỉ điền phần còn thiếu nên dòng cũ phải đổi tay một lần: tên
 * và mô tả chức năng — chỉ khi admin chưa sửa khác đi — và tên các nhiệm vụ
 * còn giữ nguyên tên mẫu gợi ý cũ.
 */
function renamePlansToMissions() {
  const feature = FEATURES.find((f) => f.code === 'plans');
  run("UPDATE features SET name = ? WHERE code = 'plans' AND name = 'Kế hoạch'", feature.name);
  run("UPDATE features SET description = ? WHERE code = 'plans' AND description = 'Lập kế hoạch và theo dõi từng nhiệm vụ cần hoàn thành.'", feature.description);
  const renamed = { 'Lập kế hoạch tiết kiệm': 'Tiết kiệm đều đặn', 'Kế hoạch thể dục': 'Nhiệm vụ thể dục', 'Kế hoạch tự do': 'Nhiệm vụ tự do' };
  for (const [from, to] of Object.entries(renamed)) run('UPDATE plans SET name = ? WHERE name = ?', to, from);
}

/**
 * Sáu cấp độ → mười cấp độ. Database đã có sáu cấp thì DỜI từng hàng cũ sang
 * vị trí mới (giữ id — tiến độ người học trỏ vào id — cùng phúc lợi, ảnh và tên
 * admin đã sửa), rồi chèn bốn cấp mới vào chỗ trống. Mô-đun mở khoá theo cấp và
 * huy hiệu "đạt cấp N" đổi số theo, để vẫn mở ở đúng mức XP như trước. Cuối
 * cùng tính lại cấp của mọi người theo XP (cấp mới chen giữa nên có người lên
 * cấp ngay). Database mới (chưa có cấp nào) thì bỏ qua — seedLevels lo.
 */
function expandToTenLevels() {
  const rows = all('SELECT id, order_index FROM levels ORDER BY order_index DESC');
  if (!rows.length || rows.length >= LEVELS.length) return;

  for (const row of rows) {   // từ cao xuống thấp, không vướng số đang dùng
    const next = OLD_LEVEL_TO_NEW[row.order_index];
    if (next) run('UPDATE levels SET order_index = ? WHERE id = ?', next, row.id);
  }
  for (const level of LEVELS) {
    if (get('SELECT 1 ok FROM levels WHERE order_index = ?', level.order_index)) continue;
    run(
      `INSERT INTO levels (order_index, name, emoji, perk, xp_required, character_image, is_active)
       VALUES (?,?,?,?,?,?,1)`,
      level.order_index, level.name, level.emoji, level.perk, level.xp_required, level.character_image,
    );
  }

  for (const module of all('SELECT id, unlock_level FROM modules')) {
    const next = OLD_LEVEL_TO_NEW[module.unlock_level];
    if (next && next !== module.unlock_level) run('UPDATE modules SET unlock_level = ? WHERE id = ?', next, module.id);
  }
  for (const badge of all("SELECT id, code, rule_value FROM badges WHERE rule_type = 'level_reached'")) {
    const next = OLD_LEVEL_TO_NEW[badge.rule_value];
    if (!next || next === badge.rule_value) continue;
    const fresh = BADGES.find((b) => b.code === badge.code);
    run('UPDATE badges SET rule_value = ?, description = COALESCE(?, description) WHERE id = ?', next, fresh?.description ?? null, badge.id);
  }

  const levels = all('SELECT id, xp_required FROM levels WHERE is_active = 1 ORDER BY order_index');
  for (const state of all('SELECT user_id, xp FROM user_state')) {
    let current = levels[0];
    for (const level of levels) if (state.xp >= level.xp_required) current = level;
    if (current) run('UPDATE user_state SET level_id = ? WHERE user_id = ?', current.id, state.user_id);
  }
}

export function seedDemoData(userId) {
  if (get('SELECT COUNT(*) n FROM expenses WHERE user_id = ?', userId).n > 0) return false;

  const cat = (code) => get('SELECT id FROM categories WHERE code = ?', code)?.id ?? null;
  const today = new Date();
  const dayOffset = (n) => {
    const d = new Date(today.getTime() - n * 86400000);
    return d.toISOString().slice(0, 10);
  };

  // Mã nhóm chi tiêu theo bộ hiện hành (needs_* / wants_*). Mã cũ kiểu 'food'
  // hay 'shopping' không còn tồn tại: dùng lại thì `cat()` trả null và toàn bộ
  // chi tiêu mẫu rơi vào "không có nhóm".
  const samples = [
    [45000, 'wants_entertainment', 'Cà phê sáng với đồng nghiệp', 0],
    [65000, 'needs_food', 'Cơm trưa văn phòng', 0],
    [120000, 'needs_transport', 'Đổ xăng', 1],
    [35000, 'wants_entertainment', 'Trà sữa', 1],
    [250000, 'wants_home', 'Đồ dùng nhà tắm', 2],
    [80000, 'needs_food', 'Ăn tối quán quen', 2],
    [15000, 'needs_transport', 'Gửi xe cả tuần', 3],
    [420000, 'needs_food', 'Sữa cho con', 4],
    [90000, 'wants_entertainment', 'Vé xem phim', 5],
    [55000, 'needs_food', 'Bún bò', 6],
  ];
  for (const [amount, code, note, ago] of samples) {
    run(
      'INSERT INTO expenses (user_id, amount, category_id, note, spent_on, source, created_at) VALUES (?,?,?,?,?,?,?)',
      userId, amount, cat(code), note, dayOffset(ago), 'manual', nowIso(),
    );
  }

  // Ngân sách mẫu đặt thẳng vào `budget_limits` — mô hình hiện hành. Hai dòng
  // phủ cả nhóm level 1, vài dòng bó vào một nhóm chi tiêu cụ thể, để màn Lập
  // ngân sách có đủ cả hai kiểu ngay từ lần mở đầu tiên.
  const month = new Date().toISOString().slice(0, 7);
  const plan = [
    ['needs', 'needs_food', 3000000],
    ['needs', 'needs_transport', 900000],
    ['needs', 'needs_housing', 3500000],
    ['wants', null, 2400000],
    ['incident', null, 1000000],
  ];
  for (const [groupCode, code, amount] of plan) {
    const categoryId = code ? cat(code) : null;
    if (code && !categoryId) continue;
    run(
      `INSERT INTO budget_limits (user_id, month, group_code, category_id, amount, notify_80, set_on, repeat_next, created_at)
       VALUES (?,?,?,?,?,1,?,0,?)`,
      userId, month, groupCode, categoryId, amount, month, nowIso(),
    );
  }

  run(
    'INSERT INTO goals (user_id, name, target_amount, saved_amount, deadline, icon, status, created_at) VALUES (?,?,?,?,?,?,?,?)',
    userId, 'Quỹ khẩn cấp 1 tháng', 6000000, 1800000, null, 'umbrella', 'active', nowIso(),
  );
  return true;
}

export function listSeedTables() {
  return {
    levels: all('SELECT COUNT(*) n FROM levels')[0].n,
    badges: all('SELECT COUNT(*) n FROM badges')[0].n,
    modules: all('SELECT COUNT(*) n FROM modules')[0].n,
    lessons: all('SELECT COUNT(*) n FROM lessons')[0].n,
    frames: all('SELECT COUNT(*) n FROM frames')[0].n,
  };
}

/**
 * Câu xác nhận cũ trong sổ chat của Ekko bot chỉ có chữ, không có dữ liệu thô,
 * nên không đọc lại được bằng ngôn ngữ khác. Lần này tách số tiền / nhóm / ghi
 * chú ra khỏi câu đã lưu và đặt vào `meta.logged` — từ đó trở đi việc đổi ngôn
 * ngữ dựng lại được cả những câu đã nói từ trước.
 *
 * Chỉ đọc và ghi phần `meta`; cột `text` giữ nguyên, nên chạy lại cũng không
 * làm hỏng gì. Câu nào không khớp mẫu thì bỏ qua.
 */
function backfillChatLogged() {
  const rows = all("SELECT id, text, meta FROM bot_messages WHERE role = 'bot'");
  const frames = lessonFrames();

  for (const row of rows) {
    let meta = null;
    try { meta = JSON.parse(row.meta || 'null'); } catch { continue; }
    if (!meta) continue;

    const next = { ...meta };
    let changed = false;

    if (!next.logged && !next.say) {
      // Câu xác nhận ghi chi tiêu có dạng riêng; còn lại đều là mẫu trong `SAY`.
      const logged = meta.kind === 'expense_logged' ? parseLoggedText(row.text) : null;
      const said = logged ? null : parseSaid(row.text, frames);
      if (logged) { next.logged = logged; changed = true; } else if (said) { next.say = said; changed = true; }
    }

    // Nhãn nút "Học bài …" cũng là một câu sinh ra từ mẫu, nên khôi phục luôn.
    if (meta.action?.label && !meta.action.labelSay) {
      const labelSay = parseSaid(meta.action.label, frames);
      if (labelSay) { next.action = { ...meta.action, labelSay }; changed = true; }
    }

    if (changed) run('UPDATE bot_messages SET meta = ? WHERE id = ?', JSON.stringify(next), row.id);
  }
}

/** Từng khung bài thành danh sách câu, đúng thứ tự Ekko bot vẫn ghép. */
function lessonFrames() {
  return all('SELECT payload FROM frames').map((row) => {
    let payload = {};
    try { payload = JSON.parse(row.payload || '{}'); } catch { /* bỏ khung hỏng */ }
    return {
      parts: [
        payload.title, payload.body, payload.caption, payload.intro, payload.question,
        ...(payload.hotspots || []).flatMap((h) => [h.label, h.text]),
        ...(payload.options || []).map((o) => o.text),
      ].filter(Boolean),
    };
  });
}

/**
 * Tên nhóm chi tiêu trong câu cũ có thể đã là bản tiếng Anh (câu đó được viết
 * lúc app đang chạy tiếng Anh). Lưu về **bản gốc tiếng Việt** để dịch xuôi được
 * sang cả hai chiều.
 */
const VI_BY_EN = new Map(Object.entries(EN).map(([vi, en]) => [en, vi]));

/** "Đã ghi **50.000đ** vào nhóm <emoji cũ> **Ăn uống** (ăn sáng)." → dữ liệu thô. */
function parseLoggedText(text) {
  // `đ` hoặc `d`: bản rất cũ của app viết đơn vị tiền không có dấu.
  const match = /\*\*([\d.,]+)[đd]\*\*\s*(?:vào nhóm|under)\s*(\S+)?\s*\*\*(.+?)\*\*(?:\s*\(([^)]*)\))?/u.exec(String(text || ''));
  if (!match) return null;

  const amount = Number(match[1].replace(/\D/g, ''));
  if (!amount) return null;

  const name = match[3].trim();
  return {
    amount,
    categoryName: VI_BY_EN.get(name) || name,
    categoryIcon: match[2] && !match[2].startsWith('**') ? match[2] : null,
    note: match[4]?.trim() || null,
  };
}
