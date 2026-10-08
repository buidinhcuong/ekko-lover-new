/**
 * Sổ hội thoại của Ekko bot.
 *
 * Một cái sổ duy nhất cho hai đường vào: khung chat, và thanh ghi nhanh ở đáy
 * màn hình. Ghi nhanh cũng là một câu người dùng tự gõ ("cà phê 35k"), nên nó
 * hiện trong khung chat y như khi nhắn cho bot — người dùng chỉ có một dòng thời
 * gian, không phải hai chỗ rời rạc.
 *
 * `source` phân biệt hai đường vào: huy hiệu "Bạn của Ekko bot" chỉ đếm trò
 * chuyện thật ('chat'), không đếm ghi nhanh ('quick').
 */
import { run } from '../db.js';
import { formatVnd, nowIso } from '../lib/time.js';
import { tr } from '../i18n/index.js';

export const CHAT_SOURCES = ['chat', 'quick'];

export function appendMessages(userId, messages, source = 'chat') {
  const at = nowIso();
  for (const message of messages) {
    run(
      'INSERT INTO bot_messages (user_id, role, text, meta, created_at, source) VALUES (?,?,?,?,?,?)',
      userId,
      message.role,
      message.text,
      message.meta ? JSON.stringify(message.meta) : null,
      at,
      source,
    );
  }
}

/**
 * Câu xác nhận sau khi ghi một khoản chi, dựng từ dữ liệu thô.
 *
 * Tách khỏi `expenseLoggedReply` để dựng lại được ở ngôn ngữ khác: sổ hội thoại
 * lưu `logged` (số tiền, nhóm, ghi chú) chứ không chỉ lưu câu đã viết, nên khi
 * người dùng đổi sang tiếng Anh thì những câu bot đã nói cũng đọc bằng tiếng Anh.
 * Riêng câu người dùng tự gõ ("cà phê 35k") thì giữ nguyên — đó là lời của họ.
 */
export function renderExpenseLogged(logged, lang = 'vi') {
  const money = formatVnd(logged?.amount, lang);
  const name = tr(logged?.categoryName || 'Khác', lang);
  const tail = logged?.note ? ` (${logged.note})` : '';

  // Không in biểu tượng nhóm vào câu: khung chat chỉ hiện chữ, còn biểu tượng
  // giờ là tên icon ("package") chứ không còn là emoji — in ra thành chữ lạ.
  return lang === 'en'
    ? `Logged **${money}** under **${name}**${tail}. Wrong category? Just say "move to Shopping".`
    : `Đã ghi **${money}** vào nhóm **${name}**${tail}. Sai nhóm thì nhắn "đổi sang Mua sắm" nhé.`;
}

/**
 * Câu xác nhận sau khi ghi một khoản chi. Dùng chung cho Ekko bot và thanh ghi
 * nhanh, nên hai đường vào nói cùng một kiểu trong khung chat.
 */
export function expenseLoggedReply({ amount, category, note }, lang = 'vi') {
  const logged = {
    amount,
    categoryName: category?.name || 'Khác',
    note: note || null,
  };

  return {
    kind: 'expense_logged',
    logged,
    text: renderExpenseLogged(logged, lang),
    action: { type: 'navigate', route: '/app/#/expenses', label: 'Mở sổ chi tiêu' },
    // "Đổi mục": nhờ bot chuyển khoản vừa ghi sang mục khác (BUG-010).
  };
}
