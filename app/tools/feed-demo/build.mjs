/**
 * Dựng bản xem thử EkkoFeed thành MỘT tệp HTML tự chạy (không cần server) để gửi
 * khách hàng: bên trái app người lao động trong khung điện thoại, bên phải Admin
 * HR. Dùng đúng CSS + module giao diện thật của app; dữ liệu là bản chụp từ server
 * dev (snapshot/) và một "server giả" trong trình duyệt (mock.js).
 *
 *   node tools/feed-demo/capture-api.mjs > tools/feed-demo/snapshot/api.json   # (tuỳ chọn) chụp lại dữ liệu
 *   node tools/feed-demo/build.mjs [đường/dẫn/ra.html] [--company "Tên công ty"]
 *
 * Mặc định ghi ra docs/ekkofeed/EkkoFeed-xem-thu.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../..');
const PUB = path.join(APP, 'public');
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const OUT = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--company') || path.join(APP, '..', 'docs/ekkofeed/EkkoFeed-xem-thu.html'));
const COMPANY = flag('--company', 'Công ty ABC (Demo)');
const SOURCE_COMPANY = 'Công ty TNHH Minh Phát';
const MAX_ASSET = 700 * 1024;

const read = (p) => fs.readFileSync(p, 'utf8');
const rename = (s) => s.split(SOURCE_COMPANY).join(COMPANY);
const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

// --- tài nguyên (ảnh) → data URI --------------------------------------------------
const assetCache = new Map();
function dataUri(webPath) {
  const clean = webPath.split(/[?#]/)[0];
  if (assetCache.has(clean)) return assetCache.get(clean);
  const file = path.join(PUB, clean);
  let out = null;
  if (MIME[path.extname(file)] && fs.existsSync(file) && fs.statSync(file).size <= MAX_ASSET) {
    out = `data:${MIME[path.extname(file)]};base64,${fs.readFileSync(file).toString('base64')}`;
  }
  assetCache.set(clean, out);
  return out;
}
const ASSET_RE = /\/(?:assets|shared)\/[A-Za-z0-9_./-]+\.(?:png|svg|jpe?g|webp|gif)/g;

// --- sprite icon: gộp vào trang, đổi id có tiền tố để không đụng nhau ---------------
const SPRITES = { '/assets/icons/ui-icons.svg': 'ui-', '/assets/icons/app-icons.svg': 'app-', '/shared/icons-core.svg': 'core-' };
function spriteSymbols() {
  return Object.entries(SPRITES).map(([web, prefix]) => {
    const svg = read(path.join(PUB, web)).replace(/<!--[\s\S]*?-->/g, '');
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    return inner.replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`).replace(/(href|xlink:href)="#([^"]+)"/g, `$1="#${prefix}$2"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`);
  }).join('\n');
}

// --- CSS: nối các tệp, nhúng ảnh trong url() ----------------------------------------
function css(files) {
  return files.map((f) => {
    const dir = path.posix.dirname(f);
    return read(path.join(PUB, f)).replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
      if (/^(data:|https?:|#)/.test(u)) return m;
      const web = u.startsWith('/') ? u : path.posix.join(dir, u);
      const d = dataUri(web);
      return d ? `url("${d}")` : m;
    }).replace(/@import[^;]+;/g, '');
  }).join('\n');
}
const APP_CSS = css(['/shared/tokens.css', '/shared/typography.css', '/shared/ekko-components-extra.css', '/shared/ekko-icons.css', '/app/style.css']);
const ADMIN_CSS = css(['/shared/tokens.css', '/shared/typography.css', '/shared/ekko-button.css', '/shared/ekko-input.css', '/shared/ekko-table.css',
  '/shared/ekko-badge.css', '/shared/ekko-checkbox-radio.css', '/shared/ekko-components-extra.css', '/shared/ekko-icons.css', '/admin/style.css']);

// --- module ES: đi theo import, đổi đường dẫn thành tên '@ekko/…', đóng gói data: URL ---
// Icon sprite: trỏ thẳng vào sprite đã nhúng trong trang (khỏi tải tệp .svg ngoài).
const PATCHES = {
  '/shared/client.js': [['`${sprite}#${name}`', '(window.__spriteHref ? window.__spriteHref(sprite, name) : `${sprite}#${name}`)']],
  '/admin/ui.js': [['`/shared/icons-core.svg#${name}`', "(window.__spriteHref ? window.__spriteHref('/shared/icons-core.svg', name) : `/shared/icons-core.svg#${name}`)"]],
};
function patch(web, code) {
  for (const [from, to] of PATCHES[web] || []) {
    if (!code.includes(from)) throw new Error(`Không vá được ${web}: thiếu "${from}"`);
    code = code.replace(from, to);
  }
  return code;
}
const SPEC_RE = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\2/g;
function bundle(entries) {
  const mods = new Map();
  const visit = (web, srcOverride = null) => {
    if (mods.has(web)) return;
    mods.set(web, null);
    const file = srcOverride || path.join(PUB, web);
    const code = patch(web, read(file)).replace(SPEC_RE, (m, pre, q, spec) => {
      if (spec.startsWith('@ekko/')) { visit(spec.slice(5)); return m; }
      if (!/^(\.|\/)/.test(spec)) return m;
      const abs = spec.startsWith('/') ? spec : path.posix.join(path.posix.dirname(web), spec);
      visit(abs);
      return `${pre}${q}@ekko${abs}${q}`;
    });
    mods.set(web, code);
  };
  entries.forEach(([web, file]) => visit(web, file));
  const imports = {};
  for (const [web, code] of mods) imports[`@ekko${web}`] = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  return { imports, code: [...mods.values()].join('\n') };
}
const phoneMods = bundle([['/demo/phone.js', path.join(HERE, 'phone.js')]]);
const adminMods = bundle([['/admin/main.js']]);

// Ảnh mà JS tạo ra lúc chạy (đường dẫn viết sẵn trong code) → bảng tra cho trình duyệt.
const runtimeAssets = {};
for (const code of [phoneMods.code, adminMods.code]) {
  for (const p of new Set(code.match(ASSET_RE) || [])) { const d = dataUri(p); if (d) runtimeAssets[p] = d; }
}

// --- ảnh chụp màn hình app (DOM thật) ----------------------------------------------
function snapshotHtml(file) {
  // <button> lồng nhau (thẻ tin tức…) làm trình phân tích HTML tách sai cây — đổi tạm
  // thành <ekko-btn>, phone.js đổi lại thành <button> bằng DOM sau khi gắn vào trang.
  return rename(read(path.join(HERE, 'snapshot', file)))
    .replace(/<button\b/g, '<ekko-btn').replace(/<\/button>/g, '</ekko-btn>')
    .replace(/(src|href)="(\/(?:assets|shared)\/[^"]+)"/g, (m, attr, web) => {
      const [p] = web.split(/[?#]/);
      if (attr === 'href' && SPRITES[p]) return `href="#${SPRITES[p]}${web.split('#')[1]}"`;
      const d = dataUri(web);
      return d ? `${attr}="${d}"` : m;
    });
}
const APP_HOME = snapshotHtml('app-home.html');
const APP_FEED = snapshotHtml('app-feed.html');

// --- "server" giả: hàm thật của server + dữ liệu chụp + mock.js -----------------------
const feedSrc = read(path.join(APP, 'server/services/ekkoFeed.js'));
const slice = (src, from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error(`Không tìm thấy "${from}"`); return src.slice(a, b + to.length); };
const topics = slice(feedSrc, 'export const FEED_TOPICS = {', '\n};').replace('export ', '');
const redactSrc = slice(feedSrc, 'const TITLE_WORDS', "replace(/\\s+([.,!?])/g, '$1').trim();\n}").replace('export function', 'function');
const normalizeSrc = slice(read(path.join(APP, 'server/services/nlp.js')), 'export function normalize', '\n}').replace('export ', '');
const moodSrc = read(path.join(APP, 'server/services/feedMood.js')).replace(/^export /gm, '');
const snapshot = JSON.parse(rename(read(path.join(HERE, 'snapshot/api.json'))));
snapshot.company = COMPANY;
const workerName = (read(path.join(HERE, 'snapshot/app-home.html')).match(/class="loverhome__name[^"]*"[^>]*>([^<]+)</) || [])[1] || 'Người lao động';

// Dời mọi mốc ngày trong dữ liệu chụp cho khớp "hôm nay" lúc khách mở tệp.
const shiftSrc = `
const DAY_MS = 86400000;
function shiftDates(x, ms) {
  if (Array.isArray(x)) return x.map((v) => shiftDates(v, ms));
  if (x && typeof x === 'object') { for (const k of Object.keys(x)) x[k] = shiftDates(x[k], ms); return x; }
  if (typeof x === 'string' && /^\\d{4}-\\d{2}-\\d{2}(T[\\d:.]+Z)?$/.test(x)) {
    const d = new Date(x.length === 10 ? x + 'T00:00:00Z' : x);
    const out = new Date(d.getTime() + ms).toISOString();
    return x.length === 10 ? out.slice(0, 10) : out;
  }
  return x;
}
const DAYS_LATE = Math.floor((Date.now() - new Date(SNAPSHOT_RAW.capturedAt).getTime()) / DAY_MS);
const SNAPSHOT = shiftDates(SNAPSHOT_RAW, DAYS_LATE * DAY_MS);
`;
const MOCK = [
  `const SNAPSHOT_RAW = ${JSON.stringify(snapshot)};`,
  shiftSrc,
  `const WORKER = ${JSON.stringify({ name: workerName, email: 'nguoilaodong@demo.ekko.vn' })};`,
  topics, redactSrc, normalizeSrc, moodSrc,
  read(path.join(HERE, 'mock.js')),
].join('\n');

// --- tài liệu cho từng khung --------------------------------------------------------
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,500;12..96,600&display=swap">';
const SPRITE_BLOCK = `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${spriteSymbols()}</svg>`;
// Chạy trước mọi module: chuyển fetch sang server giả, đổi ảnh / icon sang bản nhúng.
const bootstrap = (role) => `<script>
(() => {
  const DEMO = window.parent.DEMO;
  window.fetch = async (url, opts) => {
    const r = await DEMO.handle(${JSON.stringify(role)}, String(url), opts || {});
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
  const ASSETS = ${JSON.stringify(runtimeAssets)};
  const SPRITES = ${JSON.stringify(SPRITES)};
  window.__spriteHref = (sprite, name) => { const pre = SPRITES[String(sprite).split('?')[0]]; return pre ? '#' + pre + name : sprite + '#' + name; };
  const fix = (n) => {
    if (n.nodeType !== 1) return;
    const list = n.matches('img, use') ? [n] : [];
    list.push(...n.querySelectorAll('img, use'));
    for (const e of list) {
      if (e.tagName === 'IMG') { const s = e.getAttribute('src'); if (s && ASSETS[s.split(/[?#]/)[0]]) e.setAttribute('src', ASSETS[s.split(/[?#]/)[0]]); continue; }
      const h = e.getAttribute('href'); if (!h || h.startsWith('#')) continue;
      const [file, id] = h.split('#'); const pre = SPRITES[file.split('?')[0]];
      if (pre && id) e.setAttribute('href', '#' + pre + id);
    }
  };
  new MutationObserver((ms) => ms.forEach((m) => (m.type === 'attributes' ? fix(m.target) : m.addedNodes.forEach(fix))))
    .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href'] });
  // Liên kết ra ngoài (Mở app người học, Đăng xuất…) không rời khỏi bản xem thử.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && !a.getAttribute('href').startsWith('#')) { e.preventDefault(); window.parent.postMessage({ demo: 'focus', target: ${JSON.stringify(role === 'hr' ? 'phone' : 'hr')} }, '*'); }
  }, true);
  try { window.location.reload = () => window.dispatchEvent(new HashChangeEvent('hashchange')); } catch { /* chỉ đọc */ }
})();
</script>`;
const importMap = (imports) => `<script type="importmap">${JSON.stringify({ imports }).replace(/</g, '\\u003c')}</script>`;

const PHONE_DOC = `<!doctype html><html lang="vi" data-concept="lover" style="--dev-scale: 1;"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${FONTS}
<style>${APP_CSS}</style>
<script>window.APP_HOME = ${JSON.stringify(APP_HOME).replace(/</g, '\\u003c')}; window.APP_FEED = ${JSON.stringify(APP_FEED).replace(/</g, '\\u003c')};</script>
<script>
  // Trong khung điện thoại vẽ ở trang ngoài: chừa chỗ cho "tai thỏ" và thanh home.
  // Mở trên điện thoại thật (khung bỏ đi, app tràn màn hình) thì không cần.
  if (window.parent.matchMedia('(min-width: 601px)').matches) {
    document.documentElement.style.setProperty('--status-h', '50px');
    document.documentElement.style.setProperty('--home-h', '16px');
  }
