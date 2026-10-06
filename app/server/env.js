/**
 * Nạp `.env` vào `process.env` — module này phải được import TRƯỚC mọi thứ đọc
 * biến môi trường lúc khởi tạo (db.js chọn thư mục dữ liệu ngay khi được nạp).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Nạp tệp `.env` cạnh `package.json` vào `process.env`.
 *
 * Cần thiết vì server không phải lúc nào cũng do terminal của bạn khởi động:
 * khung preview chạy `npm start` với môi trường của chính nó, nên một dòng
 * `export` trong terminal không tới được tiến trình này. Đặt khoá vào tệp thì
 * chạy kiểu gì cũng thấy.
 *
 * Biến đã có sẵn trong môi trường **thắng** tệp — ở máy chủ thật, môi trường mới
 * là nguồn đúng, tệp chỉ để tiện lúc phát triển.
 */
function loadEnvFile() {
  const file = join(dirname(dirname(fileURLToPath(import.meta.url))), '.env');
  if (!existsSync(file)) return;

  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    // Bỏ nháy bao quanh nếu có; giá trị không bao giờ được ghi ra log.
    process.env[key] = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnvFile();
