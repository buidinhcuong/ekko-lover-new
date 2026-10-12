/**
 * Đọc một câu ghi chi tiêu ("sáng nay ăn phở 45k với cà phê 25 nghìn", "hôm qua
 * đổ xăng năm chục") thành các khoản chi: số tiền, ghi chú, nhóm chi tiêu, ngày.
 * Dùng chung cho thanh ghi nhanh, "Nói để ghi" và Ekko bot.
 *
 * - Có ANTHROPIC_API_KEY: Claude đọc câu (structured output). Nhóm chi tiêu chỉ
 *   được chọn trong đúng danh sách nhóm của Admin (enum mã nhóm), kèm tên, nhóm
 *   level 1 và từ khoá của từng nhóm để phân loại sát với cách Admin đã định nghĩa.
 * - Mọi kết quả của AI đều được kiểm lại: số tiền phải dương, ngày không được ở
 *   tương lai hay quá xa, mã nhóm phải có thật. AI tự báo không chắc về nhóm mà
 *   từ khoá của Admin lại khớp một nhóm thì theo từ khoá.
 * - Không có khoá, AI lỗi hoặc hết giờ: dùng bộ đọc tiếng Việt viết sẵn
 *   (services/nlp.js) — một khoản mỗi câu, như trước.
 *
 * Gọi HTTP trực tiếp như receiptAI.js (dự án không có dependency).
 */
import { config } from '../config.js';
import { all } from '../db.js';
import { addDays, dayKey } from '../lib/time.js';
import { extractNote, guessCategory, parseAmount, spokenToDigits } from './nlp.js';
import { keyState } from './receiptAI.js';
import { CATEGORY_GROUPS } from '../seed/catalogue.js';
import { takeAiCall } from './aiQuota.js';
import { recordAiUsage } from './aiUsage.js';

const endpoint = () => `${config.anthropicBaseUrl}/v1/messages`;
/** Ghi nhanh phải nhanh: quá lâu thì thôi chờ, dùng bộ đọc viết sẵn. */
const TIMEOUT_MS = 12_000;
const EFFORT = 'low';
const MAX_ITEMS = 5;
/** Ghi lùi ngày tối đa bao lâu (câu kiểu "tuần trước", "hôm kia"). */
const MAX_DAYS_BACK = 62;
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export const loadCategories = () => all('SELECT * FROM categories ORDER BY order_index, id')
  .map((c) => ({ ...c, group_name: c.group_label || CATEGORY_GROUPS[c.group_code] || c.group_code || '' }));

// --- bộ đọc viết sẵn (dự phòng) -------------------------------------------

function ruleRead(text, categories, today) {
  const spoken = spokenToDigits(text);
  const parsed = parseAmount(spoken);
  if (!parsed) return [];
  const note = extractNote(spoken);
  const category = guessCategory(note || spoken, categories);
  return [{ amount: parsed.amount, note: note || category?.name || null, category, spentOn: today }];
}

/** Nhóm theo từ khoá của Admin, hoặc null nếu không từ khoá nào khớp (khác với "Khác" mặc định). */
function keywordCategory(text, categories) {
  const guess = guessCategory(text, categories);
  return guess && String(guess.keywords || '').trim() ? guess : null;
}

// --- AI -------------------------------------------------------------------

