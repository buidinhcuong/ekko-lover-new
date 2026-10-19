/**
 * Người dùng hỏi Ekko bot những gì — cho Bảng điều khiển của Admin.
 *
 * Chỉ tính CÂU HỎI: bỏ các tin ghi chi tiêu ("cà phê 35k"), đổi mục, tin quá
 * ngắn và câu ngoài phạm vi (xem kind của câu bot trả lời ngay sau). Hai lớp:
 *  - chủ đề tài chính: gom câu hỏi vào các nhóm cố định bên dưới (một câu có
 *    thể thuộc nhiều nhóm), đếm số câu và số người;
 *  - từ khoá: cụm 1–2 chữ người dùng gõ nhiều nhất.
 *
 * Chỉ trả về số đếm, không trả câu gốc. Từ khoá phải do ít nhất MIN_USERS người
 * khác nhau gõ mới hiện, để không lộ nội dung riêng của một người.
 */
import { all } from '../db.js';
import { dayKey } from '../lib/time.js';
import { normalize } from './nlp.js';

const MIN_USERS = 2;   // mặc định; HR doanh nghiệp xem thì dùng ngưỡng ẩn danh của công ty

/** Loại câu trả lời của bot cho thấy tin trước đó KHÔNG phải câu hỏi tài chính. */
const NOT_QUESTION = new Set([
  'expense_logged', 'recategorized', 'recategorize_same', 'recategorize_ask', 'recategorize_none',
  'too_short', 'empty', 'out_of_scope', 'navigate',
]);

/**
 * Chủ đề → mẫu khớp. `n` khớp trên câu đã bỏ dấu (người dùng hay gõ không dấu),
 * `v` khớp trên câu gốc có dấu — dùng cho từ mà bỏ dấu sẽ trùng nghĩa khác
 * ("nợ"/"nó", "lãi"/"lại").
 */
const TOPICS = [
  { code: 'saving', label: 'Tiết kiệm', n: /\b(tiet kiem|de danh|tich luy|so tiet kiem|gui tiet kiem|gui ngan hang)\b/ },
  { code: 'emergency', label: 'Quỹ khẩn cấp', n: /\b(quy khan cap|quy du phong|khan cap)\b/ },
  { code: 'debt', label: 'Nợ & vay', v: /\bnợ\b/, n: /\b(vay|tra no|no xau|vay nong|tin dung den|tra gop|khoan vay|cam do)\b/ },
  { code: 'card', label: 'Thẻ tín dụng', n: /\b(the tin dung|no the|quet the|credit card|the visa|sao ke)\b/ },
  { code: 'interest', label: 'Lãi suất', v: /\blãi\b/, n: /\b(lai suat|lai kep|tien lai|apr)\b/ },
  { code: 'budget', label: 'Ngân sách & chi tiêu', n: /\b(ngan sach|chi tieu|50\/30\/20|503020|tieu xai|tieu bao nhieu|chia tien|quan ly tien|ghi chep)\b/ },
  { code: 'income', label: 'Lương & thu nhập', n: /\b(luong|thu nhap|tien thuong|tang luong|kiem them|lam them thu nhap|viec lam them)\b/ },
  { code: 'ewa', label: 'Ứng lương (Ekko)', n: /\b(ung luong|ekko)\b/ },
  { code: 'invest', label: 'Đầu tư (vàng, chứng khoán…)', n: /\b(dau tu|chung khoan|co phieu|trai phieu|vang|bat dong san|crypto|coin|bitcoin|quy mo|chung chi quy)\b/ },
  { code: 'insurance', label: 'Bảo hiểm (nhân thọ, sức khoẻ…)', n: /\b(bao hiem nhan tho|bao hiem suc khoe|bao hiem xe|bao hiem)\b/ },
  { code: 'labor', label: 'Luật lao động & BHXH', n: /\b(bhxh|bao hiem xa hoi|bao hiem that nghiep|that nghiep|nghi phep|phep nam|hop dong lao dong|hop dong|lam them gio|tang ca|ot|sa thai|nghi viec|thoi viec|thai san|om dau|cong doan|luat lao dong|tro cap|luong toi thieu|ngay le|nghi le)\b/ },
  { code: 'tax', label: 'Thuế thu nhập', n: /\b(thue|quyet toan|mst|ma so thue)\b/ },
  { code: 'scam', label: 'Lừa đảo', n: /\b(lua dao|scam|gia danh|otp|chuyen nham|link la|app vay)\b/ },
  { code: 'purchase', label: 'Mua sắm lớn', n: /\b(mua xe|mua nha|iphone|dien thoai|laptop|xe may|o to|mua dat)\b/ },
  { code: 'goal', label: 'Mục tiêu & kế hoạch', n: /\b(muc tieu|ke hoach|nghi huu|huu tri|hoc phi|cuoi|dam cuoi|sinh con)\b/ },
  { code: 'stress', label: 'Áp lực tiền bạc', n: /\b(ap luc|stress|lo lang|mat ngu|khong du tien|het tien|thieu tien|cang thang|kho khan)\b/ },
];

