/**
 * Đo độ chính xác của ghi nhanh bằng AI trên một bộ câu mẫu khó: số tiền, số
 * khoản, nhóm chi tiêu, ngày. Gọi API thật (tốn một ít tiền mỗi lần chạy) và
 * dùng nhóm chi tiêu đang có trong database của máy này (app/data).
 *
 *   node tools/eval-quicklog.mjs            # chạy cả bộ
 *   node tools/eval-quicklog.mjs --verbose  # in từng câu sai
 *
 * Cần ANTHROPIC_API_KEY trong app/.env. Admin đổi nhóm / từ khoá thì chạy lại
 * để xem độ chính xác còn giữ không. Thêm câu thật người dùng hay gõ sai vào
 * CASES để bộ đo sát thực tế hơn.
 */
import { keyState } from '../server/services/receiptAI.js';
import { readExpenses } from '../server/services/expenseReader.js';

const TODAY = '2026-10-07'; // thứ tư — để kiểm "hôm qua", "thứ hai"

/** [câu, các khoản mong đợi: [số tiền, mã nhóm, ngày (bỏ trống = hôm nay)]] */
const CASES = [
  ['cà phê 35k', [[35000, 'wants_entertainment']]],
  ['ăn trưa 60 nghìn', [[60000, 'wants_dining']]],
  ['đi chợ mua rau thịt 150k', [[150000, 'needs_food']]],
  ['đổ xăng năm chục', [[50000, 'needs_transport']]],
  ['grab đi làm 42k', [[42000, 'needs_transport']]],
  ['tiền điện tháng này 650 nghìn', [[650000, 'needs_bills']]],
  ['đóng tiền nhà 3tr5', [[3500000, 'needs_housing']]],
  ['mua thuốc cảm 85k', [[85000, 'needs_health']]],
  ['học phí tiếng anh cho con 1tr2', [[1200000, 'needs_education']]],
  ['trả góp điện thoại 1 củ 2', [[1200000, 'needs_debt']]],
  ['trà sữa 2 ly 70k', [[70000, 'wants_entertainment']]],
  ['xem phim cgv 120k', [[120000, 'wants_entertainment']]],
  ['shopee mua áo 249k', [[249000, 'wants_shopping']]],
  ['mừng cưới bạn 500k', [[500000, 'wants_gift']]],
  ['cắt tóc 60k', [[60000, 'wants_beauty']]],
  ['sửa xe máy hỏng giữa đường 350k', [[350000, 'incident']]],
  ['phở 45k, cà phê 25k', [[45000, 'wants_dining'], [25000, 'wants_entertainment']]],
  ['sáng bánh mì 20k trưa cơm 35k', [[20000, 'wants_dining'], [35000, 'wants_dining']]],
  ['hôm qua đi siêu thị hết 1 xị', [[100000, 'needs_food', '2026-10-06']]],
  ['thứ hai nạp tiền điện thoại 100k', [[100000, 'needs_bills', '2026-10-05']]],
  ['gửi xe 5k', [[5000, 'needs_transport']]],
  ['mua bỉm sữa cho con 420k', [[420000, 'needs_food']]],
  ['tập gym tháng 300k', [[300000, 'wants_hobby']]],
  ['ăn lẩu với bạn 280k', [[280000, 'wants_dining']]],
  // BUG-007: đồ mặc vào Mua sắm (có tên hãng xe trong câu cũng không được hiểu là xe).
  ['Áo phao lông vũ Benz 415k', [[415000, 'wants_shopping']]],
  ['mua đôi giày 650k', [[650000, 'wants_shopping']]],
];

if (keyState() !== 'ok') {
  console.error('Chưa có ANTHROPIC_API_KEY hợp lệ trong app/.env — không đo được.');
  process.exit(1);
}

const verbose = process.argv.includes('--verbose');
let amountOk = 0;
let countOk = 0;
let categoryOk = 0;
let dateOk = 0;
let itemsTotal = 0;
let viaAi = 0;

for (const [text, expected] of CASES) {
  const { items, source } = await readExpenses(text, { today: TODAY });
  if (source === 'ai') viaAi += 1;
  const sameCount = items.length === expected.length;
  if (sameCount) countOk += 1;
  const problems = [];
  expected.forEach(([amount, code, day = TODAY], i) => {
    itemsTotal += 1;
    const got = items[i];
    if (got?.amount === amount) amountOk += 1; else problems.push(`số tiền ${got?.amount} ≠ ${amount}`);
    if (got?.category?.code === code) categoryOk += 1; else problems.push(`nhóm ${got?.category?.code} ≠ ${code}`);
    if (got?.spentOn === day) dateOk += 1; else problems.push(`ngày ${got?.spentOn} ≠ ${day}`);
  });
  if (!sameCount) problems.unshift(`${items.length} khoản ≠ ${expected.length}`);
  if (problems.length && verbose) console.log(`✗ "${text}" (${source}): ${problems.join('; ')}`);
}

const pct = (n, d) => `${Math.round((n / d) * 100)}% (${n}/${d})`;
console.log(`Câu đọc bằng AI:   ${pct(viaAi, CASES.length)}`);
console.log(`Đúng số khoản:     ${pct(countOk, CASES.length)}`);
console.log(`Đúng số tiền:      ${pct(amountOk, itemsTotal)}`);
console.log(`Đúng nhóm chi tiêu: ${pct(categoryOk, itemsTotal)}`);
console.log(`Đúng ngày:         ${pct(dateOk, itemsTotal)}`);
