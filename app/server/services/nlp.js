/**
 * Small Vietnamese text helpers used by Ekko bot: diacritic-insensitive
 * matching, and parsing amounts out of everyday phrasing like
 * "cà phê 35k", "ăn trưa 60 nghìn", "grab 1,2 triệu", "mua sách 250.000đ".
 */

// Cùng một bộ đọc số tiền gõ tắt với ô Số tiền trong app ("29tr900", "1tr2"),
// nên một cách gõ ra đúng một con số dù gõ ở form hay ở thanh ghi nhanh.
import { findMoney } from '../../public/shared/money.js';

/** Lowercase and strip diacritics so "cà phê" matches "ca phe". */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd') // đ has no combining form, handle it separately
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'la', 'va', 'cua', 'cho', 'nhu', 'the', 'nao', 'gi', 'co', 'khong', 'thi', 'de', 'duoc',
  'toi', 'minh', 'ban', 'em', 'anh', 'chi', 'mot', 'nhung', 'nay', 'do', 'voi', 've',
  'trong', 'tren', 'duoi', 'ra', 'vao', 'khi', 'ma', 'hay', 'hoac', 'neu', 'se', 'da',
  'bi', 'boi', 'tu', 'den', 'sau', 'truoc', 'lam', 'sao', 'muon', 'can', 'phai', 'rat',
]);

export function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * A bare number only counts as money when it carries a unit or thousand
 * separators, so "quy tắc 50/30/20" is not mistaken for a 50 đồng expense.
 * Order matters: millions before thousands before separated digits.
 */
const MILLION = /(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|cu)\b/;
const THOUSAND = /(\d+(?:[.,]\d+)?)\s*(?:k|nghin|ngan)\b/;
const SEPARATED = /(\d{1,3}(?:[.,]\d{3})+)/;
const PLAIN_WITH_UNIT = /(\d{3,})\s*(?:d|dong|vnd)\b/;
const PLAIN_LARGE = /\b(\d{4,9})\b/;

/** "1,5" and "1.5" are decimals here; thousand separators handled separately. */
const decimal = (raw) => Number(raw.replace(',', '.'));

/**
 * @returns {{ amount:number, matched:string }|null} `matched` is in normalized form.
 */
