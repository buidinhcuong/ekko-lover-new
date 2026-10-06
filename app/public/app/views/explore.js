/**
 * Khám phá: bản đồ lộ trình học của concept Ekko Lover.
 *
 * Ekko Lover và bản sao Ekko Lover Colors dùng chung một bộ vẽ; khác biệt của
 * bản Colors chỉ nằm ở CSS (`html[data-concept="lover-colors"]`). Dữ liệu bản
 * đồ lấy một lần ở đây rồi truyền xuống, nên đổi concept không đổi tiến độ hay
 * luật mở khoá.
 */
import { api } from '/shared/client.js';
import exploreLover from './explore-lover.js';

export default async function exploreView(ctx) {
  const map = await api.get('/api/learn/map');
  return exploreLover(ctx, map);
}
