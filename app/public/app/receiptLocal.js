/**
 * Đọc ảnh hoá đơn — dùng chung cho popup Ghi một khoản chi và Ekko bot.
 *
 * `readReceipt` hỏi dịch vụ AI của máy chủ trước; không được (chưa có khoá,
 * hết hạn mức, mất mạng tới nhà cung cấp) thì tự đọc ngay trên máy.
 *
 * Nhận chữ bằng Tesseract.js (tải từ CDN lúc cần lần đầu, kèm dữ liệu tiếng
 * Việt), rồi tìm tổng tiền theo từ khoá quen thuộc trên hoá đơn Việt Nam. Ảnh
 * không rời khỏi máy người dùng ở bước này.
 *
 * `parseReceiptText` tách riêng, không đụng DOM, để kiểm thử được bằng Node.
 */
import { api } from '/shared/client.js';
import { parseMoney } from '/shared/money.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

const plain = (text) => String(text || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

// Dòng tổng, xếp theo độ chắc: "tổng thanh toán" chắc hơn "tổng cộng" chắc hơn
// "tổng". Dòng tiền khách đưa / tiền thối trả lại thì bỏ — số đó thường lớn hơn
// tổng mà không phải số đã chi.
const TOTAL_KEYS = [
  ['tong thanh toan', 'khach phai tra', 'can thanh toan', 'so tien thanh toan', 'thanh tien', 'grand total', 'amount due'],
  ['tong cong', 'tong tien', 'tong so tien', 'total', 'thanh toan', 'cong'],
  ['tong'],
];
const SKIP_KEYS = ['tien khach dua', 'khach dua', 'tien thoi', 'tien thua', 'tra lai', 'change', 'cash', 'giam gia', 'chiet khau', 'vat', 'thue'];

/** Mọi số tiền trên một dòng: "125.000", "125,000đ", "125000", "1tr2". */
function amountsIn(line) {
  const found = [];
  for (const m of String(line).matchAll(/\d{1,3}(?:[.,\s]\d{3})+(?![\d])|\d{4,9}(?![\d])|\d+(?:[.,]\d+)?\s*(?:k|tr|trieu|nghin)\b/gi)) {
    const n = parseMoney(m[0].replace(/\s/g, '.'));
    if (n && n >= 1000 && n < 1_000_000_000) found.push(n);
  }
  return found;
}

/**
 * @returns {{ amount: number, note: string|null, spentOn: string|null, text: string }}
 *   amount = 0 nếu không tìm ra tổng tiền
 */
export function parseReceiptText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const flat = lines.map(plain);

  let amount = 0;
  for (const keys of TOTAL_KEYS) {
    for (let i = 0; i < flat.length && !amount; i += 1) {
      const line = flat[i];
      if (!keys.some((k) => line.includes(k)) || SKIP_KEYS.some((k) => line.includes(k))) continue;
      // Số có thể nằm ngay dòng dưới khi hoá đơn in hai cột lệch nhau.
      const nums = amountsIn(lines[i]).length ? amountsIn(lines[i]) : amountsIn(lines[i + 1] || '');
      if (nums.length) amount = Math.max(...nums);
    }
    if (amount) break;
  }
  // Không có dòng tổng: lấy số lớn nhất trên hoá đơn, trừ dòng tiền khách đưa.
  if (!amount) {
    const all = lines.filter((_, i) => !SKIP_KEYS.some((k) => flat[i].includes(k))).flatMap(amountsIn);
    amount = all.length ? Math.max(...all) : 0;
  }

  const date = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(text || '');
  const spentOn = date
    ? `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`
    : null;

  // Tên cửa hàng: dòng đầu tiên có chữ, không phải ngày giờ / địa chỉ / số.
  const merchant = lines.find((l, i) => /[a-zA-ZÀ-ỹ]{3}/.test(l) && !/\d{2}[/:]\d{2}/.test(l)
    && !/^(dc|dia chi|sdt|dt|tel|mst|hoa don|phieu)/.test(flat[i]));

  return { amount, note: merchant ? merchant.slice(0, 120) : null, spentOn, text: lines.join('\n') };
}

let loading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  loading ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_URL;
    script.async = true;
    script.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('no Tesseract')));
    script.onerror = () => { loading = null; reject(new Error('Không tải được bộ đọc chữ')); };
    document.head.append(script);
  });
  return loading;
}

/** Nhận chữ trên ảnh (data URL) rồi tách số tiền / ngày / tên cửa hàng. */
export async function readReceiptOnDevice(dataUrl) {
  const Tesseract = await loadTesseract();
  const { data } = await Tesseract.recognize(dataUrl, 'vie+eng');
  return parseReceiptText(data?.text || '');
}

/**
 * Thu nhỏ ảnh ngay trên máy trước khi gửi: ảnh máy ảnh điện thoại thường 3–8 MB,
 * gửi thẳng thì vừa chậm vừa vượt trần body của server. 1280px là đủ đọc chữ trên
 * hoá đơn.
 */
export function shrinkImage(file, max = 1280, quality = 0.72, messages = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(messages.unreadable || 'Không đọc được tệp ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(messages.notImage || 'Tệp này không phải ảnh'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * AI của máy chủ trước, không được thì đọc trên máy.
 * @param {(stage: 'server'|'device') => void} [onStage] báo đang ở bước nào để hiện trạng thái
 * @returns {Promise<{ read: object|null, text: string }>} read.amount = 0/null nếu không ra số tiền
 */
export async function readReceipt(dataUrl, onStage) {
  onStage?.('server');
  let read = null;
  try {
    read = await api.post('/api/expenses/scan', { receipt: dataUrl });
  } catch { /* rơi xuống đọc trên máy */ }
  if (read?.amount) return { read, text: '' };

  onStage?.('device');
  try {
    const local = await readReceiptOnDevice(dataUrl);
    return { read: { ...local, confidence: 'trung binh' }, text: local.text };
  } catch {
    return { read: null, text: '' };
  }
}
