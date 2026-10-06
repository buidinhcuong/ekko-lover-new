/**
 * Đọc số tiền gõ tắt kiểu người Việt: "12tr", "29tr900", "1tr2", "35k5",
 * "1ty2", "2,5tr", "1tr200k", "12.000.000". Dùng chung cho ô Số tiền trong app
 * và cho câu gõ ở thanh ghi nhanh / Ekko bot (server import thẳng tệp này), để
 * một cách gõ luôn ra đúng một con số ở mọi nơi.
 *
 * Luật phần đuôi sau đơn vị: các chữ số đứng ngay sau đơn vị là phần lẻ của
 * đơn vị đó, đọc như người nói — "29tr900" là 29 triệu 900 nghìn, "1tr2" là
 * 1 triệu 2 (trăm nghìn), "2tr05" là 2 triệu 50 nghìn, "35k5" là 35 nghìn 5
 * (trăm đồng). Tức là đệm phải cho đủ 3 chữ số rồi nhân với 1/1000 đơn vị.
 */

const UNIT = {
  ty: 1_000_000_000, ti: 1_000_000_000,
  trieu: 1_000_000, tr: 1_000_000, cu: 1_000_000,
  nghin: 1_000, ngan: 1_000, k: 1_000,
};
// Đơn vị dài đứng trước đơn vị ngắn cùng gốc ("trieu" trước "tr").
const UNIT_RE = 'ty|ti|trieu|tr|cu|nghin|ngan|k';

/** Chữ thường, bỏ dấu, bỏ khoảng trắng: "29 Triệu 900" → "29trieu900". */
const flatten = (text) => String(text ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/\s+/g, '');

/** "2,5" / "1.5" là số thập phân; "1.500" / "12.000.000" là phân cách hàng nghìn. */
function number(raw) {
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) return Number(raw.replace(/[.,]/g, ''));
  return Number(raw.replace(',', '.'));
}

/**
 * Cả chuỗi phải là một số tiền (không lẫn chữ khác), ví dụ giá trị một ô nhập.
 * @returns {number|null} số đồng, làm tròn; null nếu không đọc được
 */
export function parseMoney(text) {
  let s = flatten(text).replace(/(vnd|dong|d)$/, '');
  if (!s) return null;

  // Không có đơn vị: một con số thường, có thể có dấu phân cách.
  if (/^\d[\d.,]*$/.test(s)) {
    const n = /^\d{1,3}([.,]\d{3})+$/.test(s) || /^\d+$/.test(s) ? Number(s.replace(/[.,]/g, '')) : number(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  const segment = new RegExp(`^(\\d+(?:[.,]\\d+)?)(${UNIT_RE})`);
  let total = 0;
  let lastUnit = null;
  let m;
  while ((m = segment.exec(s))) {
    total += number(m[1]) * UNIT[m[2]];
    lastUnit = UNIT[m[2]];
    s = s.slice(m[0].length);
  }
  if (!lastUnit) return null;
  if (s) {
    // Phần đuôi "29tr|900": tối đa 3 chữ số, là phần lẻ của đơn vị cuối.
    if (!/^\d{1,3}$/.test(s) || lastUnit < 1_000) return null;
    total += Number(s.padEnd(3, '0')) * (lastUnit / 1_000);
  }
  return total > 0 ? Math.round(total) : null;
}

/**
 * Tìm số tiền gõ tắt nằm trong một câu ("ăn trưa 1tr2 với sếp").
 * @returns {{ amount:number, matched:string }|null} `matched` ở dạng đã bỏ dấu
 */
export function findMoney(sentence) {
  const source = String(sentence ?? '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const re = new RegExp(
    `\\d[\\d.,]*\\s*(?:${UNIT_RE})(?:\\s*\\d[\\d.,]*\\s*(?:${UNIT_RE}))*(?:\\d{1,3})?(?![a-z0-9])`,
  );
  const m = re.exec(source);
  if (!m) return null;
  const amount = parseMoney(m[0]);
  return amount ? { amount, matched: m[0] } : null;
}

/** Chuỗi có đơn vị viết tắt (cần đọc lại), khác với một con số đang gõ dở. */
export const looksShorthand = (text) => new RegExp(`\\d\\s*(${UNIT_RE})`).test(flatten(text));