</script>
${bootstrap('worker')}${importMap(phoneMods.imports)}</head><body>${SPRITE_BLOCK}<div id="phone"></div>
<script type="module">import '@ekko/demo/phone.js';</script></body></html>`;

const ADMIN_DOC = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${FONTS}
<style>${ADMIN_CSS}</style>
${bootstrap('hr')}${importMap(adminMods.imports)}</head><body>${SPRITE_BLOCK}<div id="admin" class="admin-boot">Đang tải Admin portal…</div>
<script>window.parent.DEMO.onChange((who) => { if (who === 'worker') window.dispatchEvent(new HashChangeEvent('hashchange')); });</script>
<script type="module">import '@ekko/admin/main.js';</script></body></html>`;

// --- trang ngoài ---------------------------------------------------------------------
const shell = read(path.join(HERE, 'shell.html'))
  .replaceAll('{{COMPANY}}', COMPANY)
  .replace('{{LOGO}}', dataUri('/assets/logo/Ekko_Primary_Logo_PaydayBlue.svg') || '')
  .replace('{{ICON}}', dataUri('/assets/logo/Ekko_Symbol_Logo_PaydayBlue.svg') || '')
  .replace('/*{{MOCK}}*/', () => MOCK.replace(/<\/script/gi, '<\\/script'))
  .replace('/*{{DOCS}}*/', () => `const PHONE_DOC = ${JSON.stringify(PHONE_DOC).replace(/<\/script/gi, '<\\/script')};\nconst ADMIN_DOC = ${JSON.stringify(ADMIN_DOC).replace(/<\/script/gi, '<\\/script')};`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, shell);
console.log(`Đã ghi ${path.relative(process.cwd(), OUT)} — ${(shell.length / 1024 / 1024).toFixed(2)} MB (${Object.keys(phoneMods.imports).length + Object.keys(adminMods.imports).length} module, ${[...assetCache.values()].filter(Boolean).length} ảnh)`);
