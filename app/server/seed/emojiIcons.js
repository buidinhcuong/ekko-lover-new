/**
 * Đổi emoji cũ trong dữ liệu sang tên icon.
 *
 * App không dùng emoji nữa: mọi cột "biểu tượng" (`icon`, `emoji`, `logo`) giờ
 * chứa tên một icon trong `public/assets/icons/ui-icons.svg` (xuất từ trang
 * Icons của Figma "[Ekko UI] - Design System"), hoặc đường dẫn ảnh `/assets/...`.
 * Cột `emoji` của cấp độ và mô đun giữ nguyên tên cột cho khỏi phải đổi schema,
 * nhưng giá trị bên trong cũng là tên icon.
 *
 * Ngoại lệ duy nhất: HUY HIỆU giữ emoji (quyết định của chủ sản phẩm). Cột
 * `badges.icon` không bị đổi, và `restoreBadgeEmoji` trả lại emoji cho dòng
 * nào đã lỡ bị đổi ở lần chạy trước.
 *
 * Khoá của bảng viết bằng mã `\u{…}` để chính tệp này cũng không chứa emoji.
 *
 * Bảng dưới là cầu nối cho dữ liệu đã lưu trước đó: seed chỉ điền phần còn
 * thiếu, nên các dòng cũ (và mục tiêu, kế hoạch người dùng đã tạo) vẫn giữ
 * emoji cho tới khi `migrateEmojiIcons` chạy một lần.
 */
import { all, run } from '../db.js';
import { BADGES } from './catalogue.js';

export const EMOJI_ICON = {
  '\u{1F437}': 'piggy-bank', '\u{1F416}': 'piggy-bank', '\u{1F43D}': 'piggy-bank', '\u{1F439}': 'piggy-bank', '\u{1F417}': 'piggy-bank',
  '\u{1F451}': 'crown', '\u{1F50D}': 'search-01', '\u{1F9FE}': 'invoice-01', '\u{1F3AF}': 'target-02', '\u{1F4B3}': 'credit-card',
  '\u{1F6E1}\u{FE0F}': 'shield-01', '\u{1F6E1}': 'shield-01', '\u{1F9ED}': 'compass-01', '\u{1F4D6}': 'book-open-01', '\u{1F393}': 'mortarboard-02',
  '\u{1F525}': 'fire', '\u{26A1}': 'flash', '\u{1F3C6}': 'award-01', '\u{270F}\u{FE0F}': 'pencil-edit-02', '\u{270F}': 'pencil-edit-02',
  '\u{1F4DA}': 'books-01', '\u{1F916}': 'robot-01', '\u{1F5FA}\u{FE0F}': 'maps', '\u{1F5FA}': 'maps', '\u{1F966}': 'vegetarian-food',
  '\u{1F3E0}': 'home-01', '\u{1F697}': 'car-01', '\u{1F3E5}': 'hospital-01', '\u{1F4E6}': 'package', '\u{1F37D}\u{FE0F}': 'restaurant-01',
  '\u{1F37D}': 'restaurant-01', '\u{1F6CB}\u{FE0F}': 'sofa-01', '\u{1F6CB}': 'sofa-01', '\u{2615}': 'coffee-01', '\u{1F6CD}\u{FE0F}': 'shopping-bag-01',
  '\u{1F6CD}': 'shopping-bag-01', '\u{2708}\u{FE0F}': 'airplane-01', '\u{2708}': 'airplane-01', '\u{1F3A8}': 'paint-board', '\u{1F381}': 'gift',
  '\u{1F484}': 'perfume', '\u{1F6A8}': 'alert-02', '\u{1F9FA}': 'shopping-basket-01', '\u{1F6DF}': 'umbrella', '\u{1F6F5}': 'motorbike-01',
  '\u{1F4F1}': 'smart-phone-01', '\u{1F4BB}': 'laptop', '\u{1F392}': 'backpack-01', '\u{1F3E1}': 'house-03', '\u{1F9E7}': 'lantern',
  '\u{2728}': 'sparkles', '\u{1F4A1}': 'bulb', '\u{1F4B0}': 'money-bag-02', '\u{1F4C8}': 'chart-increase', '\u{1F4AA}': 'dumbbell-01',
  '\u{1F4CB}': 'task-01', '\u{1F4BC}': 'briefcase-01', '\u{1F504}': 'exchange-01', '\u{1F3C5}': 'medal-01', '\u{1F3E6}': 'bank',
  '\u{1F4F0}': 'news', '\u{1F35C}': 'restaurant-01',
};

