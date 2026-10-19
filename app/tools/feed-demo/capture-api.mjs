/**
 * Chụp dữ liệu EkkoFeed thật từ server dev (đang chạy) để dựng bản xem thử HTML.
 * Dùng /dev/hr (HR công ty mẫu, nạp lại dữ liệu mẫu) — chỉ có ở môi trường dev.
 *   node tools/feed-demo/capture-api.mjs [http://localhost:4322] > tools/feed-demo/snapshot.json
 */
const base = process.argv[2] || 'http://localhost:4322';

async function session(path) {
  const r = await fetch(base + path, { redirect: 'manual' });
  const cookie = (r.headers.getSetCookie?.() || [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`Không lấy được phiên từ ${path}`);
  return (p) => fetch(base + p, { headers: { cookie } }).then(async (res) => {
    if (!res.ok) throw new Error(`${p} → ${res.status}`);
    return res.json();
  });
}

const hr = await session('/dev/hr');
const out = { capturedAt: new Date().toISOString(), hr: {} };
out.hr.whoami = await hr('/api/session/whoami');
for (const p of ['/api/admin/feed/meta', '/api/admin/feed/overview', '/api/admin/feed/report?days=30', '/api/admin/feed/posts?days=30', '/api/admin/feed/assignees']) {
  out.hr[p.split('?')[0]] = await hr(p);
}
process.stdout.write(JSON.stringify(out));
