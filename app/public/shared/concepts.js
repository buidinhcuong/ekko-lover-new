/**
 * Họ concept: concept nào dựng trên giao diện của concept nào.
 *
 * "Ekko Lover Colors" (lover-colors) là bản sao của Ekko Lover để thử phối màu:
 * cùng màn chủ, cùng lộ trình Học tập, cùng cấp độ heo — mọi chỗ trong app hỏi
 * "đây có phải Ekko Lover không" đều hỏi qua `conceptBase`. Khác biệt riêng của
 * bản sao (màu sắc) viết bằng CSS theo `html[data-concept="lover-colors"]`.
 *
 * "Simple mode" (simple) cũng dựng trên Ekko Lover, nhưng có màn chủ riêng
 * (`views/home-simple.js`) và ghi chép bằng giọng nói; cỡ chữ lớn hơn viết bằng
 * CSS theo `html[data-concept="simple"]`.
 */
const BASE = { 'lover-colors': 'lover', simple: 'lover' };

/** @returns {string} concept gốc (chính nó nếu không phải bản sao) */
export const conceptBase = (code) => BASE[code] || code;
