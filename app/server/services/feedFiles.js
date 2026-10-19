/**
 * Tệp đính kèm trong phản hồi EkkoFeed (HR gửi kèm PDF / JPG / PNG — thông báo,
 * quyết định, ảnh chụp…). Người lao động xem được trong app.
 *
 * Tệp KHÔNG nằm trong `public/` mà ở `data/feed-files/`: chỉ đọc qua route có
 * kiểm quyền — người lao động chỉ mở được tệp gắn vào phản hồi góp ý của chính
 * mình; HR chỉ mở được tệp của công ty mình.
 *
 * Tải lên từng tệp một dưới dạng data URL trong JSON (như ảnh hoá đơn,
 * services/receipts.js), rồi phản hồi gửi kèm danh sách id tệp. Loại tệp kiểm
 * bằng chữ ký đầu tệp, không tin phần khai báo của trình duyệt.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { all, DATA_DIR, get, run } from '../db.js';
import { nowIso } from '../lib/time.js';

const FILE_DIR = join(DATA_DIR, 'feed-files');
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_REPLY = 5;

const TYPES = [
  { type: 'application/pdf', ext: '.pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { type: 'image/jpeg', ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: '.png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
];
const DATA_URL = /^data:(application\/pdf|image\/jpeg|image\/png);base64,([A-Za-z0-9+/=]+)$/;
const fail = (message, status = 400) => ({ error: message, status });

/** Tên hiển thị gọn, bỏ ký tự lạ (đường dẫn thật trên đĩa không dùng tên này). */
const cleanName = (name, ext) => {
  const base = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 120);
  return base || `tep-dinh-kem${ext}`;
};

/** Lưu một tệp HR tải lên; chưa gắn vào phản hồi nào cho tới khi gửi. */
export async function saveFeedFile(uploaderId, employerKey, { name, dataUrl } = {}) {
  const match = DATA_URL.exec(String(dataUrl || '').trim());
  if (!match) return fail('Chỉ đính kèm được tệp PDF, JPG hoặc PNG');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return fail('Tệp rỗng');
  if (buffer.length > MAX_FILE_BYTES) return fail('Tệp quá lớn — tối đa 5 MB mỗi tệp');
  const kind = TYPES.find((t) => t.test(buffer));
  if (!kind) return fail('Nội dung tệp không phải PDF, JPG hoặc PNG');

  mkdirSync(FILE_DIR, { recursive: true });
  const stored = `${Date.now()}-${randomBytes(8).toString('hex')}${kind.ext}`;
  await writeFile(join(FILE_DIR, stored), buffer);
  const info = run(
    'INSERT INTO feed_files (employer_key, uploader_id, name, mime, size, path, created_at) VALUES (?,?,?,?,?,?,?)',
    employerKey || null, uploaderId, cleanName(name, kind.ext), kind.type, buffer.length, stored, nowIso(),
  );
  return { file: fileView(get('SELECT * FROM feed_files WHERE id = ?', Number(info.lastInsertRowid))) };
}

export const fileView = (f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, image: f.mime.startsWith('image/') });

/** Tệp gắn vào từng phản hồi: { replyId: [file…] }. */
export function filesOfReplies(replyIds) {
  if (!replyIds.length) return {};
  const rows = all(
    `SELECT rf.reply_id, f.* FROM feed_reply_files rf JOIN feed_files f ON f.id = rf.file_id
      WHERE rf.reply_id IN (${replyIds.map(() => '?').join(',')}) ORDER BY f.id`,
    ...replyIds,
  );
  const out = {};
  for (const r of rows) (out[r.reply_id] ||= []).push(fileView(r));
  return out;
}

/** Kiểm danh sách id tệp người gửi phản hồi được phép gắn (chính họ tải lên). */
export function checkFileIds(uploaderId, fileIds) {
  const ids = [...new Set([].concat(fileIds || []).map(Number).filter(Boolean))];
  if (ids.length > MAX_FILES_PER_REPLY) return fail(`Tối đa ${MAX_FILES_PER_REPLY} tệp mỗi phản hồi`);
  const own = ids.filter((id) => get('SELECT 1 ok FROM feed_files WHERE id = ? AND uploader_id = ?', id, uploaderId));
  if (own.length !== ids.length) return fail('Có tệp đính kèm không hợp lệ — tải lên lại giúp nhé');
  return { ids };
}

export function attachFiles(replyId, fileIds, employerKey = null) {
  for (const id of fileIds) {
    run('INSERT OR IGNORE INTO feed_reply_files (reply_id, file_id) VALUES (?, ?)', replyId, id);
    // Quản trị Ekko tải lên (chưa gắn công ty): gắn theo công ty của góp ý để HR mở được.
    if (employerKey) run('UPDATE feed_files SET employer_key = COALESCE(employer_key, ?) WHERE id = ?', employerKey, id);
  }
}

const fileOnDisk = (row) => {
  if (!row || !/^[\w-]+\.(pdf|jpg|png)$/.test(row.path)) return null;
  const full = join(FILE_DIR, row.path);
  return existsSync(full) ? { full, row } : null;
};

/** Người lao động: chỉ tệp gắn vào phản hồi góp ý của chính mình. */
export function workerFile(userId, fileId) {
  return fileOnDisk(get(
    `SELECT f.* FROM feed_files f JOIN feed_reply_files rf ON rf.file_id = f.id
       JOIN feed_replies r ON r.id = rf.reply_id JOIN feed_posts p ON p.id = r.post_id
      WHERE f.id = ? AND p.user_id = ? LIMIT 1`,
    Number(fileId), userId,
  ));
}

/** HR / Ekko: tệp của công ty mình (Ekko: mọi công ty). */
export function adminFile(access, fileId) {
  const row = get('SELECT * FROM feed_files WHERE id = ?', Number(fileId));
  if (!row) return null;
  if (!access.ekko && row.employer_key !== access.employerKey) return null;
  return fileOnDisk(row);
}
