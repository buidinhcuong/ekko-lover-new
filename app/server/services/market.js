/**
 * Widget thị trường ở màn Tiết kiệm: giá vàng (API ngoài thật) + lãi suất
 * ngân hàng (dữ liệu tham khảo, Admin cập nhật — không có API công khai miễn
 * phí nào cho lãi suất ngân hàng VN).
 */
import { all } from '../db.js';

const GOLD_API_URL = 'https://www.vang.today/api/prices';
// API nguồn tự nhận "cập nhật mỗi 5 phút" — cache đúng bằng chu kỳ đó, vừa đỡ
// gọi dư vừa không hiện số cũ quá lâu.
const GOLD_CACHE_TTL_MS = 5 * 60 * 1000;

// Chỉ chọn vài loại quen thuộc để widget gọn — API nguồn trả cả chục loại
// vàng nữ trang mà người dùng phổ thông không phân biệt được.
const GOLD_TYPES = [
  { code: 'SJL1L10', name: 'Vàng SJC' },
  { code: 'DOJINHTV', name: 'Vàng DOJI' },
  { code: 'XAUUSD', name: 'Vàng thế giới' },
];

let goldCache = null; // { at, payload }

export async function goldPrices() {
  const now = Date.now();
  if (goldCache && now - goldCache.at < GOLD_CACHE_TTL_MS) return goldCache.payload;

  try {
    const res = await fetch(GOLD_API_URL, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const items = GOLD_TYPES.map(({ code, name }) => {
      const p = data.prices?.[code];
      if (!p) return null;
      return {
        code, name,
        buy: p.buy, sell: p.sell,
        changeBuy: p.change_buy, changeSell: p.change_sell,
        currency: p.currency,
      };
    }).filter(Boolean);

    const payload = { ok: true, asOf: data.time && data.date ? `${data.time} ${data.date}` : null, items };
    goldCache = { at: now, payload };
    return payload;
  } catch {
    // Nguồn ngoài lỗi/timeout thì trả cache cũ (nếu có) thay vì vỡ cả widget —
    // giá vàng vài phút trước vẫn hữu ích hơn một màn báo lỗi trống trơn.
    if (goldCache) return { ...goldCache.payload, stale: true };
    return { ok: false, items: [], error: 'Không tải được giá vàng lúc này' };
  }
}

function parseBank(row) {
  return { ...row, rates: JSON.parse(row.rates || '{}') };
}

export function bankInterestRates() {
  const rows = all('SELECT * FROM bank_interest_rates ORDER BY order_index, id').map(parseBank);
  return {
    state: rows.filter((r) => r.group_code === 'state'),
    jointStock: rows.filter((r) => r.group_code === 'joint_stock'),
  };
}
