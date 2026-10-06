# Hướng dẫn deploy — Ekko · Giáo dục tài chính

Tài liệu cho team hạ tầng / DevOps của doanh nghiệp, đưa app lên môi trường nội
bộ để **thử nghiệm với người dùng thật** (đăng ký bằng email + mã nội bộ). Khi
nối SSO với app Ekko thì xem mục 9.

Người phụ trách sản phẩm: anhnv@ekko.vn

---

## 1. App gồm những gì

| | |
|---|---|
| Ngôn ngữ / runtime | Node.js **≥ 22.5** (dùng `node:sqlite` có sẵn). **Không có dependency npm** — không cần `npm install`. |
| Database | **SQLite**, một tệp `gdtc.sqlite` trong thư mục dữ liệu, **server tự tạo + tự nạp nội dung** (cấp độ, huy hiệu, 8 mô đun / 34 bài, tin tức…) lần đầu chạy. Không cần MySQL/PostgreSQL. |
| Tệp người dùng | Ảnh hoá đơn trong `<thư mục dữ liệu>/receipts/` (không public). |
| Một tiến trình | Server HTTP phục vụ cả app người dùng (`/app/`), Admin portal (`/admin/`) và API (`/api/…`). |
| Health check | `GET /healthz` → `{"ok":true,…}` |
| Dịch vụ ngoài | Anthropic API (Claude) cho các tính năng AI — tuỳ chọn, thiếu khoá thì AI tự chuyển sang phần viết sẵn. |
| Tài nguyên | Rất nhẹ: 1 vCPU, 512 MB RAM, 1 GB đĩa đủ cho vài trăm người thử. |

**Yêu cầu bắt buộc:** thư mục dữ liệu nằm trên **ổ đĩa bền** (không mất khi
khởi động lại / deploy lại) và chỉ **một** tiến trình ghi vào nó (SQLite — không
chạy nhiều bản sao song song trên cùng database). **Không dùng Vercel / môi
trường serverless** cho bản này: database ở đó bị xoá mỗi lần khởi động.

## 2. Nội dung gói

```
ekko-gdtc/
├── DEPLOY.md              ← tài liệu này
├── BAN-GIAO.md            tóm tắt các thay đổi, việc còn mở
├── render.yaml            cấu hình sẵn cho Render (cách C)
├── deploy/
│   ├── docker-compose.yml cách A — Docker
│   ├── ekko-gdtc.service  cách B — systemd
│   └── nginx.conf         reverse proxy + HTTPS (cách A và B)
├── app/                   mã nguồn app (server/, public/, test/, tools/…)
│   ├── Dockerfile
│   ├── .env.example       danh sách đầy đủ biến môi trường, có giải thích
│   └── README.md          tài liệu kỹ thuật chi tiết
├── video-src/             nguồn dựng video giới thiệu (không cần cho deploy)
└── *.png, *.fig, Mascot/  tài nguyên thiết kế (không cần cho deploy)
```

Gói **không** kèm: `app/.env` (khoá API), `app/data/` (database của máy dev),
lịch sử git.

## 3. Biến môi trường

Danh sách đầy đủ + giải thích trong `app/.env.example`. Tối thiểu cho môi trường
thử nghiệm:

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `NODE_ENV` | `production` | **Bắt buộc.** Tắt `/dev/login` (vào Admin không cần mật khẩu), người dùng mẫu, dữ liệu mẫu; cookie có cờ `Secure`. |
| `HOST` / `PORT` | `127.0.0.1` / `4321` (sau Nginx) — `0.0.0.0` trong Docker | |
| `EKKO_DATA_DIR` | vd. `/var/lib/ekko-gdtc` hoặc `/data` | Ổ đĩa bền, được sao lưu. |
| `EKKO_SESSION_SECRET` | `openssl rand -hex 32` | Ký cookie đăng nhập. Mỗi môi trường một giá trị, giữ bí mật. |
| `EKKO_ADMIN_SUBJECTS` | email quản trị, cách nhau dấu phẩy | Đăng ký bằng email này thì có quyền Admin. |
| `EKKO_SIGNUP_CODE` | 6–20 chữ/số, vd. `EKKOTEST26` | Mã người thử phải nhập khi đăng ký. Để trống thì server tự sinh, in ra log. |
| `ANTHROPIC_API_KEY` | khoá Anthropic **riêng cho môi trường này** | Tuỳ chọn. Đặt hạn mức chi tiêu tháng trên Anthropic Console. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Khuyến nghị (rẻ hơn mặc định Opus). |
| `EKKO_TZ` | `Asia/Ho_Chi_Minh` | Ngày tính streak / check-in. |

Biến đặt trong môi trường (systemd, Docker, Render) **thắng** tệp `app/.env`.
Không đưa khoá thật vào git, ticket hay chat.

---

## 4. Cách A — Docker (khuyến nghị nếu doanh nghiệp đã có Docker)

