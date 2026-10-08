# Bàn giao dự án Ekko · Giáo dục tài chính

Gói này là mã nguồn đầy đủ của dự án tại commit `a62a90d` (05/10/2026), đúng bản
đang chạy trên https://ekko-gdtc.vercel.app. Tài liệu chính nằm ở
`app/README.md`. File này chỉ tóm tắt những gì cần biết để làm tiếp.

## Chạy thử trong 1 phút

Cần **Node.js 22.5 trở lên**. Không có dependency, không cần `npm install`.

```bash
cd app
cp .env.example .env   # tuỳ chọn: điền ANTHROPIC_API_KEY để bật đọc hoá đơn và trả lời dự phòng của Ekko bot
npm start
```

Mở http://127.0.0.1:4321/: trang preview có ba tab App người dùng, Admin
portal và Giới thiệu (video). Cơ sở dữ liệu `app/data/gdtc.sqlite` tự tạo kèm
nội dung khoá học ở lần chạy đầu.

Kiểm thử: `npm run smoke`, hiện có 404 kiểm tra, tất cả đều đạt.

## Những gì có trong gói

| Đường dẫn | Nội dung |
|---|---|
| `app/server/` | Máy chủ Node (HTTP, SQLite có sẵn trong Node), API, luật XP và huy hiệu |
| `app/public/app/` | App người học (JS thuần, không build) |
| `app/public/admin/` | Admin portal |
| `app/public/` (gốc) | Trang preview: `index.html`, `preview.js` |
| `app/api/`, `app/vercel.json` | Cấu hình chạy trên Vercel |
| `app/test/smoke.js` | Bộ kiểm thử end-to-end |
| `app/tools/` | Script phụ: dữ liệu mẫu, bố cục slide bài học (xem dưới) |
| Ảnh ở thư mục gốc, `Mascot/`, `Ảnh chụp màn hình/`, `iphone mockup.fig` | Tư liệu thiết kế dùng khi dựng app |

## Concept và người dùng mẫu

- Ba concept giao diện: **Ekko Lover** (mặc định), **Ekko Lover Colors**,
  **Simple mode**. Concept là một lựa chọn chung cho cả sản phẩm, đổi trong
  Admin portal hoặc qua `/dev/concept?code=...`.
- Ba người dùng mẫu, chọn bằng các nút tròn trên trang preview hoặc qua
  `/dev/persona?as=new|mid|veteran`:
  - `new`: người mới, heo cấp 1, chưa có dữ liệu, hiện onboarding;
  - `mid`: đã học khoảng 30% bài, có dữ liệu, còn 2 huy hiệu chờ nhận thưởng;
  - `veteran`: học hết bài, heo cấp 10.
- **Quy ước đang theo:** thay đổi giao diện mới chỉ áp cho Ekko Lover. Hai
  concept còn lại giữ nguyên trừ khi có yêu cầu riêng.

## Phần làm gần đây (nên đọc code trước khi sửa)

0. **Huy hiệu theo nhóm và thử thách (05/10/2026).** Chi tiết ở
   mục "Luật trò chơi hoá" của `app/README.md`.
   - Thang XP giãn ra (cấp 10: 350 → 8.500 XP), không giới hạn XP theo ngày:
     người cày tối đa mất khoảng 25 ngày, người chăm khoảng 2,5 tháng. Database cũ
     đổi ngưỡng một lần, chỉ ở cấp Admin chưa tự sửa.
   - 41 huy hiệu chia 7 nhóm, xếp thành chuỗi Đồng → Bạc → Vàng. Admin không còn
     thấy mã huy hiệu: server tự sinh từ tên.
   - Thử thách khởi đầu / ngày / tuần: `server/services/challenges.js`, trang
     Admin "Thử thách".
   - XP học tập: 30 XP mỗi bài, 50 XP cho lần đầu hoàn thành bài test mô đun,
     check-in 10 XP khi vào màn chính lần đầu trong ngày (Ekko Lover), sửa ở
     Admin → Chức năng → XP học tập & check-in. XP cố định theo từng bài và
     thưởng hoàn thành trọn mô đun đã bỏ.
   - Tạo mục tiêu (Ekko Lover): nhóm mục tiêu dạng tab, bỏ kỳ tiết kiệm, nút
     Tư vấn phân tích khả thi rồi ghi ngay mục tiêu vào danh sách
     (`services/goalAdvisor.js`).
   - Ghi nhanh bằng AI (`services/expenseReader.js`), đo bằng
     `node tools/eval-quicklog.mjs`.
   - Giới hạn lượt AI mỗi người mỗi ngày và khoá phạm vi Ekko bot
     (`services/aiQuota.js`), Admin → Chức năng → AI.
   - Giao diện mới ở trang Huy hiệu chỉ áp cho Ekko Lover.
   - Thêm 20 tin tức tài chính (cảnh giác lừa đảo, quyền lợi, ngân hàng số,
     kiến thức, mẹo) kèm ảnh minh hoạ và bản tiếng Anh: `server/seed/news.js`,
     ảnh ở `public/assets/news/`. Seed một lần (`more_news_version`), bỏ qua
     tiêu đề đã có. Tổng 24 tin, đủ cho huy hiệu "Mọt tin" (10 tin).
   - Tabbar Ekko Lover (Heo cá nhân / Heo Dream Team), mascot đậu ở nút tròn
     giữa thanh. Heo Dream Team: ID riêng mỗi người (chép được), mời bạn bằng
     ID, mỗi heo một đội, xếp theo cấp heo, nhắc giữ streak — xem README mục
     "Heo Dream Team".
   - XP từ Dream Team: Admin đặt % XP mỗi người nhận khi bạn cùng đội kiếm XP
     (mặc định 10%); phần này có màu vàng riêng trên thanh tiến độ.
   - Đăng ký / đăng nhập bằng email + mật khẩu để thử nghiệm nội bộ (cần mã
     đăng ký nội bộ, Admin đặt lại mật khẩu, cấp quyền quản trị). Khi chạy thật
     qua SSO đặt `EKKO_LOCAL_AUTH=0`. Không dùng được trên Vercel (database
     mất mỗi lần khởi động) — xem README mục "Đăng ký / đăng nhập bằng email".

