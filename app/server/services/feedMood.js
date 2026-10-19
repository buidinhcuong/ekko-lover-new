/**
 * EkkoFeed — cảm xúc người gửi tự chọn và cách trộn với giọng điệu câu chữ.
 * Tách riêng (không đụng database) để dùng được ở mọi nơi, kể cả test.
 */
/**
 * Cảm xúc người gửi tự chọn (tuỳ chọn). Điểm cảm xúc của bài KẾT HỢP lựa chọn này
 * với từ ngữ, giọng điệu của câu: có AI thì AI cân nhắc cả hai (aiAnalysis); không
 * có AI, hoặc người gửi đổi cảm xúc sau khi xem trước, thì trộn bằng blendMood.
 */
export const FEED_MOODS = {
  happy: { label: 'Vui', sentiment: 0.6 },
  neutral: { label: 'Bình thường', sentiment: 0 },
  sad: { label: 'Buồn', sentiment: -0.5 },
  angry: { label: 'Phẫn nộ', sentiment: -0.9 },
};
export const moodOrNull = (m) => (FEED_MOODS[m] ? m : null);
export const clamp1 = (x) => Math.max(-1, Math.min(1, x));
/**
 * Trộn giọng điệu câu chữ với cảm xúc tự chọn: mỗi bên một nửa; khi hai bên cùng
 * chiều thì kết quả mạnh hơn bên nhẹ hơn một chút (chọn "Phẫn nộ" + câu gay gắt →
 * rất tiêu cực, không bị kéo về giữa). Lệch chiều thì gặp nhau ở giữa.
 */
export function blendMood(tone, mood) {
  if (!FEED_MOODS[mood]) return Math.round(clamp1(tone) * 100) / 100;
  const m = FEED_MOODS[mood].sentiment;
  let out = (tone + m) / 2;
  if (Math.sign(tone) === Math.sign(m) && m !== 0) out = Math.sign(m) * Math.max(Math.abs(out), Math.min(Math.abs(tone), Math.abs(m)) + 0.1);
  return Math.round(clamp1(out) * 100) / 100;
}
