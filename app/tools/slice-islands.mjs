/**
 * Cắt file Đảo.svg thành từng mảnh dùng được: đảo, thang, ván, dây, xu, mây.
 *
 * Hộp giới hạn (bbox) lấy từ trình duyệt bằng getBBox() nên đã tính cả transform
 * lồng bên trong; #Object và #Background không có transform nên toạ độ đó chính
 * là toạ độ gốc của file.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'public/assets/islands/trail/_source.svg';
const OUT = 'public/assets/islands/trail';

const source = readFileSync(SRC, 'utf8');

// --- style dùng chung ----------------------------------------------------
const styleBody = source.match(/<style>([\s\S]*?)<\/style>/)[1];
const RULES = [...styleBody.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].split(',').map((s) => s.trim()).filter(Boolean),
  body: m[2].trim(),
}));

/** Chỉ giữ những rule mà mảnh này thực sự dùng, để file ra gọn. */
function styleFor(markup) {
  const used = new Set();
  for (const m of markup.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => used.add(`.${c}`));
  const keep = RULES.filter((r) => r.selectors.some((s) => used.has(s)));
  return keep.map((r) => `    ${r.selectors.join(', ')} { ${r.body} }`).join('\n');
}

// --- tách phần tử con trực tiếp -----------------------------------------
/** @returns {string[]} markup của từng phần tử con trực tiếp trong `inner`. */
function directChildren(inner) {
  const out = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let depth = 0;
  let start = -1;
  let m;
  while ((m = tag.exec(inner))) {
    const closing = m[1] === '/';
    const selfClosing = m[4] === '/';
    if (!closing && selfClosing) {
      if (depth === 0) out.push(m[0]);
      continue;
    }
    if (!closing) {
      if (depth === 0) start = m.index;
      depth += 1;
      continue;
    }
    depth -= 1;
    if (depth === 0 && start >= 0) {
      out.push(inner.slice(start, m.index + m[0].length));
      start = -1;
    }
  }
  return out;
}

const objectInner = (() => {
  const open = source.indexOf('<g id="Object">');
  const inner = source.slice(open + '<g id="Object">'.length);
  // Cắt tới thẻ </g> đóng #Object bằng cách đếm độ sâu
  const tag = /<(\/?)g((?:"[^"]*"|[^>"])*?)(\/?)>/g;
  let depth = 1;
  let m;
  while ((m = tag.exec(inner))) {
    if (m[3] === '/') continue;
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return inner.slice(0, m.index);
  }
  throw new Error('không tìm được thẻ đóng của #Object');
})();

const pieces = directChildren(objectInner);
console.log('số mảnh trong #Object:', pieces.length);
if (pieces.length !== 20) {
  console.error('mong đợi 20 mảnh — cấu trúc file có thể đã khác');
  process.exit(1);
}

// --- danh mục cần cắt ----------------------------------------------------
// box = [x, y, w, h] đo bằng getBBox() trong trình duyệt
const CUTS = [
  { name: 'island-1', piece: 0, box: [848, 1429, 347, 308] },
  { name: 'island-2', piece: 3, box: [841, 224, 400, 384] },
  { name: 'island-3', piece: 5, box: [981, 920, 383, 339] },
  { name: 'island-4', piece: 15, box: [500, 1018, 402, 356] },
  { name: 'island-5', piece: 13, box: [1229, 1440, 364, 502] },
  { name: 'island-6', piece: 2, box: [1306, 279, 403, 688] },
  { name: 'island-home', piece: 14, box: [358, 224, 402, 565] },
  { name: 'island-small', piece: 6, box: [876, 672, 239, 199] },
  { name: 'island-tree', piece: 9, box: [290, 752, 239, 328] },
  { name: 'plank', piece: 4, box: [592, 357, 382, 171] },
  { name: 'ladder', piece: 17, box: [1016, 1010, 97, 495] },
  { name: 'ladder-long', piece: 19, box: [597, 552, 108, 548] },
  { name: 'coin', piece: 18, box: [1048, 1440, 81, 106] },
  // dây: hai path con của mảnh 11
  { name: 'rope', piece: 11, sub: [1, 2], box: [1193, 729, 303, 251] },
  // mây: con của hai nhóm mây
  { name: 'cloud-1', piece: 16, sub: [1], box: [759, 865, 201, 159] },
  { name: 'cloud-2', piece: 16, sub: [4], box: [161, 499, 230, 183] },
  { name: 'cloud-3', piece: 8, sub: [2], box: [256, 1196, 256, 203] },
];

mkdirSync(OUT, { recursive: true });

for (const cut of CUTS) {
  let markup = pieces[cut.piece];
  if (cut.sub) {
    const inner = markup.replace(/^<g[^>]*>/, '').replace(/<\/g>\s*$/, '');
    const kids = directChildren(inner);
    markup = cut.sub.map((j) => kids[j]).join('\n    ');
  }

  const [x, y, w, h] = cut.box;
  const file = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}">
  <!-- Cắt từ "Đảo.svg" (nguồn của Ekko) — xem app/public/assets/islands/hex-source.svg -->
  <defs>
    <style>
${styleFor(markup)}
    </style>
  </defs>
  ${markup.trim()}
</svg>
`;
  writeFileSync(`${OUT}/${cut.name}.svg`, file);
  console.log(`${cut.name}.svg`.padEnd(20), `${w}x${h}`.padEnd(10), `${Math.round(file.length / 1024)} KB`);
}
