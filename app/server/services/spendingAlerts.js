/**
 * Cảnh báo khi một khoản chi vừa ghi trông bất thường.
 *
 * Việc cần bắt nhất là **gõ nhầm số**: "ăn trưa 2 triệu" gần như luôn là 200
 * nghìn bị gõ thêm số 0. Việc thứ hai là nhắc nhẹ khi một lần chi ăn hết phần
 * lớn hạn mức của cả tháng.
 *
 * Ba luật, xếp theo mức đáng nói:
 *
 *   1. `daily_large`   — vượt ngưỡng "một lần" của nhóm (Admin đặt được).
 *   2. `personal_spike`— gấp nhiều lần mức thường của chính người dùng.
 *   3. `budget_share`  — một khoản chiếm phần lớn hạn mức tháng của nhóm.
 *
 * Ngưỡng của nhóm chỉ là phỏng đoán mặc định. Nếu chính người dùng vẫn thường
 * chi ở mức đó (`normalForYou`) thì luật 1 im lặng — người hay ăn nhà hàng không
 * đáng bị nhắc mỗi ngày. Đó là lý do luật 1 và luật 2 phải đi cùng nhau.
 */
import { all, get } from '../db.js';
import { formatVnd, monthKey } from '../lib/time.js';
import { tr } from '../i18n/index.js';

/** Khung câu cảnh báo: có số và tên nhóm chen vào nên mỗi ngôn ngữ một mẫu. */
const SAY = {
  vi: {
    largeTitle: (amount, name) => `${amount} cho một lần ${name.toLowerCase()}?`,
    largeText: (name, limit) => `Mức này lớn bất thường cho một khoản ${name.toLowerCase()} thường ngày (trên ${limit}). Nếu bạn gõ nhầm số, sửa lại trong sổ chi tiêu nhé.`,
    spikeTitle: (times) => `Gấp ${times} lần mức thường của bạn`,
    spikeText: (name, median, amount) => `Bạn thường chi khoảng ${median} mỗi lần ở nhóm ${name}. Khoản này là ${amount}.`,
    shareTitle: (share, name) => `Một khoản bằng ${share}% hạn mức ${name}`,
    shareText: (name, planned, share) => `Hạn mức ${name} tháng này là ${planned}. Riêng khoản vừa ghi đã chiếm ${share}%.`,
  },
  en: {
    largeTitle: (amount, name) => `${amount} in one go on ${name.toLowerCase()}?`,
    largeText: (name, limit) => `That is unusually large for everyday ${name.toLowerCase()} (above ${limit}). If you mistyped the number, fix it in your expense log.`,
    spikeTitle: (times) => `${times}× your usual amount`,
    spikeText: (name, median, amount) => `You normally spend about ${median} at a time on ${name}. This one is ${amount}.`,
    shareTitle: (share, name) => `One expense equals ${share}% of your ${name} budget`,
    shareText: (name, planned, share) => `Your ${name} budget this month is ${planned}. This single entry takes ${share}% of it.`,
  },
};

const line = (lang) => SAY[lang] || SAY.vi;

/** Số bản ghi tối thiểu để "mức thường của bạn" có nghĩa. */
const MIN_HISTORY = 5;
/** Lấy mức giữa của 20 khoản gần nhất, không lấy trung bình: một khoản lệch lớn không kéo mức tham chiếu. */
const HISTORY_WINDOW = 20;
const SPIKE_FACTOR = 4;
const NORMAL_FACTOR = 3;
/** Một khoản bằng nửa hạn mức tháng của nhóm là đáng nói. */
const BUDGET_SHARE = 0.5;

