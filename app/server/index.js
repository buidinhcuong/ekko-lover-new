/**
 * Ekko - Giáo dục tài chính
 * Server chạy ở máy: `npm start`. Trên Vercel thì `api/index.js` gọi thẳng
 * `handle` (không mở cổng).
 */
import { createServer } from 'node:http';

import { config } from './config.js';
import { listSeedTables } from './seed/index.js';
import { handle } from './app.js';
import { signupCode } from './services/localAuth.js';

const server = createServer(handle);

server.listen(config.port, config.host, () => {
  const base = `http://${config.host}:${config.port}`;
  console.log('Ekko - Giáo dục tài chính');
  console.log(`  Ứng dụng   ${base}/app/`);
  console.log(`  Admin      ${base}/admin/`);
  if (config.devMode) {
    console.log(`  Dev login  ${base}/dev/login            (nhân viên)`);
    console.log(`             ${base}/dev/login?role=admin (quản trị)`);
  }
  console.log(`  Nội dung   ${JSON.stringify(listSeedTables())}`);
  if (config.localAuth) {
    // Thử nghiệm nội bộ: người đầu tiên (Admin) cần mã này để tự đăng ký, sau đó
    // xem / đổi mã ở Admin → Người học.
    console.log(`  Đăng ký    ${base}/app/  · mã đăng ký nội bộ: ${signupCode()}`);
  }
});
