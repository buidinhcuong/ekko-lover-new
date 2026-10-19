/**
 * Bật / tắt chức năng trên toàn hệ thống (Admin → Chức năng, chỉ quản trị Ekko).
 *
 * Tắt một chức năng thì:
 *  - app người dùng ẩn hẳn chức năng đó (nút ở màn chủ, mục trên màn chủ, tab,
 *    thanh "Góp ý tới công ty"…) — đọc từ `world.modules`;
 *  - server chặn mọi API của nó (403 "Chức năng này đang tạm tắt"), kể cả khi
 *    ai đó mở thẳng đường dẫn.
 * Dữ liệu cũ của người dùng giữ nguyên — bật lại là thấy lại như trước.
 *
 * Lưu một danh sách mã đang TẮT (setting `modules_off`); không có trong danh
 * sách = đang bật, nên chức năng mới thêm sau này mặc định bật.
 */
import { getSetting, setSetting } from '../db.js';

export const MODULES = [
  { code: 'learning', name: 'Học tập', description: 'Bài học, mô đun, bài kiểm tra.', api: ['/api/learn'] },
  { code: 'goals', name: 'Mục tiêu', description: 'Mục tiêu tài chính và nhiệm vụ.', api: ['/api/goals', '/api/plans'] },
  { code: 'budget', name: 'Ngân sách', description: 'Lập và theo dõi ngân sách tháng.', api: ['/api/budget'] },
  { code: 'expenses', name: 'Ghi chép chi tiêu', description: 'Ghi khoản chi, ghi nhanh, đọc hoá đơn, báo cáo chi tiêu.', api: ['/api/expenses'] },
  { code: 'savings', name: 'Tiết kiệm', description: 'Quỹ tiết kiệm Ekko, kênh tiết kiệm, lãi suất ngân hàng.', api: ['/api/savings'] },
  { code: 'feed', name: 'EkkoFeed', description: 'Góp ý / chia sẻ tới công ty. HR vẫn xem được dữ liệu cũ.', api: ['/api/feed'] },
  { code: 'bot', name: 'Trợ lý Ekko (chatbot)', description: 'Hỏi đáp tài chính, pháp luật lao động, ghi chi tiêu bằng chat.', api: ['/api/bot'] },
  { code: 'team', name: 'Heo Dream Team', description: 'Nhóm bạn cùng giữ chuỗi ngày, lời mời, lời nhắc.', api: ['/api/team'] },
  { code: 'news', name: 'Tin tức', description: 'Tin tức, mẹo tài chính trên màn chủ.', api: ['/api/news'] },
];
const CODES = new Set(MODULES.map((m) => m.code));

function offList() {
  try { return new Set(JSON.parse(getSetting('modules_off', '[]')).filter((c) => CODES.has(c))); } catch { return new Set(); }
}

/** { learning: true, feed: false, … } — gửi cho app trong world. */
export function moduleFlags() {
  const off = offList();
  return Object.fromEntries(MODULES.map((m) => [m.code, !off.has(m.code)]));
}

export const moduleOn = (code) => !offList().has(code);

/** Danh sách cho trang Admin. */
export function moduleList() {
  const off = offList();
  return MODULES.map(({ api, ...m }) => ({ ...m, enabled: !off.has(m.code) }));
}

export function setModule(code, enabled) {
  if (!CODES.has(code)) return { error: 'Không có chức năng này', status: 404 };
  const off = offList();
  if (enabled) off.delete(code); else off.add(code);
  setSetting('modules_off', JSON.stringify([...off]));
  return { ok: true, modules: moduleList() };
}

/** Mã chức năng (đang tắt) mà một đường dẫn API của người dùng thuộc về, nếu có. */
export function blockedModule(pathname) {
  const off = offList();
  if (!off.size) return null;
  const hit = MODULES.find((m) => off.has(m.code) && m.api.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`)));
  return hit ? hit.code : null;
}
