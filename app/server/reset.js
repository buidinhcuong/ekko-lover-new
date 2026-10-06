/** Wipes the local database so the next boot re-seeds from scratch. */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './db.js';

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(join(DATA_DIR, `gdtc.sqlite${suffix}`), { force: true });
}
console.log('Đã xoá cơ sở dữ liệu. Chạy lại "npm start" để tạo mới.');