function personalMedian(userId, categoryId, excludeId) {
  if (!categoryId) return null;
  const rows = all(
    `SELECT amount FROM expenses
      WHERE user_id = ? AND category_id = ? AND id <> ?
      ORDER BY id DESC LIMIT ?`,
    userId, categoryId, excludeId ?? 0, HISTORY_WINDOW,
  ).map((r) => r.amount);

  if (rows.length < MIN_HISTORY) return null;
  const sorted = rows.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Hạn mức tháng áp cho một nhóm chi tiêu.
 *
 * Ngân sách giờ đặt theo từng dòng trong `budget_limits`: một dòng có thể bó
 * vào đúng một nhóm chi tiêu, hoặc phủ cả nhóm level 1 (needs / wants /
 * incident). Dòng riêng cho nhóm chi tiêu thì sát hơn nên được ưu tiên; không
 * có thì lùi về dòng của cả nhóm level 1.
 *
 * (Trước đây hàm này đọc `budget_items`/`budgets` — hai bảng của mô hình ngân
 * sách cũ, nay không còn được ghi nữa, nên cảnh báo `budget_share` không bao
 * giờ bật được.)
 */
function categoryPlan(userId, categoryId, month) {
  if (!categoryId) return null;

  const byCategory = get(
    'SELECT amount FROM budget_limits WHERE user_id = ? AND month = ? AND category_id = ?',
    userId, month, categoryId,
  );
  if (byCategory?.amount > 0) return byCategory.amount;

  const byGroup = get(
    `SELECT bl.amount
       FROM budget_limits bl
       JOIN categories c ON c.group_code = bl.group_code
      WHERE bl.user_id = ? AND bl.month = ? AND bl.category_id IS NULL AND c.id = ?`,
    userId, month, categoryId,
  );
  return byGroup?.amount > 0 ? byGroup.amount : null;
}

/**
 * @returns {Array<{code:string, tone:string, title:string, text:string, data:object}>}
 *          Rỗng nếu khoản chi này bình thường. Phần tử đầu là cái đáng nói nhất.
 */
export function expenseAlerts(userId, expense, category, lang = 'vi') {
  const amount = Number(expense?.amount) || 0;
  if (amount <= 0) return [];

  const alerts = [];
  const limit = category?.daily_limit > 0 ? category.daily_limit : null;
  const median = personalMedian(userId, expense.category_id, expense.id);

  const normalForYou = median !== null && amount <= median * NORMAL_FACTOR;
  const spike = median !== null && amount >= median * SPIKE_FACTOR;

  if (limit && amount >= limit && !normalForYou) {
    alerts.push(renderAlert({
      code: 'daily_large', tone: 'warning',
      // `data` là phần đủ để dựng lại câu ở ngôn ngữ khác. Sổ hội thoại của Ekko
      // bot lưu nó lại, nên đổi ngôn ngữ thì cảnh báo cũ cũng đọc được.
      data: { categoryName: category?.name || 'Khác', amount, limit },
    }, lang));
  } else if (spike) {
    alerts.push(renderAlert({
      code: 'personal_spike', tone: 'warning',
      data: { categoryName: category?.name || 'Khác', amount, median },
    }, lang));
  }

  const planned = categoryPlan(userId, expense.category_id, expense.spent_on?.slice(0, 7) || monthKey());
  if (planned && amount >= planned * BUDGET_SHARE) {
    alerts.push(renderAlert({
      code: 'budget_share', tone: 'warning',
      data: { categoryName: category?.name || 'Khác', amount, planned },
    }, lang));
  }

  return alerts;
}

/**
 * Dựng `title` và `text` của một cảnh báo từ `data`, ở ngôn ngữ đang chọn.
 *
 * Tách riêng để cùng một cảnh báo hiển thị được hai lần bằng hai thứ tiếng: một
 * lần ngay khi ghi khoản chi, một lần nữa khi người dùng mở lại sổ hội thoại sau
 * khi đã đổi ngôn ngữ.
 */
export function renderAlert(alert, lang = 'vi') {
  const say = line(lang);
  const d = alert.data || {};
  const name = tr(d.categoryName || 'Khác', lang);
  const money = (value) => formatVnd(value, lang);

  if (alert.code === 'daily_large') {
    return {
      ...alert,
      title: say.largeTitle(money(d.amount), name),
      text: say.largeText(name, money(d.limit)),
    };
  }
  if (alert.code === 'personal_spike') {
    return {
      ...alert,
      title: say.spikeTitle(Math.floor(d.amount / d.median)),
      text: say.spikeText(name, money(d.median), money(d.amount)),
    };
  }
  if (alert.code === 'budget_share') {
    const share = Math.round((d.amount / d.planned) * 100);
    return {
      ...alert,
      title: say.shareTitle(share, name),
      text: say.shareText(name, money(d.planned), share),
    };
  }
  return alert;
}

/** Một dòng gọn để chèn vào câu trả lời của Ekko bot. */
export const alertLine = (alerts, lang = 'vi') => {
  if (!alerts?.length) return '';
  const first = renderAlert(alerts[0], lang);
  return `\n\n**${first.title}** ${first.text}`;
};
