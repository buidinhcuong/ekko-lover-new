/**
 * Đọc lại những câu Ekko bot đã nói trước khi app có hai ngôn ngữ.
 *
 * Câu cũ chỉ được lưu dưới dạng chữ, nên đổi ngôn ngữ thì chúng vẫn nằm đó bằng
 * tiếng Việt. Chỗ này làm ngược lại: lấy chính mẫu câu tiếng Việt trong
 * `botEngine`, biến nó thành một biểu thức có nhóm bắt, rồi tách câu đã lưu trở
 * lại thành `{ key, vars }` — đúng thứ mà `replaySay` cần để nói lại câu đó bằng
 * tiếng Anh.
 *
 * Chỉ ghi vào `meta`, không sửa cột `text`. Câu nào không khớp mẫu nào thì để
 * nguyên: thà một dòng còn tiếng Việt hơn là một dòng bị đoán sai số liệu.
 */
import { EN } from '../i18n/en.js';
import { SAY, excerptOf } from '../services/botEngine.js';

/** Tên trong dữ liệu có thể đã được lưu ở bản tiếng Anh; đưa về bản gốc. */
const VI_BY_EN = new Map(Object.entries(EN).map(([vi, en]) => [en, vi]));
const toSource = (text) => VI_BY_EN.get(text) || text;

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PLACEHOLDER = /\{(?:(money|name|month|parts|goals):)?(\w+)\}/g;

/** "35.000d" hoặc "1,175,000đ" → 35000 / 1175000. */
const toNumber = (text) => Number(String(text).replace(/\D/g, ''));

/** "Tháng 9/2026" → "2026-09". */
function toMonthKey(text) {
  const m = /Tháng\s+(\d{1,2})\/(\d{4})/.exec(String(text));
  return m ? `${m[2]}-${String(m[1]).padStart(2, '0')}` : String(text);
}

/** "- **Mua xe máy**: 0đ / 30.000.000đ (0%)" → { name, saved, target, percent }. */
function toGoals(block) {
  return String(block).split('\n').map((row) => {
    const m = /^-\s*\*\*(.+?)\*\*:\s*([\d.,]+)đ?\s*\/\s*([\d.,]+)đ?\s*\((\d+)%\)/.exec(row.trim());
    if (!m) return null;
    return {
      name: toSource(m[1]),
      saved: toNumber(m[2]),
      target: toNumber(m[3]),
      percent: Number(m[4]),
    };
  }).filter(Boolean);
}

/**
 * Một mẫu câu → biểu thức bắt lại các chỗ trống.
 *
 * Mẫu ghép (`'a+b'`) được nối lại trước khi dựng biểu thức, vì câu đã lưu là
 * hai nửa viết liền nhau.
 */
function matcher(key) {
  const template = key.split('+').map((part) => SAY.vi[part]).join('');
  const slots = [];
  let source = '';
  let last = 0;
  let m;

  PLACEHOLDER.lastIndex = 0;
  while ((m = PLACEHOLDER.exec(template))) {
    source += escapeRe(template.slice(last, m.index));
    slots.push({ kind: m[1] || 'plain', name: m[2] });
    source += '(.+?)';
    last = m.index + m[0].length;
  }
  source += escapeRe(template.slice(last));
  return { key, slots, re: new RegExp(`^${source}$`, 'su') };
}

/**
 * Thứ tự thử quan trọng: mẫu ghép phải đứng trước mẫu đơn, nếu không câu dài sẽ
 * khớp nửa đầu rồi bỏ mất nửa sau.
 */
const KEYS = [
  'spendSome+spendTop', 'badgesLine+badgesNext', 'badgesLine+badgesAll',
  'streakFrozen', 'streakToday', 'streakPending', 'streakZero',
  'levelOn', 'levelTop',
  'budgetLeft', 'budgetOver', 'budgetNone',
  'goalsSome', 'goalsNone',
  'spendSome', 'spendNone',
  'lessonHit', 'lessonOpen', 'lessonNext', 'opening', 'fallback', 'empty',
];

const MATCHERS = KEYS.map(matcher);

/**
 * Tách một câu bot đã lưu thành `{ key, vars }`.
 *
 * `frames` là danh sách khung bài (mỗi phần tử `{ parts: string[] }`) để dựng
 * lại nguyên văn đoạn trích của câu "nội dung này nằm trong bài…": đoạn trích là
 * ba câu đầu của một khung, nên tìm đúng khung nào cho ra đoạn trích ấy là khôi
 * phục được từng câu, thay vì phải dịch lại một khối chữ đã dán liền.
 */
export function parseSaid(text, frames = []) {
  const line = String(text || '').trim();
  if (!line) return null;

  for (const { key, slots, re } of MATCHERS) {
    const m = re.exec(line);
    if (!m) continue;

    const vars = {};
    let ok = true;

    slots.forEach((slot, i) => {
      const raw = m[i + 1];
      if (slot.kind === 'money') vars[slot.name] = toNumber(raw);
      else if (slot.kind === 'name') vars[slot.name] = toSource(raw);
      else if (slot.kind === 'month') vars[slot.name] = toMonthKey(raw);
      else if (slot.kind === 'goals') vars[slot.name] = toGoals(raw);
      else if (slot.kind === 'parts') {
        // Lưu cả khung bài, không lưu đoạn đã cắt: có thế bản tiếng Anh mới cắt
        // lại được cho gọn thay vì dán một khối chữ dài.
        const found = frames.find((f) => excerptOf(f.parts) === raw.trim());
        if (found) vars[slot.name] = found.parts;
        else ok = false;   // không tìm ra khung nào thì thà bỏ qua cả câu
      } else vars[slot.name] = /^\d[\d.,]*$/.test(raw) ? toNumber(raw) : raw;
    });

    if (!ok) return null;
    return { key, vars };
  }
  return null;
}