export function parseAmount(text) {
  const source = normalize(text);

  // Có đơn vị viết tắt (tỷ/tr/k…, kể cả phần đuôi "29tr900") thì đọc bằng
  // bộ đọc chung trước; các mẫu dưới đây lo phần còn lại (số có dấu phân cách).
  const short = findMoney(text);
  if (short) return short;

  let m = MILLION.exec(source);
  if (m) return { amount: Math.round(decimal(m[1]) * 1_000_000), matched: m[0] };

  m = THOUSAND.exec(source);
  if (m) return { amount: Math.round(decimal(m[1]) * 1_000), matched: m[0] };

  m = SEPARATED.exec(source);
  if (m) return { amount: Number(m[1].replace(/[.,]/g, '')), matched: m[0] };

  m = PLAIN_WITH_UNIT.exec(source);
  if (m) return { amount: Number(m[1]), matched: m[0] };

  m = PLAIN_LARGE.exec(source);
  if (m) return { amount: Number(m[1]), matched: m[0] };

  return null;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Picks the category whose longest matching keyword wins ("cà phê" beats
 * "cà"). Match tại RANH GIỚI TỪ (\b), không phải cứ là chuỗi con nằm bất kỳ
 * đâu — kiểu match cũ từng đoán "Đóng tiền học cho Benz" thành Thực phẩm chỉ
 * vì từ khoá 2 ký tự "be" (Grab đối thủ) tình cờ nằm lọt trong "Benz". Ranh
 * giới từ chặn được lỗi "từ khoá ngắn lọt vào giữa từ khác", nhưng KHÔNG chặn
 * được trường hợp bỏ dấu xong hai từ khác nghĩa trùng chữ (vd "chợ" mất dấu
 * thành "cho", trùng hệt giới từ "cho" rất phổ biến) — loại từ khoá kiểu đó
 * phải sửa thẳng trong danh sách keywords (xem catalogue.js).
 */
export function guessCategory(text, categories) {
  const source = normalize(text);
  let best = null;
  let bestLength = 0;

  for (const category of categories) {
    for (const keyword of String(category.keywords || '').split(',')) {
      const needle = normalize(keyword);
      if (!needle || needle.length <= bestLength) continue;
      const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`);
      if (re.test(source)) {
        best = category;
        bestLength = needle.length;
      }
    }
  }
  // Không có nhóm mã 'other' trong bảng — các nhóm "Khác" đặt mã theo nhóm
  // level 1 ('needs_other'/'wants_other'). 'wants_other' là lựa chọn trung
  // tính nhất khi không đoán được gì.
  return best || categories.find((c) => c.code === 'wants_other') || null;
}

// Longest unit first, otherwise "tr" would eat the start of "triệu".
const AMOUNT_ANYWHERE = /\d+(?:[.,]\d+)*\s*(?:nghìn|ngàn|nghin|ngan|triệu|trieu|đồng|dong|vnđ|vnd|tr|cu|k|đ|d)?/gi;
const LEADING_VERB = /^\s*(?:ghi(?:\s*chép|\s*chep)?|tiêu|tieu|chi|mua|trả|tra|thanh\s*toán|thanh\s*toan|hôm\s*nay|hom\s*nay|vừa|vua|mới|moi|cho)\s+/i;

/** Drops the amount and filler verbs, leaving something usable as a note. */
export function extractNote(text) {
  let note = String(text || '').replace(AMOUNT_ANYWHERE, ' ');
  // Phrases stack ("ghi chi tiêu ăn sáng"), so peel them one at a time.
  for (let i = 0; i < 3 && LEADING_VERB.test(note); i += 1) {
    note = note.replace(LEADING_VERB, '');
  }
  return note.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Fraction of query tokens present in the document, 0..1. */
export function similarity(queryTokens, documentText) {
  if (!queryTokens.length) return 0;
  // So khớp NGUYÊN TỪ, không phải chuỗi con: "di" (đi) không được khớp vào giữa
  // "dien", "tho" (thơ) không được khớp vào "thoi".
  const words = new Set(normalize(documentText).split(/[^a-z0-9]+/));
  let hits = 0;
  for (const token of queryTokens) if (words.has(token)) hits += 1;
  return hits / queryTokens.length;
}

// --- số đọc bằng chữ -------------------------------------------------------
// Nhận giọng nói đôi khi trả về chữ thay vì chữ số ("ba mươi lăm nghìn"), và
// người lớn tuổi cũng hay gõ y như nói. Đổi cụm số bằng chữ thành chữ số trước
// khi đọc số tiền, để "cà phê ba mươi lăm nghìn" ra đúng 35.000đ.
const DIGIT_WORDS = {
  khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, nham: 5,
  sau: 6, bay: 7, tam: 8, chin: 9,
};
const SCALE_WORDS = { nghin: 1_000, ngan: 1_000, trieu: 1_000_000, ty: 1_000_000_000, ti: 1_000_000_000 };
const NUMBER_WORDS = new Set([...Object.keys(DIGIT_WORDS), ...Object.keys(SCALE_WORDS), 'muoi', 'tram', 'linh', 'le', 'ruoi']);

/** Giá trị của một cụm từ số đã bỏ dấu, hoặc null nếu không phải một số hợp lệ. */
function wordsToNumber(words) {
  let total = 0;      // phần đã chốt theo nghìn/triệu/tỷ
  let group = 0;      // phần dưới một nghìn đang dựng
  let pending = null; // chữ số đứng trơ, chờ xem sau nó là "mươi", "trăm" hay hết
  let lastScale = null;
  let lastWasHundred = false;
  for (const w of words) {
    if (w in DIGIT_WORDS) {
      if (pending !== null) return null;   // hai chữ số liền nhau: không phải số
      pending = DIGIT_WORDS[w];
      lastWasHundred = false;
    } else if (w === 'muoi') {
      group += pending === null ? 10 : pending * 10;
      pending = null;
    } else if (w === 'tram') {
      group += (pending ?? 1) * 100;
      pending = null;
      lastWasHundred = true;
    } else if (w === 'linh' || w === 'le') {
      // "một trăm linh năm": chỉ là chữ nối
    } else if (w === 'ruoi') {
      if (lastWasHundred) group += 50;
      else if (lastScale && group === 0 && pending === null) total += lastScale / 2;
      else return null;
    } else if (w in SCALE_WORDS) {
      const scale = SCALE_WORDS[w];
      const value = group + (pending ?? 0);
      total += (value || 1) * scale;
      group = 0; pending = null; lastScale = scale; lastWasHundred = false;
    } else {
      return null;
    }
  }
  if (pending !== null) {
    // "một triệu hai" = 1.200.000, "hai trăm năm" (= 250) — chữ số cuối đứng
    // ngay sau một bậc là phần mười của bậc đó.
    if (group === 0 && lastScale) total += pending * (lastScale / 10);
    else if (lastWasHundred) group += pending * 10;
    else group += pending;
  }
  return total + group;
}

/**
 * Đổi cụm số đọc bằng chữ trong câu thành chữ số, giữ nguyên phần còn lại.
 * Chỉ đổi cụm có bậc (trăm/nghìn/triệu/tỷ) hoặc đứng trước "đồng": "năm" một
 * mình là năm tháng, không phải 5 đồng.
 */
export function spokenToDigits(text) {
  // Nhận giọng nói tiếng Anh viết "35 thousand", "1.2 million": quy về k/tr.
  const english = String(text || '')
    .replace(/(\d+(?:[.,]\d+)?)\s*thousand\b/gi, '$1k')
    .replace(/(\d+(?:[.,]\d+)?)\s*million\b/gi, '$1tr');
  const parts = english.split(/(\s+)/);
  const words = parts.map((p) => (/\s/.test(p) ? null : normalize(p).replace(/[^a-z]/g, '')));
  const out = [];
  let i = 0;
  while (i < parts.length) {
    if (words[i] === null || !NUMBER_WORDS.has(words[i])) { out.push(parts[i]); i += 1; continue; }
    // gom một chuỗi từ số liên tiếp (bỏ qua khoảng trắng ở giữa)
    let j = i; const run = [];
    while (j < parts.length && (words[j] === null || NUMBER_WORDS.has(words[j]))) {
      if (words[j] !== null) run.push(j);
      j += 1;
    }
    // bỏ khoảng trắng thừa ở cuối chuỗi
    while (j > i && words[j - 1] === null) j -= 1;
    const runWords = run.map((k) => words[k]);
    const nextWord = words.slice(j).find((w) => w !== null);
    const hasScale = runWords.some((w) => w === 'tram' || w in SCALE_WORDS);
    // Phải có ít nhất một chữ số đọc bằng chữ: "35 nghìn" đã là chữ số, chữ
    // "nghìn" đứng một mình ở đó không phải là "một nghìn".
    const hasDigitWord = runWords.some((w) => w in DIGIT_WORDS || w === 'muoi' || w === 'tram');
    const value = runWords.length && hasDigitWord ? wordsToNumber(runWords) : null;
    if (value && (hasScale || nextWord === 'dong')) {
      out.push(String(value));
      // Đã quy ra đồng: thêm đơn vị nếu câu chưa nói, để bộ đọc số tiền nhận ra.
      if (nextWord !== 'dong' && value >= 1000) out.push(' đồng');
    } else {
      out.push(...parts.slice(i, j));
    }
    i = j;
  }
  return out.join('');
}
