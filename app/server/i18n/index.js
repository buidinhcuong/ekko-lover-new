/**
 * Dịch nội dung trả về cho app người dùng.
 *
 * Nội dung thật (mô đun, bài học, khung bài, câu trắc nghiệm, nhóm chi tiêu, huy
 * hiệu, cấp độ…) nằm trong cơ sở dữ liệu và do Admin portal biên tập bằng tiếng
 * Việt. Thay vì thêm cột `*_en` cho từng bảng — mỗi bảng một chỗ phải sửa, và
 * Admin lại phải nhập hai lần — bản dịch để trong một bảng đối chiếu tra theo
 * **chính câu tiếng Việt**, và được áp vào **một chỗ duy nhất**: lúc gói JSON
 * trả về (xem `server/index.js`).
 *
 * Ba hệ quả cần biết:
 *
 * 1. Câu nào chưa có trong bảng thì giữ nguyên tiếng Việt — thiếu bản dịch làm
 *    lẫn ngôn ngữ, không làm hỏng màn hình.
 * 2. Admin sửa một câu tiếng Việt thì bản dịch của câu đó rơi ra ngoài bảng.
 *    Đúng như vậy: nội dung mới thì phải dịch lại, không nên hiển thị bản dịch
 *    của một câu đã khác đi.
 * 3. Chỉ khớp **trọn chuỗi**, không khớp một phần. Nên một câu người dùng tự gõ
 *    (tên mục tiêu, ghi chú khoản chi) chỉ bị đổi khi nó trùng khít một câu mẫu
 *    — và khi đó thì đổi lại là đúng, vì nó chính là câu mẫu do Ekko điền sẵn.
 */
import { EN } from './en.js';

const DICTS = { en: EN };

/** Ngôn ngữ app người dùng yêu cầu. Admin portal không gửi header này. */
export function langOf(req) {
  const asked = String(req.headers['x-lang'] || '').toLowerCase();
  return DICTS[asked] ? asked : 'vi';
}

/**
 * Dịch một chuỗi lẻ. Dùng cho những chỗ phải **ghép câu** ở server (cảnh báo chi
 * tiêu, câu xác nhận của Ekko bot): tên nhóm chi tiêu cần bản dịch, còn phần
 * khung câu thì mỗi ngôn ngữ một mẫu riêng ngay tại chỗ ghép.
 */
export const tr = (text, lang) => DICTS[lang]?.[text] ?? text;

/**
 * Đi hết cây JSON, đổi mọi chuỗi có trong bảng đối chiếu. Trả về cây mới, không
 * sửa cây gốc — dữ liệu gốc còn dùng cho lần gọi sau (và cho người dùng khác).
 */
export function translate(value, lang) {
  const dict = DICTS[lang];
  if (!dict) return value;
  return walk(value, dict);
}

function walk(value, dict) {
  if (typeof value === 'string') return dict[value] ?? value;
  if (Array.isArray(value)) return value.map((item) => walk(item, dict));
  // `[object Object]` chứ không phải `constructor === Object`: hàng đọc từ
  // node:sqlite là object **không có prototype**, kiểm theo constructor sẽ trượt
  // hết và chẳng câu nào được dịch.
  if (Object.prototype.toString.call(value) === '[object Object]') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = walk(item, dict);
    return out;
  }
  // Số, boolean, null, và mọi thứ không phải object thuần: trả lại như cũ.
  return value;
}
