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
 * Hai tầng: mặc định cả hệ thống (setting `modules_off`: danh sách mã đang TẮT —
 * chức năng mới thêm sau này mặc định bật) và ghi đè riêng từng công ty (setting
 * `modules_company:<công ty>`: { mã: true | false }). Riêng công ty thắng mặc định.
 */
import { getSetting, setSetting } from '../db.js';
import { NO_EMPLOYER } from './companyScope.js';

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

const isCompany = (key) => Boolean(key) && key !== NO_EMPLOYER;

function offList() {
  try { return new Set(JSON.parse(getSetting('modules_off', '[]')).filter((c) => CODES.has(c))); } catch { return new Set(); }
}
/** Ghi đè riêng của một công ty: { feed: false, savings: true } — mã không có = theo mặc định hệ thống. */
function companyOverrides(employerKey) {
  if (!isCompany(employerKey)) return {};
  try {
    const raw = JSON.parse(getSetting(`modules_company:${employerKey}`, '{}'));
    return Object.fromEntries(Object.entries(raw).filter(([c, v]) => CODES.has(c) && typeof v === 'boolean'));
  } catch { return {}; }
}

/** Công ty của một người dùng — cùng quy tắc với COMPANY_KEY (mã công ty, rồi tên công ty). */
export function companyKeyOf(user) {
  return String(user?.employer_id || '').trim() || String(user?.employer || '').trim() || null;
}

/** { learning: true, feed: false, … } cho một công ty (riêng công ty thắng mặc định). */
export function moduleFlags(employerKey = null) {
  const off = offList();
  const own = companyOverrides(employerKey);
  return Object.fromEntries(MODULES.map((m) => [m.code, own[m.code] ?? !off.has(m.code)]));
}

export const moduleOn = (code, employerKey = null) => moduleFlags(employerKey)[code] !== false;

/**
 * Danh sách cho trang Admin. Có `employer`: kèm trạng thái mặc định hệ thống và
 * ghi đè của công ty đó (true / false / null = theo mặc định).
 */
export function moduleList(employerKey = null) {
  const off = offList();
  const own = companyOverrides(employerKey);
  return MODULES.map(({ api, ...m }) => ({
    ...m,
    system: !off.has(m.code),
    override: isCompany(employerKey) ? (own[m.code] ?? null) : null,
    enabled: own[m.code] ?? !off.has(m.code),
  }));
}

/**
 * Bật / tắt. Không có `employer`: đổi mặc định cả hệ thống. Có `employer`: đặt
 * riêng cho công ty đó; `enabled = null` = bỏ ghi đè, quay về theo mặc định.
 */
export function setModule(code, enabled, employerKey = null) {
  if (!CODES.has(code)) return { error: 'Không có chức năng này', status: 404 };
  if (isCompany(employerKey)) {
    const own = companyOverrides(employerKey);
    if (enabled === null || enabled === undefined) delete own[code]; else own[code] = Boolean(enabled);
    setSetting(`modules_company:${employerKey}`, JSON.stringify(own));
    return { ok: true, modules: moduleList(employerKey) };
  }
  const off = offList();
  if (enabled) off.delete(code); else off.add(code);
  setSetting('modules_off', JSON.stringify([...off]));
  return { ok: true, modules: moduleList() };
}

/** Mã chức năng đang tắt (với công ty của người dùng) mà một đường dẫn API thuộc về, nếu có. */
export function blockedModule(pathname, employerKey = null) {
  const flags = moduleFlags(employerKey);
  const hit = MODULES.find((m) => flags[m.code] === false && m.api.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
  return hit ? hit.code : null;
}