/**
 * Từ không mang nghĩa — bỏ khi đếm từ khoá. So trên chữ CÓ DẤU khi người dùng
 * gõ có dấu ("chị", "lại", "nó" là từ đệm nhưng "chi", "lãi", "nợ" thì không);
 * gõ không dấu thì so dạng bỏ dấu, trừ vài chữ dễ trùng nghĩa tài chính.
 */
const STOP_V = new Set(`
tôi mình bạn em anh chị ạ à ơi nhé nha nhỉ có không ko k là gì nào thế thì và với của cho để được làm sao
nên hay hoặc nếu mà như những một các này đó kia đây vậy ra vào lên xuống từ đến sau trước khi bao nhiêu
mấy rồi chưa đang sẽ đã bị bởi về trong trên dưới rất quá lại cũng còn nữa vẫn chỉ mới giúp hỏi biết muốn
cần phải vui lòng xin chào cảm ơn ok oke uh ừ tháng ngày năm tuần nó họ vì nhất thêm nhiều ít
`.trim().split(/\s+/));
const KEEP_N = new Set(['chi', 'lai', 'no']);
const STOP_N = new Set([...STOP_V].map((w) => normalize(w)).filter((w) => !KEEP_N.has(w)));
const isStop = (x) => (x.w !== x.n ? STOP_V.has(x.w) : STOP_N.has(x.n));
/**
 * Chữ đơn quá chung để đứng một mình làm từ khoá ("mua", "trả", "tiêu"…) — vẫn
 * dùng được trong cụm hai chữ ("mua vàng", "trả nợ", "chi tiêu").
 */
const GENERIC = new Set(['mua', 'tra', 'tieu', 'nghi', 'du', 'quy', 'nen', 'dung', 'gui', 'nhan', 'rut', 'dong',
  'chia', 'cao', 'thap', 'nhanh', 'tien', 'trieu', 'nghin', 'ngan', 'chi', 'lo', 'di', 'an', 'het', 'them', 'bot',
  'tang', 'giam', 'mat', 'phi', 'tot', 'xau', 'an toan', 'ok']);

function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Tách chữ giữ nguyên dấu (để hiển thị), kèm dạng bỏ dấu (để so). */
function words(text) {
  return String(text || '').toLowerCase()
    .split(/[^\p{L}\p{N}/]+/u)
    .filter(Boolean)
    .map((w) => ({ w, n: normalize(w) }));
}

/**
 * Cụm từ khoá của một câu (dạng có dấu để hiển thị): cụm 2 chữ không chứa từ đệm,
 * và chữ đơn mang nghĩa (không phải từ đệm / chữ chung chung). Dùng cho EkkoFeed
 * khi không gọi được AI.
 */
export function phrasesOf(text, limit = 5) {
  const ws = words(text).filter((x) => !/^\d+$/.test(x.n));
  const out = [];
  const seen = new Set();
  const push = (key, shown) => { if (!seen.has(key)) { seen.add(key); out.push(shown); } };
  ws.forEach((x, i) => {
    const y = ws[i + 1];
    if (y && !isStop(x) && !isStop(y)) push(`${x.n} ${y.n}`, `${x.w} ${y.w}`);
  });
  ws.forEach((x) => {
    if (!isStop(x) && !GENERIC.has(x.n) && x.n.length > 2 && ![...seen].some((k) => k.split(' ').includes(x.n))) push(x.n, x.w);
  });
  return out.slice(0, limit);
}

