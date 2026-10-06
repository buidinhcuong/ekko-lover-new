/**
 * Concept giao diện của màn Khám phá.
 *
 * Mỗi concept là một cách kể chuyện khác nhau cho cùng một lộ trình học: cùng
 * thứ tự bài, cùng luật mở khoá, cùng tiến độ — chỉ đổi hình hài. Vì vậy concept
 * là **một lựa chọn duy nhất cho cả sản phẩm**, không phải tuỳ chọn của từng
 * người học: hai người cùng công ty mở app phải thấy cùng một thế giới.
 *
 * Bản thân cách vẽ nằm ở code (`public/app/views/explore-*.js`), nên danh sách ở
 * đây chỉ mô tả và đánh dấu cái nào đang bật.
 */
import { getSetting, setSetting } from '../db.js';

const SETTING_KEY = 'explore_concept';

export const CONCEPTS = [
  {
    code: 'lover',
    order_index: 1,
    name: 'Ekko Lover',
    name_en: 'Ekko Lover',
    tagline: 'Hồ sơ cá nhân + quản lý tài chính toàn diện',
    tagline_en: 'Personal profile + comprehensive financial management',
    description: 'Giao diện tập trung vào hồ sơ người dùng với heo mascot, bao quanh bởi vòng tiến độ. Bên cạnh là các nút chức năng (Học tập, Kế hoạch, Ngân sách, Ghi chép) có thể thu gọn thành icon. Phần dưới hiển thị ngân sách chi tiêu, tin tức, biểu đồ chi tiêu hàng tuần, và chatbot với mascot octopus.',
    description_en: 'An interface centered on user profile with a heo mascot surrounded by a progress ring. Beside it are function buttons (Study, Plan, Budget, Notes) that can collapse to icons. Below shows budget spending, news carousel, weekly expense chart, and chatbot with octopus mascot.',
    highlights: ['Heo mascot với vòng tiến độ xung quanh', 'Các nút chức năng có thể thu gọn', 'Quản lý ngân sách với thanh tiến độ', 'Carousel tin tức có thể vuốt', 'Biểu đồ chi tiêu hàng tuần', 'Chatbot với mascot octopus'],
    highlights_en: ['Heo mascot with progress ring around it', 'Collapsible function buttons', 'Budget management with progress bars', 'Swipeable news carousel', 'Weekly expense chart', 'Chatbot with octopus mascot'],
  },
  // Bản sao của Ekko Lover để thử phối màu: cùng giao diện (base: 'lover'),
  // khác biệt riêng viết bằng CSS theo html[data-concept="lover-colors"].
  {
    code: 'lover-colors',
    base: 'lover',
    order_index: 2,
    name: 'Ekko Lover Colors',
    name_en: 'Ekko Lover Colors',
    tagline: 'Hồ sơ cá nhân + quản lý tài chính toàn diện',
    tagline_en: 'Personal profile + comprehensive financial management',
    description: 'Giao diện tập trung vào hồ sơ người dùng với heo mascot, bao quanh bởi vòng tiến độ. Bên cạnh là các nút chức năng (Học tập, Kế hoạch, Ngân sách, Ghi chép) có thể thu gọn thành icon. Phần dưới hiển thị ngân sách chi tiêu, tin tức, biểu đồ chi tiêu hàng tuần, và chatbot với mascot octopus.',
    description_en: 'An interface centered on user profile with a heo mascot surrounded by a progress ring. Beside it are function buttons (Study, Plan, Budget, Notes) that can collapse to icons. Below shows budget spending, news carousel, weekly expense chart, and chatbot with octopus mascot.',
    highlights: ['Heo mascot với vòng tiến độ xung quanh', 'Các nút chức năng có thể thu gọn', 'Quản lý ngân sách với thanh tiến độ', 'Carousel tin tức có thể vuốt', 'Biểu đồ chi tiêu hàng tuần', 'Chatbot với mascot octopus'],
    highlights_en: ['Heo mascot with progress ring around it', 'Collapsible function buttons', 'Budget management with progress bars', 'Swipeable news carousel', 'Weekly expense chart', 'Chatbot with octopus mascot'],
  },
  // Bản sao của Ekko Lover cho người dùng khoảng 40–50 tuổi (base: 'lover'):
  // chữ to hơn một bậc, nút lớn, màn chủ rút gọn, ghi chép bằng giọng nói.
  {
    code: 'simple',
    base: 'lover',
    order_index: 3,
    name: 'Simple mode',
    name_en: 'Simple mode',
    tagline: 'Chữ to, ít bước, nói để ghi chép',
    tagline_en: 'Bigger text, fewer steps, speak to log',
    description: 'Dành cho người dùng khoảng 40–50 tuổi. Cùng lộ trình học và dữ liệu với Ekko Lover, nhưng mọi cỡ chữ lớn hơn một bậc, nút bấm to, màn chính chỉ giữ những gì cần mỗi ngày: chi tiêu hôm nay, ngân sách tháng và năm chức năng xếp thành danh sách có chú thích. Ghi chép chi tiêu bằng giọng nói: bấm micro, nói "cà phê ba mươi lăm nghìn", xác nhận là xong.',
    description_en: 'For users around 40–50. Same lessons and data as Ekko Lover, but every text size is one step larger, buttons are big, and the main screen keeps only the daily essentials: today’s spending, this month’s budget and the five tools as a labelled list. Log expenses by voice: tap the mic, say "coffee 35 thousand", confirm, done.',
    highlights: ['Chữ lớn hơn một bậc trên toàn app', 'Nút bấm lớn, dễ chạm', 'Màn chính rút gọn, chức năng có chú thích', 'Ghi chép chi tiêu bằng giọng nói', 'Xác nhận lại trước khi lưu'],
    highlights_en: ['Every text one size larger', 'Big, easy-to-tap buttons', 'Simplified main screen with labelled tools', 'Log expenses by voice', 'Confirm before saving'],
  },
];

// Concept khi Admin chưa chọn gì. Bản demo trên Vercel đặt EKKO_DEFAULT_CONCEPT
// (ví dụ `lover`) vì database ở đó luôn là bản mới, chưa từng được chọn.
export const DEFAULT_CONCEPT = CONCEPTS.some((c) => c.code === process.env.EKKO_DEFAULT_CONCEPT)
  ? process.env.EKKO_DEFAULT_CONCEPT
  : CONCEPTS[0].code;

export const conceptByCode = (code) => CONCEPTS.find((c) => c.code === code) || null;

/**
 * Mã cũ có thể còn nằm trong settings. Ba concept đầu (Đảo trên trời, Quần đảo
 * so le, Lối học nút tròn) đã bị xoá hẳn: ai đang bật chúng thì chuyển sang
 * Ekko Lover, thay vì lùi về một màn không còn tồn tại.
 */
const LEGACY = { hex: 'lover', sky: 'lover', islands: 'lover', path: 'lover' };

/** Concept đang bật. Giá trị lạ trong settings sẽ lùi về mặc định. */
export function activeConcept() {
  const stored = getSetting(SETTING_KEY, DEFAULT_CONCEPT);
  const code = LEGACY[stored] || stored;
  return conceptByCode(code) ? code : DEFAULT_CONCEPT;
}

/** @returns {string} mã concept sau khi đổi. */
export function setActiveConcept(code) {
  if (!conceptByCode(code)) return activeConcept();
  setSetting(SETTING_KEY, code);
  return code;
}

/** Danh sách kèm cờ `active`, dùng cho Admin portal. */
export const conceptBoard = () => {
  const active = activeConcept();
  return CONCEPTS.map((concept) => ({ ...concept, active: concept.code === active }));
};
