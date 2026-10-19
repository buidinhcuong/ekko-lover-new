/**
 * Mặt cảm xúc EkkoFeed (người gửi tự chọn): vẽ bằng SVG cùng một phong cách,
 * hiển thị giống nhau trên mọi máy — không phụ thuộc bộ emoji của hệ điều hành.
 * Dùng chung cho app người lao động và Admin portal.
 */
export const MOOD_CODES = ['happy', 'neutral', 'sad', 'angry'];

const FACE = {
  happy: { fill: '#FDB022', ring: '#F79009', parts: '<circle cx="8.6" cy="10" r="1.3"/><circle cx="15.4" cy="10" r="1.3"/><path d="M7.6 13.6c1 2 2.6 3 4.4 3s3.4-1 4.4-3" fill="none" stroke-width="1.7" stroke-linecap="round"/>' },
  neutral: { fill: '#FEC84B', ring: '#F79009', parts: '<circle cx="8.6" cy="10.2" r="1.3"/><circle cx="15.4" cy="10.2" r="1.3"/><path d="M8.4 15.2h7.2" fill="none" stroke-width="1.7" stroke-linecap="round"/>' },
  sad: { fill: '#FEC84B', ring: '#F79009', parts: '<circle cx="8.6" cy="10.4" r="1.3"/><circle cx="15.4" cy="10.4" r="1.3"/><path d="M8 16.8c1-1.6 2.4-2.3 4-2.3s3 .7 4 2.3" fill="none" stroke-width="1.7" stroke-linecap="round"/><path d="M16.9 12.4c.9 1.2 1.3 2 1.3 2.6a1.3 1.3 0 0 1-2.6 0c0-.6.4-1.4 1.3-2.6z" fill="#53B1FD" stroke="none"/>' },
  angry: { fill: '#F97066', ring: '#D92D20', parts: '<path d="M6.8 8.2l3.2 1.4M17.2 8.2l-3.2 1.4" fill="none" stroke-width="1.6" stroke-linecap="round"/><circle cx="8.9" cy="11.2" r="1.2"/><circle cx="15.1" cy="11.2" r="1.2"/><path d="M8.4 16.8c1-1.3 2.2-1.9 3.6-1.9s2.6.6 3.6 1.9" fill="none" stroke-width="1.7" stroke-linecap="round"/>' },
};

/** Phần tử <svg> mặt cảm xúc; mã lạ → null. */
export function moodFace(code, size = 22) {
  const f = FACE[code];
  if (!f) return null;
  const tmp = document.createElement('span');
  tmp.innerHTML = `<svg class="moodface moodface--${code}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">`
    + `<circle cx="12" cy="12" r="10.6" fill="${f.fill}" stroke="${f.ring}" stroke-width="0.8"/>`
    + `<g fill="#3D2A12" stroke="#3D2A12">${f.parts}</g></svg>`;
  return tmp.firstChild;
}