export function botKeywordReport({ days = 30, today = dayKey(), scope = { employer: null, where: () => '1 = 1', params: [] }, minUsers = MIN_USERS } = {}) {
  const minGroup = Number.isInteger(minUsers) && minUsers >= 1 ? minUsers : MIN_USERS;
  const from = shiftDay(today, -(days - 1));
  // Mỗi tin của người dùng ghép với câu bot trả lời ngay sau (cùng người, id kế tiếp).
  const rows = all(
    `SELECT u.user_id, u.text,
            (SELECT b.meta FROM bot_messages b WHERE b.user_id = u.user_id AND b.id > u.id AND b.role = 'bot' ORDER BY b.id LIMIT 1) reply
       FROM bot_messages u
      WHERE u.role = 'user' AND substr(u.created_at, 1, 10) >= ? AND ${scope.where('u.user_id')}`,
    from, ...scope.params,
  );

  let expenseLogs = 0;
  let outOfScope = 0;
  const questions = [];
  for (const r of rows) {
    let kind = null;
    try { kind = JSON.parse(r.reply || 'null')?.kind || null; } catch { /* câu bot cũ không có meta */ }
    if (kind === 'expense_logged') expenseLogs += 1;
    if (kind === 'out_of_scope') outOfScope += 1;
    if (kind && NOT_QUESTION.has(kind)) continue;
    questions.push(r);
  }

  // Chủ đề.
  const topicHits = new Map(TOPICS.map((t) => [t.code, { messages: 0, users: new Set() }]));
  let untagged = 0;
  for (const q of questions) {
    const n = normalize(q.text);
    const v = String(q.text).toLowerCase();
    let tagged = false;
    for (const t of TOPICS) {
      if ((t.n && t.n.test(n)) || (t.v && t.v.test(v))) {
        const hit = topicHits.get(t.code);
        hit.messages += 1;
        hit.users.add(q.user_id);
        tagged = true;
      }
    }
    if (!tagged) untagged += 1;
  }
  const topics = TOPICS
    .map((t) => ({ code: t.code, label: t.label, messages: topicHits.get(t.code).messages, users: topicHits.get(t.code).users.size }))
    .filter((t) => t.messages > 0)
    .sort((a, b) => b.messages - a.messages || b.users - a.users);

  // Từ khoá: cụm 2 chữ và 1 chữ, mỗi câu tính một lần.
  const phrases = new Map();   // dạng bỏ dấu → { text: dạng có dấu gặp nhiều nhất, messages, users }
  const add = (key, shown, userId) => {
    if (!phrases.has(key)) phrases.set(key, { shownCount: new Map(), messages: 0, users: new Set() });
    const p = phrases.get(key);
    p.shownCount.set(shown, (p.shownCount.get(shown) || 0) + 1);
    p.messages += 1;
    p.users.add(userId);
  };
  const trigrams = new Map();   // cụm 3 chữ (bỏ dấu) → số câu, chỉ để biết khi nào gộp hai cụm 2 chữ
  for (const q of questions) {
    const ws = words(q.text).filter((x) => !/^\d+$/.test(x.n));
    const seen = new Set();
    for (let i = 0; i + 2 < ws.length; i += 1) {
      const key = `${ws[i].n} ${ws[i + 1].n} ${ws[i + 2].n}`;
      if (!seen.has(key)) { seen.add(key); trigrams.set(key, (trigrams.get(key) || 0) + 1); }
    }
    ws.forEach((x, i) => {
      if (!isStop(x) && x.n.length > 1 && !GENERIC.has(x.n) && !seen.has(x.n)) { seen.add(x.n); add(x.n, x.w, q.user_id); }
      const y = ws[i + 1];
      if (y && !isStop(x) && !isStop(y)) {
        const key = `${x.n} ${y.n}`;
        if (!seen.has(key)) { seen.add(key); add(key, `${x.w} ${y.w}`, q.user_id); }
      }
    });
  }
  const ranked = [...phrases.entries()]
    .map(([key, p]) => ({
      key,
      text: [...p.shownCount.entries()].sort((a, b) => b[1] - a[1])[0][0],
      messages: p.messages,
      users: p.users.size,
      words: key.split(' ').length,
    }))
    .filter((p) => p.users >= minGroup)
    .sort((a, b) => b.messages - a.messages || b.words - a.words);
  // Một chữ nằm trong cụm 2 chữ đã chọn với số lần gần bằng thì bỏ (tránh "tiết" + "kiệm" + "tiết kiệm").
  const keywords = [];
  for (const p of ranked) {
    if (p.words === 1 && keywords.some((k) => k.words >= 2 && k.key.split(' ').includes(p.key) && k.messages >= p.messages * 0.7)) continue;
    // Hai cụm nối tiếp nhau trong CÙNG các câu ("quỹ khẩn" + "khẩn cấp", cụm "quỹ
    // khẩn cấp" xuất hiện đúng chừng ấy lần) → gộp thành "quỹ khẩn cấp".
    if (p.words === 2) {
      const [a, b] = p.key.split(' ');
      const joined = keywords.find((k) => {
        if (k.words < 2 || k.messages !== p.messages) return false;
        const ks = k.key.split(' ');
        if (ks.at(-1) === a) return trigrams.get(`${ks.at(-2)} ${a} ${b}`) === p.messages;
        if (ks[0] === b) return trigrams.get(`${a} ${b} ${ks[1]}`) === p.messages;
        return false;
      });
      if (joined) {
        const shown = p.text.split(' ');
        if (joined.key.endsWith(` ${a}`)) { joined.key += ` ${b}`; joined.text += ` ${shown[1]}`; } else { joined.key = `${a} ${joined.key}`; joined.text = `${shown[0]} ${joined.text}`; }
        joined.words += 1;
        continue;
      }
    }
    keywords.push({ ...p });
    if (keywords.length >= 20) break;
  }

  return {
    days, from, to: today, minUsers: minGroup,
    totals: {
      messages: rows.length,
      questions: questions.length,
      askers: new Set(questions.map((q) => q.user_id)).size,
      expenseLogs,
      outOfScope,
      untagged,
    },
    topics,
    keywords: keywords.map(({ text, messages, users }) => ({ text, messages, users })),
  };
}
