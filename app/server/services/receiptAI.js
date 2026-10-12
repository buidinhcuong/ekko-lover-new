/**
 * Đọc ảnh hoá đơn bằng Claude: lấy số tiền và đoán nhóm chi tiêu, để người dùng
 * chỉ việc chụp ảnh rồi bấm lưu.
 *
 * Gọi thẳng HTTP chứ không dùng SDK chính thức của Anthropic, vì cả dự án này
 * chạy **không một gói phụ thuộc nào** — thêm SDK là kéo theo node_modules và một
 * bước `npm install` mà máy khác phải làm trước khi chạy được. Đổi lại, ở đây phải
 * tự lo phần mà SDK vẫn làm hộ: hết giờ thì cắt, lỗi HTTP thì dịch ra tiếng người.
 *
 * Khoá API và tên model lấy từ `config` — cùng chỗ mà phần trả lời dự phòng của
 * Ekko bot đang dùng, để cả app chỉ có một nơi khai báo. Khoá đọc từ biến môi
 * trường `ANTHROPIC_API_KEY`, không bao giờ ghi ra log và không nằm trong mã nguồn.
 * Chưa đặt khoá thì tính năng tự tắt, người dùng nhập tay như cũ — không màn hình
 * nào hỏng vì thiếu khoá.
 */
import { config } from '../config.js';
import { recordAiUsage } from './aiUsage.js';

const endpoint = () => `${config.anthropicBaseUrl}/v1/messages`;
const TIMEOUT_MS = 30_000;

/** Đọc hoá đơn là việc ngắn và rõ, không cần cho model nghĩ sâu. */
const EFFORT = 'low';

/**
 * Khoá đã đặt chưa, và có ra dáng khoá thật không.
 *
 * Có mục 'invalid' riêng vì một khoá dán sai (còn nguyên chuỗi mẫu, lẫn dấu tiếng
 * Việt, thiếu một nửa) làm `fetch` ném lỗi ngay ở tầng header — đọc lỗi đó thì
 * tưởng mất mạng, mất cả buổi mò. Thà nói thẳng là khoá sai.
 *
 * @returns {'missing'|'invalid'|'ok'}
 */
export function keyState() {
  const key = config.anthropicApiKey;
  if (!key) return 'missing';
  // Khoá API chỉ gồm ký tự ASCII in được và dài hơn nhiều so với một chỗ điền mẫu.
  if (key.length < 20 || !/^[\x21-\x7e]+$/.test(key)) return 'invalid';
  return 'ok';
}

export const isConfigured = () => keyState() === 'ok';

const SYSTEM = [
  'Bạn đọc ảnh hoá đơn mua hàng ở Việt Nam và ghi lại thông tin chính.',
  'Số tiền cần lấy là TỔNG TIỀN PHẢI TRẢ cuối cùng (sau giảm giá, đã gồm thuế nếu có), tính bằng đồng Việt Nam.',
  'Hoá đơn Việt Nam hay ghi tắt: "35k" là 35.000, "1tr2" là 1.200.000. Hãy quy về số nguyên đồng.',
  'Nếu ảnh mờ, thiếu góc, hoặc không phải hoá đơn thì để số tiền bằng 0 và độ tin cậy "thap" — đừng đoán bừa.',
].join(' ');

/**
 * @param {string} dataUrl ảnh hoá đơn dạng data URL (đã được kiểm ở services/receipts.js)
 * @param {{code: string, name: string}[]} categories nhóm chi tiêu hiện có, để model chọn đúng một nhóm
 */
export async function readReceipt(dataUrl, categories, { callId } = {}) {
  const key = config.anthropicApiKey;
  if (!key) return null;

  const [, mediaType, base64] = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl) || [];
  if (!base64) throw new Error('Ảnh không hợp lệ');

  const codes = categories.map((c) => c.code);
  const tool = {
    name: 'ghi_hoa_don',
    description: 'Ghi lại thông tin đọc được từ ảnh hoá đơn.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        total_amount: { type: 'integer', description: 'Tổng tiền phải trả, số nguyên, đơn vị đồng. Không đọc được thì 0.' },
        merchant: { type: 'string', description: 'Tên cửa hàng hoặc mô tả ngắn khoản chi. Không rõ thì để chuỗi rỗng.' },
        spent_on: { type: 'string', description: 'Ngày trên hoá đơn dạng YYYY-MM-DD. Không thấy thì để chuỗi rỗng.' },
        category_code: { type: 'string', enum: codes, description: 'Nhóm chi tiêu hợp nhất với hàng hoá trên hoá đơn.' },
        confidence: { type: 'string', enum: ['cao', 'trung binh', 'thap'], description: 'Mức tin cậy của số tiền đọc được.' },
      },
      required: ['total_amount', 'merchant', 'spent_on', 'category_code', 'confidence'],
      additionalProperties: false,
    },
  };

  const body = {
    model: config.anthropicModel,
    max_tokens: 1024,
    // Bắt buộc gọi công cụ: cần dữ liệu có cấu trúc, không cần model kể lể.
    tool_choice: { type: 'tool', name: 'ghi_hoa_don' },
    tools: [tool],
    output_config: { effort: EFFORT },
    // Model từ chối vì lý do an toàn thì máy chủ tự chạy lại trên model dự phòng,
    // để một tấm hoá đơn khó không làm hỏng luồng của người dùng.
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        {
          type: 'text',
          text: `Đọc hoá đơn này. Các nhóm chi tiêu có thể chọn: ${categories.map((c) => `${c.code} (${c.name})`).join(', ')}.`,
        },
      ],
    }],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(endpoint(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Ghi lý do thật ra log máy chủ (tên lỗi, mã mạng) để còn gỡ được; tuyệt đối
    // không kèm khoá hay nội dung ảnh.
    console.error('[receiptAI] gọi thất bại:', err.name, err.cause?.code || '', err.message);
    throw new Error(err.name === 'AbortError' ? 'Đọc hoá đơn lâu quá, thử lại nhé' : 'Không gọi được dịch vụ đọc hoá đơn');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Không đưa nguyên văn lỗi của nhà cung cấp ra cho người học: nó có thể lộ
    // chi tiết cấu hình. Ghi log ở máy chủ, trả câu ngắn gọn ra ngoài.
    const detail = await response.text().catch(() => '');
    console.error('[receiptAI]', response.status, detail.slice(0, 300));
    throw new Error(response.status === 429
      ? 'Dịch vụ đọc hoá đơn đang bận, thử lại sau một lát'
      : 'Không đọc được hoá đơn lúc này');
  }

  const payload = await response.json();
  recordAiUsage(callId, payload);
  const call = (payload.content || []).find((block) => block.type === 'tool_use');
  if (!call) throw new Error('Không đọc được thông tin trên hoá đơn');

  const input = call.input || {};
  const category = categories.find((c) => c.code === input.category_code) || null;
  return {
    amount: Number.isFinite(input.total_amount) && input.total_amount > 0 ? Math.round(input.total_amount) : 0,
    note: String(input.merchant || '').slice(0, 120) || null,
    spentOn: /^\d{4}-\d{2}-\d{2}$/.test(input.spent_on || '') ? input.spent_on : null,
    categoryCode: category?.code || null,
    confidence: ['cao', 'trung binh', 'thap'].includes(input.confidence) ? input.confidence : 'thap',
  };
}
