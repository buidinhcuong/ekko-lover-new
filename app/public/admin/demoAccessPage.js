/**
 * Trang truy cập demo gửi khách hàng (một tệp .html tự chứa): đường dẫn + mã QR
 * mở app người lao động trên điện thoại, đường dẫn Admin HR, tài khoản của từng
 * bên và gợi ý các luồng nên thử. Tạo ngay trên trình duyệt của quản trị Ekko,
 * không gửi mật khẩu đi đâu.
 */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function demoAccessHtml({ origin, company, worker, hr }) {
  const appUrl = `${origin}/app/?demo=1`;
  const adminUrl = `${origin}/admin/`;
  const account = (label, email, password) => `
      <dl class="acc">
        <div><dt>${label} · Email</dt><dd><code>${esc(email)}</code><button type="button" data-copy="${esc(email)}">Chép</button></dd></div>
        <div><dt>Mật khẩu</dt><dd><code>${esc(password)}</code><button type="button" data-copy="${esc(password)}">Chép</button></dd></div>
      </dl>`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trải nghiệm Ekko</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  :root { --ink:#101828; --muted:#475467; --soft:#667085; --line:#EAECF0; --bg:#F5F7FB; --card:#fff; --brand:#444CE7; --brand-50:#EEF4FF; --lime:#D7F65B; --green:#12B76A; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --ink:#F2F4F7; --muted:#C0C5D0; --soft:#98A2B3; --line:#2A3142; --bg:#0E1220; --card:#161B2C; --brand-50:#1E2450; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 "Be Vietnam Pro", system-ui, -apple-system, sans-serif; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 32px 16px 56px; }
  header { display: grid; gap: 6px; margin-bottom: 24px; }
  .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--brand); }
  h1 { margin: 0; font-size: clamp(24px, 4vw, 34px); line-height: 1.2; }
  header p { margin: 0; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 20px; display: grid; gap: 14px; align-content: start; }
  .card h2 { margin: 0; font-size: 19px; display: flex; align-items: center; gap: 10px; }
  .card h2 svg { flex: none; width: 34px; height: 34px; padding: 7px; border-radius: 10px; background: var(--brand-50); color: var(--brand); }
  .card > p { margin: 0; color: var(--muted); font-size: 14px; }
  .open { display: inline-flex; justify-content: center; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 12px; background: var(--brand); color: #fff; font-weight: 700; text-decoration: none; }
  .open:hover { filter: brightness(1.08); }
  .qrrow { display: flex; gap: 14px; align-items: center; }
  .qr { flex: none; width: 132px; height: 132px; padding: 8px; background: #fff; border-radius: 12px; border: 1px solid var(--line); display: grid; place-items: center; }
  .qr img, .qr canvas { width: 116px !important; height: 116px !important; }
  .qrrow small { color: var(--soft); font-size: 13px; }
  .acc { margin: 0; display: grid; gap: 8px; }
  .acc div { display: grid; gap: 2px; }
  .acc dt { font-size: 12px; color: var(--soft); }
  .acc dd { margin: 0; display: flex; gap: 8px; align-items: center; }
  .acc code { flex: 1; min-width: 0; overflow-wrap: anywhere; font: 600 14px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 8px 10px; border-radius: 8px; background: var(--bg); border: 1px solid var(--line); }
  .acc button { flex: none; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 13px; cursor: pointer; }
  .url { font-size: 13px; color: var(--soft); overflow-wrap: anywhere; }
  section.steps { margin-top: 28px; }
  section.steps h2 { font-size: 20px; margin: 0 0 12px; }
  .flows { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  @media (max-width: 860px) { .flows { grid-template-columns: 1fr; } }
  .flow { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; }
  .flow h3 { margin: 0 0 8px; font-size: 16px; }
  .flow ol { margin: 0; padding-left: 20px; display: grid; gap: 6px; color: var(--muted); font-size: 14px; }
  .flow.is-cross { border-color: var(--brand); background: linear-gradient(160deg, var(--brand-50), var(--card) 60%); }
  .note { margin-top: 22px; padding: 14px 16px; border-radius: 12px; border: 1px dashed var(--line); color: var(--muted); font-size: 13px; }
  .note b { color: var(--ink); }
  footer { margin-top: 28px; color: var(--soft); font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="eyebrow">Ekko · Giáo dục tài chính · Bản trải nghiệm</span>
    <h1>${esc(company)}</h1>
    <p>Hai tài khoản dùng thử: một cho người lao động (mở trên điện thoại), một cho HR doanh nghiệp (mở trên máy tính). Đã có sẵn dữ liệu mẫu để xem báo cáo.</p>
  </header>

  <div class="grid">
    <article class="card">
      <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>App người lao động</h2>
      <p>Mở trên điện thoại: quét mã QR bằng camera, hoặc bấm nút. Có thể "Thêm vào màn hình chính" để dùng như một app.</p>
      <div class="qrrow">
        <div class="qr" id="qr" aria-label="Mã QR mở app"></div>
        <small>Quét bằng camera điện thoại để mở app.<br><span class="url">${esc(appUrl)}</span></small>
      </div>
      <a class="open" href="${esc(appUrl)}" target="_blank" rel="noopener">Mở app người lao động</a>
      ${account('Người lao động', worker.email, worker.password)}
    </article>

    <article class="card">
      <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>Admin HR doanh nghiệp</h2>
      <p>Mở trên máy tính. HR chỉ thấy số liệu của ${esc(company)}: Bảng điều khiển Giáo dục tài chính và EkkoFeed (góp ý, chia sẻ của người lao động).</p>
      <a class="open" href="${esc(adminUrl)}" target="_blank" rel="noopener">Mở Admin HR</a>
      <span class="url">${esc(adminUrl)}</span>
      ${account('HR', hr.email, hr.password)}
    </article>
  </div>

  <section class="steps">
    <h2>Gợi ý trải nghiệm</h2>
    <div class="flows">
      <div class="flow">
        <h3>Người lao động (điện thoại)</h3>
        <ol>
          <li>Đăng nhập, làm quen nhân vật Heo và các đảo chức năng.</li>
          <li>Ghi chép một khoản chi, thử hỏi trợ lý tài chính.</li>
          <li>Học một bài ngắn, nhận XP và giữ chuỗi ngày (streak).</li>
          <li>Bấm thanh <b>"Góp ý tới công ty"</b> ở màn hình chính.</li>
        </ol>
      </div>
      <div class="flow">
        <h3>HR (máy tính)</h3>
        <ol>
          <li><b>Bảng điều khiển</b>: số người học, tiến độ, từ khoá nổi bật.</li>
          <li><b>EkkoFeed → Báo cáo chung</b>: từ khoá, chủ đề, vấn đề nổi bật.</li>
          <li><b>Phản hồi</b>: giao người phụ trách, trả lời cả nhóm hoặc từng người.</li>
          <li><b>Chia sẻ</b>: lời khen, câu chuyện được gom nhóm theo ý chính.</li>
        </ol>
      </div>
      <div class="flow is-cross">
        <h3>Thử cả hai đầu</h3>
        <ol>
          <li>Trên điện thoại: chọn loại <b>Góp ý / Cần giải quyết</b>, viết, xem trước rồi gửi.</li>
          <li>Trên Admin HR: tab <b>Phản hồi</b> → mục "Góp ý lẻ" có chấm xanh chưa đọc.</li>
          <li>Trả lời riêng góp ý đó.</li>
          <li>Quay lại app: màn hình chính báo "Công ty đã phản hồi góp ý của bạn".</li>
        </ol>
      </div>
    </div>
    <p class="note"><b>Lưu ý:</b> nội dung gửi qua EkkoFeed được che số điện thoại, CCCD, tên người trước khi tới công ty; người gửi chọn ẩn danh hoặc ghi tên. Từ khoá và nhóm vấn đề chỉ hiện khi có từ 5 người cùng nhắc, để giữ ẩn danh. Số liệu trong bản trải nghiệm là dữ liệu mẫu. Vui lòng không chia sẻ trang này ra ngoài vì có mật khẩu đăng nhập.</p>
  </section>
  <footer>Ekko · ekko.vn</footer>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>
  try { new QRCode(document.getElementById('qr'), { text: ${JSON.stringify(appUrl).replace(/</g, '\\u003c')}, width: 116, height: 116, correctLevel: QRCode.CorrectLevel.M }); }
  catch (e) { document.getElementById('qr').textContent = 'Mở bằng đường dẫn bên cạnh'; }
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var done = function () { b.textContent = 'Đã chép'; setTimeout(function () { b.textContent = 'Chép'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.copy).then(done, function () {}); else done();
    });
  });
</script>
</body>
</html>
`;
}

/** Tải tệp trang truy cập về máy. */
export function downloadDemoAccess(data) {
  const blob = new Blob([demoAccessHtml(data)], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ekko-trai-nghiem-${String(data.company).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}.html`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