```bash
# 1. Chép gói lên máy chủ, vào thư mục deploy
cd ekko-gdtc/deploy

# 2. Tạo tệp biến môi trường từ mẫu rồi điền giá trị (mục 3)
cp ../app/.env.example .env
chmod 600 .env
nano .env

# 3. Dựng và chạy
docker compose up -d --build

# 4. Kiểm tra
docker compose ps                         # trạng thái healthy
curl -s http://127.0.0.1:4321/healthz     # {"ok":true,...}
docker compose logs --tail=30             # có dòng "mã đăng ký nội bộ: …"
```

- Database + ảnh hoá đơn nằm trong volume `ekko-data` (mount `/data`) — **sao lưu volume này**.
- Container chỉ mở cổng trên `127.0.0.1`; đặt Nginx (mục 6) hoặc reverse proxy / load balancer của doanh nghiệp phía trước để có HTTPS.
- Cập nhật phiên bản: chép mã mới đè lên `app/`, rồi `docker compose up -d --build`. Dữ liệu trong volume giữ nguyên; server tự nâng cấp cấu trúc database khi khởi động.

> Dockerfile được viết theo đúng yêu cầu của app nhưng **chưa chạy thử bằng Docker**
> trên máy dev (máy không có Docker). Nếu lỗi, kiểm tra trước: image `node:22-slim`,
> quyền ghi của user `node` vào `/data`.

## 5. Cách B — Máy chủ Linux, chạy trực tiếp bằng Node + systemd

```bash
# 1. Cài Node 22 (Ubuntu/Debian, theo NodeSource hoặc nvm) và kiểm tra
node --version          # phải >= v22.5

# 2. Tạo user chạy dịch vụ và thư mục
sudo useradd --system --home /opt/ekko-gdtc --shell /usr/sbin/nologin ekko
sudo mkdir -p /opt/ekko-gdtc /var/lib/ekko-gdtc
sudo cp -R ekko-gdtc/app /opt/ekko-gdtc/
sudo chown -R ekko:ekko /opt/ekko-gdtc /var/lib/ekko-gdtc

# 3. Tệp biến môi trường (mục 3) — chỉ user ekko đọc được
sudo cp /opt/ekko-gdtc/app/.env.example /etc/ekko-gdtc.env
sudo nano /etc/ekko-gdtc.env
sudo chown ekko:ekko /etc/ekko-gdtc.env && sudo chmod 600 /etc/ekko-gdtc.env

# 4. Dịch vụ systemd
sudo cp ekko-gdtc/deploy/ekko-gdtc.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ekko-gdtc
sudo systemctl status ekko-gdtc
journalctl -u ekko-gdtc -n 30          # có dòng "mã đăng ký nội bộ: …"
curl -s http://127.0.0.1:4321/healthz
```

Đường dẫn `node` trong `ekko-gdtc.service` là `/usr/bin/node` — sửa nếu Node cài
chỗ khác (`which node`).

Cập nhật phiên bản: chép `app/` mới đè lên `/opt/ekko-gdtc/app` (giữ nguyên
`/var/lib/ekko-gdtc`), rồi `sudo systemctl restart ekko-gdtc`.

## 6. HTTPS + tên miền (cho cách A và B)

1. Trỏ một tên miền / subdomain nội bộ về máy chủ, vd. `hoc-tap.<doanh-nghiep>.vn`.
2. Dùng mẫu `deploy/nginx.conf` (thay tên miền), cấp chứng chỉ bằng certbot hoặc
   chứng chỉ của doanh nghiệp:
   ```bash
   sudo cp ekko-gdtc/deploy/nginx.conf /etc/nginx/sites-available/ekko-gdtc
   sudo ln -s /etc/nginx/sites-available/ekko-gdtc /etc/nginx/sites-enabled/
   sudo certbot --nginx -d hoc-tap.<doanh-nghiep>.vn
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Proxy phải gửi `X-Forwarded-For` (giới hạn số lần thử đăng nhập theo IP dựa
   vào đó) và **không** để cổng 4321 mở thẳng ra ngoài.
4. Bắt buộc chạy sau HTTPS: cookie đăng nhập có cờ `Secure`. Chỉ khi thử trong
   mạng nội bộ không có HTTPS mới đặt `EKKO_INSECURE_COOKIE=1`.

## 7. Cách C — Render (nếu không có hạ tầng riêng)

Repo GitHub chứa gói này → Render → **New → Blueprint** → chọn repo. Render đọc
`render.yaml`: dịch vụ web Node 22, ổ đĩa 1 GB ở `/var/data`, health check, các
biến cố định; hỏi điền `EKKO_ADMIN_SUBJECTS`, `EKKO_SIGNUP_CODE`,
`ANTHROPIC_API_KEY`. Cần gói trả phí (Starter) để có ổ đĩa. HTTPS + tên miền
`*.onrender.com` có sẵn. Mặc định `autoDeploy: false` — bấm **Manual Deploy**
khi cập nhật.

---

## 8. Sau khi deploy — kiểm tra & bàn giao (theo thứ tự)

1. `https://<tên-miền>/healthz` → `"ok":true`.
2. `https://<tên-miền>/dev/login?role=admin` → **phải bị từ chối** (400). Nếu vào
   được tức là thiếu `NODE_ENV=production` — dừng lại và sửa.
