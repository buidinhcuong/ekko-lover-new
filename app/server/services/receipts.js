/**
 * Ảnh hoá đơn đính kèm khoản chi.
 *
 * Ảnh **không nằm trong `public/`** mà ở `data/receipts/<user>/…`: đây là giấy tờ
 * chi tiêu của từng người, ai có đường dẫn cũng xem được thì hỏng. Muốn đọc phải
 * đi qua route có kiểm chủ sở hữu.
 *
 * Ảnh đi lên dưới dạng data URL trong JSON, không phải multipart — client đã thu
 * nhỏ ảnh trước khi gửi, nên không cần bộ phân tích multipart chỉ để nhận một tệp.
 * Đổi lại, ở đây phải tự kiểm: đúng loại ảnh, đúng chữ ký đầu tệp, và không quá to.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from '../db.js';
import { bad } from '../lib/http.js';

const RECEIPT_DIR = join(DATA_DIR, 'receipts');

/** Trần 1.5 MB sau khi giải mã — vừa đủ cho ảnh hoá đơn đã thu nhỏ. */
const MAX_BYTES = 1.5 * 1024 * 1024;

/** Chữ ký đầu tệp, để không tin vào phần khai báo loại ảnh của client. */
const SIGNATURES = [
  { type: 'image/jpeg', ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: '.png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', ext: '.webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Ghi ảnh xuống đĩa, trả về đường dẫn tương đối để lưu vào cột `receipt_path`.
 * @returns {string|null} null khi không có ảnh nào được gửi lên.
 */
/**
 * Kiểm một ảnh gửi lên: đúng loại, đúng chữ ký đầu tệp, không quá to. Tách riêng
 * vì đường đọc hoá đơn bằng AI cũng phải kiểm y hệt trước khi gửi ảnh đi đâu đó,
 * dù nó không ghi tệp xuống đĩa.
 * @returns {{buffer: Buffer, ext: string, type: string}}
 */
export function checkReceipt(dataUrl) {
  const match = DATA_URL.exec(String(dataUrl || '').trim());
  if (!match) throw bad('Ảnh hoá đơn phải là JPEG, PNG hoặc WebP.');

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw bad('Ảnh hoá đơn rỗng.');
  if (buffer.length > MAX_BYTES) throw bad('Ảnh hoá đơn quá lớn, thử chụp lại nhỏ hơn.');

  const signature = SIGNATURES.find((s) => s.test(buffer));
  if (!signature) throw bad('Tệp gửi lên không phải ảnh.');
  return { buffer, ...signature };
}

export async function saveReceipt(userId, expenseId, dataUrl) {
  if (!dataUrl) return null;
  const { buffer, ext } = checkReceipt(dataUrl);

  const dir = join(RECEIPT_DIR, String(userId));
  mkdirSync(dir, { recursive: true });
  const name = `${expenseId}-${randomBytes(6).toString('hex')}${ext}`;
  await writeFile(join(dir, name), buffer);
  return `${userId}/${name}`;
}

/** Đường dẫn thật của ảnh, kèm loại nội dung. Trả null nếu đường dẫn không hợp lệ. */
export function receiptFile(relative) {
  if (!relative || !/^\d+\/[\w-]+\.(jpg|png|webp)$/.test(relative)) return null;
  const full = join(RECEIPT_DIR, relative);
  if (!existsSync(full)) return null;
  const ext = `.${relative.split('.').pop()}`;
  return { full, type: SIGNATURES.find((s) => s.ext === ext)?.type || 'application/octet-stream' };
}

/** Xoá ảnh khi khoản chi bị xoá — không để lại giấy tờ của một khoản không còn nữa. */
export function removeReceipt(relative) {
  const file = receiptFile(relative);
  if (file) rmSync(file.full, { force: true });
}
