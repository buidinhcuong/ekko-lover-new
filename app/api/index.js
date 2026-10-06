/**
 * Hàm serverless cho bản demo trên Vercel. File tĩnh trong `public/` do CDN của
 * Vercel phục vụ; mọi đường dẫn động (API, SSO, đăng nhập thử, healthz) được
 * `vercel.json` chuyển về đây và xử lý y như server chạy ở máy.
 */
import { handle } from '../server/app.js';

export default handle;