3. **Người quản trị đăng ký trước tiên**: `https://<tên-miền>/app/` → Đăng ký bằng
   email nằm trong `EKKO_ADMIN_SUBJECTS` + mã đăng ký. (Email chưa được xác minh,
   nên làm việc này trước khi phát mã cho ai khác.)
4. `https://<tên-miền>/admin/` → đăng nhập → **Chức năng → AI**: thấy "Đã có khoá
   API" và đúng model. **Người học**: thấy mã đăng ký, công tắc cho phép đăng ký.
5. Thử trên điện thoại: ghi nhanh "phở 45k, cà phê 25k" (AI tách 2 khoản), hỏi
   Ekko bot một câu, học một bài.
6. Gửi người thử: đường dẫn `https://<tên-miền>/app/` + mã đăng ký.

Vận hành hằng ngày (Admin portal):
- Quên mật khẩu → **Người học → Đặt lại mật khẩu** (mật khẩu tạm hiện một lần).
- Cấp / bỏ quyền quản trị → **Người học**.
- Đóng đăng ký / đổi mã → **Người học → Đăng ký nội bộ**.
- Số lượt AI mỗi người mỗi ngày (mặc định 30), câu hỏi bot từ chối → **Chức năng → AI**.

## 9. Sao lưu, khôi phục, bảo mật

**Sao lưu** (ít nhất mỗi ngày) — chụp nhất quán khi app đang chạy:
```bash
sqlite3 /var/lib/ekko-gdtc/gdtc.sqlite ".backup '/backup/gdtc-$(date +%F).sqlite'"
tar czf /backup/receipts-$(date +%F).tgz -C /var/lib/ekko-gdtc receipts
```
(Docker: chạy lệnh trên với volume `ekko-data`, hoặc sao lưu cả volume.) Không
chép thẳng tệp `.sqlite` khi đang chạy mà bỏ sót `-wal`/`-shm`.

**Khôi phục:** dừng app → đặt tệp sao lưu thành `gdtc.sqlite` (xoá `-wal`, `-shm`
cũ) → khởi động lại.

**Bảo mật — checklist:**
- [ ] `NODE_ENV=production` (kiểm ở mục 8 bước 2).
- [ ] `EKKO_SESSION_SECRET` ngẫu nhiên, riêng môi trường này.
- [ ] Khoá Anthropic riêng, có hạn mức chi tiêu tháng; không nằm trong git / ticket.
- [ ] Chỉ HTTPS; cổng 4321 không mở ra ngoài.
- [ ] Thư mục dữ liệu chỉ user dịch vụ đọc/ghi; có sao lưu.
- [ ] Mã đăng ký chỉ gửi cho người thử; đóng đăng ký khi đủ người.

Dữ liệu cá nhân: app lưu tên, email, chi tiêu, ngân sách, mục tiêu, tiết kiệm,
ảnh hoá đơn của người thử. Admin portal **không** hiển thị dữ liệu tài chính cá
nhân, chỉ tiến độ học. Nội dung người dùng gõ cho các tính năng AI (câu ghi chi
tiêu, câu hỏi bot, ảnh hoá đơn, thông tin mục tiêu) được gửi tới Anthropic API
để xử lý — cần phù hợp chính sách dữ liệu của doanh nghiệp.

## 10. Khi chuyển sang SSO của app Ekko (triển khai thật)

App Ekko ký token JWT (HS256) bằng `EKKO_SSO_SECRET` dùng chung rồi mở
`https://<tên-miền>/sso?token=<jwt>&redirect=/app/` — chi tiết trong
`app/README.md`, mục "Đăng nhập một lần (SSO) từ app Ekko". Khi đó:
- đặt `EKKO_SSO_SECRET` (thống nhất với team app Ekko),
- đặt `EKKO_LOCAL_AUTH=0` để tắt đăng ký / đăng nhập bằng email.

## 11. Xử lý sự cố

| Hiện tượng | Kiểm tra |
|---|---|
| Không khởi động, lỗi `node:sqlite` | Node < 22.5 — nâng Node. |
| Khởi động lại là mất hết người dùng | Thư mục dữ liệu không bền (container không gắn volume, `/tmp`, serverless). |
| Đăng nhập xong vẫn bị đá ra | Chạy production mà truy cập bằng `http://` (cookie `Secure`) — dùng HTTPS hoặc `EKKO_INSECURE_COOKIE=1` khi thử nội bộ. Hoặc `EKKO_SESSION_SECRET` bị đổi giữa các lần khởi động. |
| Admin báo "Chưa có khoá API" | Biến `ANTHROPIC_API_KEY` chưa tới tiến trình (kiểm `EnvironmentFile`, `env_file`), khởi động lại. |
| AI chậm / lỗi | App tự chuyển sang phần viết sẵn khi AI quá 12–15 giây; kiểm kết nối ra `api.anthropic.com:443` qua firewall/proxy doanh nghiệp. |
| Quên mã đăng ký | Admin → Người học, hoặc log khởi động. |

Kiểm thử tự động (máy có Node 22): `cd app && npm run smoke` — 390 kiểm tra.