1. **Slide bài học ở Ekko Lover** cao kín màn, không còn khoảng trắng dưới thẻ.
   Code nằm ở `public/app/views/lesson.js`, có hai cơ chế:
   - `slide-layout.json`: ảnh slide (700 × 960) tách thành các khối chữ/hình
     rồi xếp lại. Sinh lại bằng `python3 tools/slide-layout.py` khi thêm hoặc
     sửa ảnh slide.
   - `slide-native.json`: 80 slide nhiều chữ dựng lại bằng chữ thật lấy từ
     Figma. Dữ liệu Figma đã trích sẵn ở `tools/figma/slides.json`. Sinh lại
     bằng `python3 tools/slide-native.py --only tools/figma/native-list.json`.
     Muốn lấy lại dữ liệu sau khi sửa Figma thì phải trích lại qua plugin
     Figma Desktop.
2. **Nhận thưởng huy hiệu (Ekko Lover):**
   - Đạt huy hiệu thì XP chưa vào ngay. Người dùng bấm "Nhận thưởng ngay"
     trong trang Huy hiệu thì mới được cộng.
   - Code: `claimBadge` trong `server/services/progression.js`, API
     `POST /api/me/badges/:code/claim`, cột `user_badges.claimed_at`.
   - Concept khác vẫn cộng XP ngay lúc trao.
3. **Màn chủ Ekko Lover:**
   - Thẻ hồ sơ có thẻ "Quay lại bài học" ngay bên dưới.
   - Mascot kéo thả được, ấn giữ để ghi nhanh.
   - Ghi nhanh xong thì màn trượt tới "Ghi chép chi tiêu hôm nay".
4. **Video giới thiệu** tính năng Học tập nằm ở
   `public/assets/video/ekko-hoc-tap.mp4` (bản 1080p nhẹ cho web), phát ở tab
   Giới thiệu của trang preview.
   - 10/2026: dựng lại theo app mới (2:26, giọng đọc máy "Linh", thêm cảnh XP,
     thử thách, AI tư vấn / ghi nhanh, tiết kiệm, Heo Dream Team, Cuộc đua
     Ekko Lover tháng 10 với giải 2 triệu / 1 triệu / 500 nghìn, cảnh cuối có
     QR + mã đăng ký 95KEXN7E — đổi mã trong Admin thì phải dựng lại video). Nguồn dựng
     ở `video-src/` (xem README trong đó). Bản cũ giữ ở `ekko-hoc-tap-v1.mp4`,
     tab Giới thiệu đặt hai bản cạnh nhau để so sánh.

## Deploy

- **Môi trường doanh nghiệp / thử nghiệm nội bộ:** làm theo `DEPLOY.md` (Docker,
  systemd + Nginx, hoặc Render qua `render.yaml`). Mẫu cấu hình trong `deploy/`,
  danh sách biến môi trường trong `app/.env.example`.

- **Vercel:** dự án `ekko-gdtc`, team `ekko8`. Deploy bằng
  `vercel deploy --prod --yes --scope ekko8` chạy trong `app/`.
  - Cần được mời vào team mới deploy được.
  - Bản demo dựng lại database mỗi lần Vercel khởi động hàm mới, nên dữ liệu
    trên đó chỉ là tạm.
- **GitHub:** repo riêng tư `cuongbd-glitch/ekkogd`. Cần được thêm quyền mới
  xem được lịch sử commit. Gói zip này **không kèm lịch sử git**.
- Không đặt `ANTHROPIC_API_KEY` trên Vercel.

## Không có trong gói (cố ý)

- `app/.env`, `app/.env.local`: khoá API và token riêng của từng máy. Tạo lại
  từ `.env.example`.
- `app/data/`: database chạy máy nào máy đó tự tạo.
- `.vercel/`: liên kết với tài khoản Vercel của người deploy.
- Bản video 1080p chất lượng cao, bản 4K và storyboard: gửi riêng nếu cần.