function systemPrompt(categories) {
  const groups = new Map();
  for (const c of categories) {
    const key = c.group_code || 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const catalogue = [...groups.entries()].map(([group, list]) => [
    `Nhóm lớn "${list[0].group_name || group}" (${group}):`,
    ...list.map((c) => `- ${c.code}: ${c.name}${c.keywords ? ` — từ khoá: ${c.keywords}` : ''}`),
  ].join('\n')).join('\n\n');

  return [
    'Bạn đọc câu ghi chi tiêu tiếng Việt của người lao động trong app Ekko và tách thành các khoản chi.',
    '',
    'Số tiền (đơn vị đồng, số nguyên):',
    '- "k", "nghìn", "ngàn", "ka" = 1.000 · "tr", "triệu", "củ" = 1.000.000 · "1tr2" = 1.200.000 · "2tr5" = 2.500.000.',
    '- "chục" trong câu nói về tiền nghĩa là chục nghìn: "năm chục" = 50.000, "một trăm rưỡi" = 150.000.',
    '- "xị", "lít" (tiếng lóng) = 100.000 · "rưỡi" = thêm một nửa đơn vị đứng trước.',
    '- Một số trần không đơn vị: dưới 1.000 thì hiểu là nghìn ("cà phê 25" = 25.000); từ 1.000 trở lên giữ nguyên.',
    '',
    'Tách khoản:',
    '- Mỗi món có số tiền riêng là một khoản ("phở 45k, cà phê 25k" là 2 khoản). Một số tiền chung cho nhiều món là 1 khoản.',
    '- note: tên ngắn gọn của khoản chi, viết thường như người dùng nói, bỏ số tiền và từ đệm (ghi, chi, tiêu, mua, hết, mất).',
    '- spent_on: ngày chi dạng YYYY-MM-DD, suy ra từ "hôm qua", "hôm kia", "thứ hai"… so với ngày hôm nay được cho. Không nói ngày thì để chuỗi rỗng.',
    '- is_expense = false nếu câu không phải ghi một khoản chi (câu hỏi, thu nhập, lời chào…), khi đó items để rỗng.',
    '',
    'Nhóm chi tiêu (category_code) — chỉ chọn trong danh sách dưới. Chọn theo Ý NGHĨA của khoản chi, dùng từ khoá để hiểu Admin xếp món nào vào nhóm nào; từ khoá trùng thì ưu tiên nhóm có từ khoá khớp dài nhất. Ăn ở nhà/đi chợ là thực phẩm thiết yếu; ăn ngoài, gọi đồ ăn là nhà hàng; cà phê, trà sữa là giải trí. Không xếp được thì chọn nhóm "Khác" hợp nhất và confidence = "thap".',
    '',
    catalogue,
  ].join('\n');
}

function schema(codes) {
  return {
    type: 'object',
    properties: {
      is_expense: { type: 'boolean' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            amount: { type: 'integer' },
            note: { type: 'string' },
            category_code: { type: 'string', enum: codes },
            spent_on: { type: 'string' },
            confidence: { type: 'string', enum: ['cao', 'trung_binh', 'thap'] },
          },
          required: ['amount', 'note', 'category_code', 'spent_on', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['is_expense', 'items'],
    additionalProperties: false,
  };
}

async function callClaude(text, categories, today, callId) {
  const codes = categories.map((c) => c.code);
  const weekday = WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()];
  const body = {
    model: config.anthropicModel,
    max_tokens: 2048,
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: schema(codes) } },
    fallbacks: 'default',
    // Danh sách nhóm ổn định giữa các lần gọi: để đầu prompt và đánh dấu cache.
    system: [{ type: 'text', text: systemPrompt(categories), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Hôm nay là ${weekday}, ${today}.\nCâu ghi chi tiêu: "${text}"` }],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error('[expenseReader]', response.status, (await response.text().catch(() => '')).slice(0, 300));
      return null;
    }
    const payload = await response.json();
    recordAiUsage(callId, payload);
    if (payload.stop_reason === 'refusal' || payload.stop_reason === 'max_tokens') return null;
    const raw = (payload.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[expenseReader] gọi thất bại:', err.name, err.cause?.code || '', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kiểm lại kết quả của AI và chốt nhóm chi tiêu. Tách riêng để kiểm thử được
 * mà không cần gọi API.
 */
export function sanitizeAiItems(out, categories, today = dayKey()) {
  if (!out || out.is_expense !== true || !Array.isArray(out.items)) return [];
  const byCode = new Map(categories.map((c) => [c.code, c]));
  const earliest = addDays(today, -MAX_DAYS_BACK);
  return out.items.slice(0, MAX_ITEMS).map((item) => {
    const amount = Math.round(Number(item.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000_000) return null;
    const note = String(item.note || '').trim().slice(0, 120) || null;
    let category = byCode.get(item.category_code) || null;
    // AI không chắc mà từ khoá của Admin khớp một nhóm: theo từ khoá.
    const keyword = note ? keywordCategory(note, categories) : null;
    if (keyword && (!category || item.confidence === 'thap')) category = keyword;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(item.spent_on || '') ? item.spent_on : '';
    const spentOn = day && day <= today && day >= earliest ? day : today;
    return { amount, note: note || category?.name || null, category, spentOn, confidence: item.confidence };
  }).filter(Boolean);
}

/**
 * Khoản chi người dùng đã xem lại trên màn "Nói để ghi" (lấy từ /api/expenses/parse),
 * gửi lại khi bấm Lưu — kiểm lại từng khoản thay vì đọc câu lần nữa (đỡ một lượt
 * AI, và lưu đúng cái người dùng vừa xác nhận).
 */
export function reviewedItems(list, categories = loadCategories(), today = dayKey()) {
  if (!Array.isArray(list)) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const earliest = addDays(today, -MAX_DAYS_BACK);
  return list.slice(0, MAX_ITEMS).map((item) => {
    const amount = Math.round(Number(item?.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000_000) return null;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(item.spentOn || '') ? item.spentOn : today;
    return {
      amount,
      note: String(item.note || '').trim().slice(0, 120) || null,
      category: byId.get(Number(item.categoryId ?? item.category?.id)) || null,
      spentOn: day <= today && day >= earliest ? day : today,
    };
  }).filter(Boolean);
}

/**
 * @returns {Promise<{ items: { amount: number, note: string|null, category: object|null, spentOn: string }[], source: 'ai'|'rule' }>}
 *   `items` rỗng nghĩa là câu không có khoản chi nào đọc được.
 */
export async function readExpenses(text, { today = dayKey(), categories = loadCategories(), userId = null } = {}) {
  const clean = String(text || '').trim().slice(0, 300);
  if (!clean) return { items: [], source: 'rule' };
  // Hết lượt AI hôm nay thì vẫn ghi được, bằng bộ đọc viết sẵn.
  const callId = keyState() === 'ok' ? takeAiCall(userId, 'quick') : false;
  if (callId) {
    const out = await callClaude(clean, categories, today, callId);
    const items = sanitizeAiItems(out, categories, today);
    if (items.length) return { items, source: 'ai' };
    // AI đọc được câu và nói rõ đây KHÔNG phải khoản chi (vd. "lương về 8 triệu"):
    // tin AI, không để bộ đọc viết sẵn vớt số tiền rồi ghi nhầm thành khoản chi.
    if (out && out.is_expense === false) return { items: [], source: 'ai', notExpense: true };
  }
  return { items: ruleRead(clean, categories, today), source: 'rule' };
}