/**
 * Cấp độ dùng icon theo ý nghĩa từng bậc thay vì năm con heo gần giống nhau:
 * mầm non → học việc → tích luỹ → no đủ → đầu tư → thịnh vượng.
 */
export const LEVEL_ICONS = ['plant-02', 'mortarboard-01', 'piggy-bank', 'money-bag-02', 'chart-increase', 'crown'];

const toIcon = (value, fallback) => {
  const v = String(value || '').trim();
  if (!v || v.startsWith('/') || /^[a-z0-9-]+$/.test(v)) return v || fallback;
  return EMOJI_ICON[v] || fallback;
};

/** Huy hiệu giữ emoji: trả lại emoji gốc trong catalogue cho dòng đang là tên icon. */
export function restoreBadgeEmoji() {
  for (const badge of BADGES) {
    run("UPDATE badges SET icon = ? WHERE code = ? AND icon GLOB '[a-z]*'", badge.icon, badge.code);
  }
}

/** Chạy một lần (seed giữ cờ phiên bản): đổi mọi emoji còn sót trong database, trừ huy hiệu. */
export function migrateEmojiIcons() {
  for (const row of all('SELECT id, order_index, emoji FROM levels')) {
    // Cấp đã mang tên icon (seed mới, hoặc đã đổi) thì để nguyên — bảng
    // LEVEL_ICONS chỉ đúng với sáu cấp gốc theo thứ tự cũ.
    if (/^[a-z0-9-]+$/.test(String(row.emoji || ''))) continue;
    run('UPDATE levels SET emoji = ? WHERE id = ?', LEVEL_ICONS[row.order_index - 1] || toIcon(row.emoji, 'piggy-bank'), row.id);
  }
  const columns = [
    ['modules', 'emoji', 'books-01'],
    ['categories', 'icon', 'package'],
    ['goals', 'icon', 'target-02'],
    ['plans', 'icon', 'task-01'],
  ];
  for (const [table, column, fallback] of columns) {
    for (const row of all(`SELECT id, ${column} AS v FROM ${table}`)) {
      const next = toIcon(row.v, fallback);
      if (next !== row.v) run(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, next, row.id);
    }
  }
  // Lịch sử chat: câu cũ lưu kèm emoji ("vào nhóm <emoji> **Ăn uống**", dòng
  // cảnh báo mở đầu bằng biển báo). Màn chat dựng lại câu từ `meta`, nhưng bản
  // chữ gốc cũng được dọn để database không còn emoji nào.
  const EMOJI_RUN = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]\u{FE0F}?\s?/gu;
  for (const row of all('SELECT id, text, meta FROM bot_messages')) {
    let meta = row.meta;
    try {
      const parsed = JSON.parse(row.meta || 'null');
      if (parsed?.logged?.categoryIcon) {
        parsed.logged.categoryIcon = toIcon(parsed.logged.categoryIcon, 'package');
        meta = JSON.stringify(parsed);
      }
    } catch { /* meta hỏng thì để nguyên */ }
    const text = String(row.text || '').replace(EMOJI_RUN, '');
    if (text !== row.text || meta !== row.meta) run('UPDATE bot_messages SET text = ?, meta = ? WHERE id = ?', text, meta, row.id);
  }

  // Logo ngân hàng là ảnh thật; chỉ dòng nào còn emoji tạm mới đổi sang icon.
  for (const table of ['savings_channels', 'bank_interest_rates']) {
    for (const row of all(`SELECT id, logo FROM ${table}`)) {
      const next = toIcon(row.logo, 'bank');
      if (next !== row.logo) run(`UPDATE ${table} SET logo = ? WHERE id = ?`, next, row.id);
    }
  }
}
