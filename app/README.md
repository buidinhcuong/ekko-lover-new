# Ekko · Giáo dục tài chính

Tính năng Giáo dục tài chính dạng gamification cho app Ekko (tab Học tập). Màn
chính là hồ sơ chú heo của người học — cấp độ, XP, chuỗi ngày học — cùng năm chức
năng: Học tập, Mục tiêu, Ngân sách, Ghi chép chi tiêu và Tiết kiệm.

Dự án gồm hai phần chạy chung một máy chủ:

| Phần | Đường dẫn | Dành cho |
|---|---|---|
| **Cổng preview** | `/` | Xem cả hai giao diện trong hai tab |
| App người học (mobile first) | `/app/` | Nhân viên, mở từ app Ekko bằng SSO |
| Admin portal | `/admin/` | Quản trị viên nội dung |

---

## Chạy dự án

Yêu cầu **Node.js 22.5 trở lên** (dự án dùng `node:sqlite` có sẵn trong Node).
Không có dependency nào, không cần `npm install`, không cần bước build.

```bash
cd app && npm start
```

Mở trình duyệt:

- `http://127.0.0.1:4321/` — **cổng preview**, hai tab: App người dùng và Admin portal
- `http://127.0.0.1:4321/dev/login` — vào thẳng app với tài khoản nhân viên demo
- `http://127.0.0.1:4321/dev/login?role=admin` — vào thẳng Admin portal

Các lệnh khác:

```bash
npm run dev     # tự khởi động lại khi sửa file
npm run smoke   # chạy bộ kiểm thử end-to-end (235 kiểm tra)
npm run reset   # xoá cơ sở dữ liệu để tạo lại dữ liệu mẫu
```

Dữ liệu nằm ở `app/data/gdtc.sqlite`. Nội dung khoá học được nạp tự động khi
khởi động lần đầu.

### Dữ liệu mẫu cho các chức năng

Tài khoản mới chỉ có vài khoản chi, nên màn Ngân sách, Nhiệm vụ, Tiết kiệm…
trông trống. `tools/seed-demo.mjs` sinh số liệu như người thật đang dùng: lương
và thu nhập phụ, vài trăm khoản chi trải đều mỗi ngày, ngân sách từng tháng,
mục tiêu có các lần nạp, nhiệm vụ có các việc, sổ tiết kiệm.

```bash
node tools/seed-demo.mjs               # tài khoản quản trị — cái preview đang xem
node tools/seed-demo.mjs --user all    # mọi tài khoản (số liệu Admin portal cũng có ý nghĩa)
node tools/seed-demo.mjs --months 6    # trải dài 6 tháng, mặc định 3
```

Tắt server trước khi chạy. Script **chỉ thêm, không xoá** dữ liệu có sẵn, và tự
chụp một bản sao lưu `data/backup-before-demo-<thời điểm>.sqlite` trước khi ghi
— muốn quay lại thì chép bản đó đè lên `gdtc.sqlite`.

Ghi thẳng vào bảng chứ không gọi API, vì đi qua API thì mỗi khoản chi đều cộng
XP, tính chuỗi ngày và trao huy hiệu. Số ngẫu nhiên đi từ hạt giống cố định
(`--seed`, mặc định 42) nên chạy lại ra đúng bộ số cũ. Mỗi tài khoản đã sinh rồi
được đánh dấu trong bảng `settings`; chạy lần hai sẽ dừng, trừ khi có `--force`.

Tham số được cân để một tháng chi khoảng 11 triệu trên thu nhập 12 triệu: tháng
nào cũng có nhóm vượt ngân sách và nhóm còn dư, nên màn hình có đủ các trạng thái
mà không phi lý.

---

## Cổng preview

Trang gốc `/` nhúng **cả hai giao diện thật** trong hai tab, không phải ảnh chụp:
bấm, cuộn, học bài, sửa nội dung đều hoạt động bên trong iframe.

Tab được tạo **lười**: iframe chỉ dựng khi bạn mở tab đó lần đầu, và giữ nguyên
sau đó, nên quay lại tab cũ không mất chỗ đang xem.

**Cả hai tab dùng chung một phiên đăng nhập**, nên tài khoản demo của trang này
phải có quyền quản trị: chỉ có một cookie phiên, không thể vừa là nhân viên vừa
là quản trị viên. Vì vậy app người dùng trong tab 1 hiển thị đúng tiến độ của tài
khoản quản trị đó. Muốn xem bằng con mắt của một nhân viên thuần thì mở
`/dev/login` ở tab trình duyệt riêng.

Khung iPhone trong tab 1 cần chiều cao iframe từ 680px trở lên. Trên màn hình
thấp hơn (ví dụ laptop 720p), khung tự biến mất và app chạy tràn viền — vẫn dùng
được, chỉ là không còn hình chiếc điện thoại.

---

## Khung máy iPhone

Toàn bộ giao diện người học chạy bên trong khung iPhone lấy từ `iphone mockup.fig`.
Vùng màn hình trong ảnh khung là **trong suốt**, nên đây không phải ảnh chụp dán
vào: app thật chạy xuyên qua khung, bấm và cuộn được bình thường.

Số đo lấy trực tiếp từ file Figma:

| | Giá trị |
|---|---|
| Khung máy | 450 × 920 pt |
| Vùng màn hình | 402 × 874 pt, lệch (24, 23) |
| Dynamic Island | đã vẽ sẵn trong ảnh khung |
| Thanh trạng thái | không có trong ảnh, được dựng lại bằng HTML |

Mọi kích thước bên trong tính theo phần trăm của khung, nên khung tự co lại vừa
cửa sổ mà chữ vẫn nét (không dùng `transform: scale`).

Bên trong có **hai lớp lồng nhau, và đó là chủ đích**:

- `.device__screen` mang `transform`, làm mốc neo cho `position: fixed`, nhưng
  **không cuộn**.
- `.device__scroll` bên trong mới là phần cuộn, chứa nội dung app.

Gộp hai lớp làm một sẽ hỏng: `transform` biến `position: fixed` thành neo theo
hộp của phần tử chứ không theo khung nhìn, nên thanh trạng thái, nút Ekko bot và
home indicator sẽ trôi theo nội dung khi cuộn. Tách ra thì các lớp nổi (nút bot,
nút hành động chính, trình phát bài học, bottom sheet, toast, màn chúc mừng)
đứng yên đúng như trên máy thật.

**Đổi màu vỏ máy:** sửa `data-device` trên `.device` trong
`public/app/index.html` thành `black`, `natural` hoặc `copper` (ba biến thể có
sẵn trong file Figma).

**Trên máy thật khung sẽ tự biến mất.** Dưới 768px ngang hoặc 680px dọc, app
chạy tràn viền và nhường thanh trạng thái lại cho hệ điều hành, vì vẽ một chiếc
điện thoại bên trong một chiếc điện thoại thì vô nghĩa.

Đồng hồ trên thanh trạng thái hiển thị **giờ thật** theo múi giờ Việt Nam chứ
không đứng yên ở 9:41.

---

## Đăng nhập một lần (SSO) từ app Ekko

App Ekko là nguồn danh tính duy nhất. Nó ký một JWT (HS256) bằng bí mật dùng
chung `EKKO_SSO_SECRET` rồi mở webview tới dịch vụ này.

**1. Tạo token** (hạn dùng nên ≤ 5 phút):

```json
{
  "sub": "ma-nhan-vien-trong-he-thong-ekko",
  "name": "Trần Bảo Ngọc",
  "email": "ngoc.tran@congty.vn",
  "avatar": "https://...",
  "employer": "Công ty TNHH Minh Phát",
  "employer_id": "CT-00123",
  "role": "member",
  "exp": 1767225600
}
```

Chỉ `sub` là bắt buộc. `role: "admin"` cấp quyền vào Admin portal; ngoài ra có
thể liệt kê email quản trị trong biến môi trường `EKKO_ADMIN_SUBJECTS`.

`employer` (tên công ty) và `employer_id` (mã công ty ổn định trong hệ thống
Ekko) dùng để Admin lọc mọi số liệu theo từng công ty onboard. Nên gửi cả hai:
Admin nhóm theo `employer_id`, tên chỉ để hiển thị — đổi hay viết khác tên
công ty vẫn là một công ty. Thiếu mã thì nhóm theo tên.

**2. Mở webview:**

```
https://<host>/sso?token=<jwt>&redirect=/app/
```

**3.** Dịch vụ xác thực token, tạo hoặc cập nhật hồ sơ người học, đặt cookie
phiên (`HttpOnly`, `SameSite=Lax`, 30 ngày) rồi chuyển hướng tới `redirect`.
Tham số `redirect` chỉ nhận đường dẫn cùng miền, nên token không thể bị dùng để
đẩy người dùng ra trang ngoài.

Xem mẫu token thật để đối chiếu khi tích hợp:

```bash
curl "http://127.0.0.1:4321/dev/sso-token?sub=nv-001"
```

### Đăng ký / đăng nhập bằng email (thử nghiệm nội bộ)

Trong lúc chưa nối SSO với app Ekko, người thử nghiệm tự tạo tài khoản ở `/app/`
(`server/services/localAuth.js`, màn `public/app/auth.js`). Tắt hẳn bằng
`EKKO_LOCAL_AUTH=0` khi chạy thật.

- **Đăng ký** cần tên, email, mật khẩu (≥ 8 ký tự) và **mã đăng ký nội bộ**. Mã
  in ra terminal lúc server khởi động; xem / đổi / đóng đăng ký ở Admin → Người
  học. Tài khoản là người dùng bình thường (`ekko_user_id = local:<email>`).
- **Đăng nhập**: email + mật khẩu, cookie phiên 30 ngày như SSO. Sai 5 lần liền
  thì khoá 15 phút; thêm giới hạn 30 lần thử / 10 phút mỗi IP. Sai email hay sai
  mật khẩu đều báo cùng một câu.
- Mật khẩu băm scrypt (muối riêng từng tài khoản), không lưu bản gốc.
- **Quên mật khẩu**: chưa gửi email được, nên Admin → Người học → **Đặt lại mật
  khẩu** tạo mật khẩu tạm `Ekko-XXXX-XXXX` (hiện một lần). Người dùng đổi lại ở
  Cấp độ heo → Tài khoản → Đổi mật khẩu. Ở đó cũng có **Đăng xuất**.
- **Quyền quản trị**: email nằm trong `EKKO_ADMIN_SUBJECTS` thành admin khi đăng
  ký; Admin cũng cấp / bỏ quyền ở Admin → Người học (không tự bỏ quyền của mình).
  Email chưa được xác minh, nên giữ kín mã đăng ký.
- Admin portal có ô đăng nhập email + mật khẩu và nút Đăng xuất ở cuối thanh bên.
- **Lưu ý Vercel**: database ở `/tmp`, dựng lại mỗi lần khởi động — tài khoản
  và mật khẩu sẽ mất. Thử nghiệm nội bộ cần máy chủ có ổ đĩa bền.

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `4321` | Cổng máy chủ |
| `EKKO_SSO_SECRET` | tự sinh và lưu lại | Bí mật dùng chung với app Ekko |
| `EKKO_SESSION_SECRET` | tự sinh và lưu lại | Bí mật ký cookie phiên |
| `EKKO_ADMIN_SUBJECTS` | `admin@ekko.vn,cuongbd@ekko.vn` | Danh sách email/ID được cấp quyền quản trị |
| `EKKO_APP_URL` | `https://ekko.vn` | Nơi quay về khi đăng xuất |
| `EKKO_TZ` | `Asia/Ho_Chi_Minh` | Múi giờ dùng để tính ngày cho streak |
| `EKKO_DATA_DIR` | `app/data` | Thư mục chứa SQLite |
| `EKKO_LOCAL_AUTH` | bật | `0` = tắt đăng ký / đăng nhập bằng email (khi chạy thật qua SSO) |
| `EKKO_SIGNUP_CODE` | tự sinh, in ra lúc khởi động | Mã đăng ký nội bộ; đặt biến này thì Admin không sửa được mã |
| `ANTHROPIC_API_KEY` | trống | Bật AI cho: ghi nhanh chi tiêu, đọc ảnh hoá đơn, tư vấn mục tiêu, trả lời dự phòng của Ekko bot |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Model dùng cho các việc trên |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Địa chỉ Messages API (proxy, kiểm thử) |
| `NODE_ENV` | `development` | Đặt `production` để tắt `/dev/login` và dữ liệu mẫu |

Ở môi trường thật, **bắt buộc** đặt `EKKO_SSO_SECRET`, `EKKO_SESSION_SECRET` và
`NODE_ENV=production`.

---

## Luật trò chơi hoá

### Streak

- Hành động **đầu tiên trong ngày** cộng +1 streak: hoàn thành một bài học, hoặc
  **làm một việc** trong một chức năng — lưu hạn mức ngân sách, đặt / tư vấn một
  mục tiêu, ghi một khoản chi, thêm khoản tiết kiệm, làm việc trong kế hoạch.
  (Nạp tiền vào mục tiêu chỉ còn ở hai concept không phải Ekko Lover.)
- **Mở một chức năng lên xem thì không được gì**: không XP, không streak, không
  ghi vào nhật ký hoạt động. Đọc dữ liệu chỉ là đọc dữ liệu.
- Các lần sau trong cùng ngày không cộng thêm, nên không thể "cày" streak bằng
  cách vào ra một màn hình.
- Nghỉ một ngày thì chuỗi **bị đóng băng** chứ chưa mất. Đóng băng tối đa **3 ngày**.
- Quay lại trong thời gian đóng băng: chuỗi tiếp tục và +1.
- Quá 3 ngày đóng băng mà vẫn không hoạt động: mất chuỗi, lần sau bắt đầu lại từ 1.

Tính theo số ngày cách nhau kể từ lần hoạt động gần nhất:

| Cách | Kết quả |
|---|---|
| 0 ngày | Đã tính hôm nay, không đổi |
| 1 ngày | Ngày liên tiếp, +1 |
| 2 – 4 ngày | Đã dùng 1 – 3 ngày đóng băng, chuỗi vẫn sống, +1 |
| ≥ 5 ngày | Mất chuỗi, về 1 |

Mọi phép tính chạy trên **ngày theo lịch ở múi giờ Việt Nam**, không phải trên
mốc thời gian UTC, nên học lúc 23:50 và 00:10 được tính là hai ngày khác nhau.

### Cấp độ và XP

Mười cấp độ ("Cấp độ heo"), mỗi cấp có một icon, ảnh nhân vật heo, và một ô
**Phúc lợi** để ghi người học được gì khi đạt cấp đó:

| Cấp | Icon | Tên | XP tối thiểu | Ảnh heo |
|---|---|---|---|---|
| 1 | `plant-02` | Heo Mầm Non | 0 | pig-1 |
| 2 | `backpack-01` | Heo Đi Học | 200 | pig-study (dựng từ pig-1) |
| 3 | `mortarboard-01` | Heo Học Việc | 500 | pig-2 |
| 4 | `briefcase-01` | Heo Nhân Viên | 1.000 | pig-office (dựng từ pig-4: sơ mi trắng, quần âu đen) |
| 5 | `house-03` | Heo Gia Đình | 1.700 | pig-family (pig-3 + heo con) |
| 6 | `sparkles` | Heo Phát Triển | 2.500 | pig-grow (dựng từ pig-3) |
| 7 | `piggy-bank` | Heo Tích Lũy | 3.500 | pig-3 |
| 8 | `money-bag-02` | Heo No Đủ | 4.800 | pig-4 |
| 9 | `chart-increase` | Heo Đầu Tư | 6.500 | pig-5 |
| 10 | `crown` | Heo Thịnh Vượng | 8.500 | pig-6 |

Sáu cấp gốc giữ nguyên ngưỡng XP; bốn cấp 2, 4, 5, 6 thêm sau, chen vào giữa. Khi
nâng database cũ, `expandToTenLevels` (server/seed/index.js) dời sáu cấp cũ sang vị
trí mới — giữ id, phúc lợi, ảnh — rồi chèn bốn cấp mới, đổi số cấp mở khoá mô-đun
và huy hiệu "đạt cấp N" theo, và tính lại cấp của mọi người theo XP.

Nguồn XP: mỗi bài học hoàn tất (**30**), lần đầu hoàn thành bài test của một mô
đun (**50**), **check-in** lần đầu vào màn chính trong ngày (**10**, chỉ Ekko
Lover, không tính streak), **làm một việc** trong một chức năng lần đầu trong
ngày (cột "XP mỗi ngày"), thử thách, và thưởng kèm huy hiệu. Ba mức đầu là cài
đặt chung (setting `lesson_xp`, `module_quiz_xp`, `checkin_xp`), Admin sửa ở trang
**Chức năng → XP học tập & check-in**. XP cố định theo từng bài và thưởng hoàn thành trọn mô đun đã bỏ
(hai cột `xp_reward` của `lessons`, `modules` bị xoá khi khởi động).

> **Nhịp lên cấp.** XP kiếm được bao nhiêu cộng bấy nhiêu, không giới hạn theo
> ngày, nên thang cấp được giãn để cấp 10 cần thời gian thật:
>
> - Học dồn cả khoá trong một ngày (1.020 XP bài học + 400 XP bài test + 1.140 XP
>   huy hiệu học tập, khoảng 2.560 XP) là lên cấp 6.
> - Người cày tối đa (ngày đầu khoảng 5.200 XP nhờ đạt mọi huy hiệu làm được
>   ngay, sau đó khoảng 125 XP/ngày từ chức năng và thử thách) mất khoảng 25 ngày.
> - Ước tính: người chăm (mỗi ngày 1 bài, 2 chức năng) khoảng 2,5 tháng; người
>   đều đặn (4 bài/tuần, 5 ngày/tuần) khoảng 4 tháng.
> - Các ước tính này tính 15 XP mỗi ngày cho chức năng. Đặt chức năng về 0 XP thì
>   thời gian dài ra đáng kể (người chăm khoảng 3,5 tháng), nên hạ ngưỡng cấp theo.
> - Thêm huy hiệu hay thử thách có nhiều XP là rút ngắn các con số trên; khi đó
>   nên nâng ngưỡng cấp theo.
>
> Database cũ được đổi ngưỡng một lần (`rebalanceXp` trong `server/seed/index.js`),
> chỉ ở những cấp còn đúng ngưỡng của một bản thang trước. Ô cảnh báo trong trang
> Cấp độ sẽ nhắc nếu các ngưỡng không còn tăng dần.


### Huy hiệu

Huy hiệu được xét lại sau **mỗi** hành động có thưởng, và không bao giờ bị thu
hồi. Mỗi huy hiệu là một luật gồm loại điều kiện + ngưỡng (+ phạm vi tuỳ chọn),
thuộc một **nhóm**, cấu hình trong Admin portal. Mã nội bộ do server tự sinh từ
tên hiển thị, Admin không nhập và không thấy.

| Nhóm | Điều kiện dùng được |
|---|---|
| Học tập | `lessons_completed`, `modules_completed` (phạm vi = slug một mô đun), `quiz_perfect` |
| Thói quen | `streak_days`, `streak_recovered` |
| Ghi chép chi tiêu | `expenses_logged`, `expense_days_streak`, `quick_logs` |
| Ngân sách | `budgets_created`, `budget_months_kept` |
| Mục tiêu & Tiết kiệm | `goals_created`, `goals_completed`, `goal_deposits`, `feature_used` (phạm vi = savings) |
| Khám phá | `bot_chats`, `features_distinct`, `news_read` |
| Cấp độ | `level_reached`, `xp_total` |

Bộ khởi tạo có 41 huy hiệu, xếp thành các **chuỗi** Đồng → Bạc → Vàng (cùng nhóm,
cùng điều kiện, ngưỡng tăng dần), ví dụ Chăm học: 1 · 10 · 34 bài. Mười hai mã của
bộ cũ giữ nguyên vì `user_badges` đang trỏ vào.

Ở Ekko Lover, trang Huy hiệu chia tab theo nhóm. Mỗi chuỗi chỉ hiện **một ô**: bậc
đang chờ nhận thưởng, nếu không có thì bậc kế tiếp kèm thanh tiến độ ("7/10"),
xong hết thì bậc cao nhất; bấm vào để xem cả chuỗi. Thứ tự: chờ nhận → đang làm
(gần xong lên trước) → đã xong. Hai concept còn lại giữ lưới huy hiệu như cũ.

### Thử thách

Việc nhỏ tự làm mới, tách khỏi huy hiệu. Gọi là "thử thách" vì "Nhiệm vụ" đã là
tên chức năng `plans`. Quản lý ở trang **Thử thách** của Admin portal, code ở
`server/services/challenges.js`.

| Kỳ | Cách hiện | Thưởng thêm |
|---|---|---|
| Chặng khởi đầu (`once`) | 4 bước cho người mới: đặt mục tiêu, lập ngân sách, ghi khoản chi, học bài. Ẩn khi đã nhận hết | 40 XP khi xong cả chặng |
| Hằng ngày (`daily`) | Mỗi ngày chọn 3 trong bộ, cố định theo người dùng + ngày | 20 XP khi nhận đủ 3 |
| Hằng tuần (`weekly`) | Hiện hết, tuần tính từ thứ Hai | — |

- Tiến độ tính thẳng từ dữ liệu gốc trong đúng kỳ, không có bộ đếm riêng.
  `user_challenges` chỉ ghi phần thưởng đã nhận.
- Người học bấm "Nhận" ở đầu trang Huy hiệu (Ekko Lover) để lấy XP.
- Mở đọc một tin tức được ghi vào nhật ký (`news_read`, không XP, không streak)
  cho huy hiệu "Mọt tin" và thử thách "Đọc 1 tin".
- Tin tức: 4 tin gốc (`NEWS` trong seed/catalogue.js) + 20 tin đợt hai
  (`seed/news.js`, ảnh ở `public/assets/news/`, bản tiếng Anh để ngay cạnh và
  ghép vào `server/i18n/en.js`). Đợt hai seed một lần theo `more_news_version`,
  bỏ qua tin trùng tiêu đề; tin Admin đã xoá không quay lại. Bài dạng kiến thức
  dùng lâu, không nêu lãi suất, giá vàng hay quy định có ngày tháng.

---

## Điều hướng

Màn chính (hồ sơ heo) **là** trung tâm điều hướng: hàng năm nút dẫn tới Học tập
và các chức năng, thẻ hồ sơ dẫn tới Huy hiệu. Từ mọi màn hình con, nút `←` bên
trái thanh HUD lùi đúng một bước về màn trước đó.

**Tabbar (chỉ Ekko Lover)** ở đáy hai màn gốc: **Heo cá nhân** (`/`, màn chính) và
**Heo Dream Team** (`/team`). Nút tròn giữa thanh là mascot Ekko đậu vào
(`app/tabbar.js`, `app/mascot.js`): chạm mở Ekko bot, ấn giữ 2 giây thì ô ghi
nhanh trượt lên trên thanh. Ở các màn con không có tabbar, mascot nổi và kéo
được như cũ. Tab Dream Team có chấm đỏ khi có lời mời vào đội hoặc lời nhắc giữ
streak chưa xem. Hai concept còn lại không có tabbar.

### Heo Dream Team

`server/services/teams.js`, `routes/team.js`, màn `views/team.js`.

- Mỗi người dùng có một **ID** riêng dạng `EK` + 6 ký tự (bỏ 0/O, 1/I/L cho đỡ
  nhầm), lưu ở `users.friend_code`, tạo lần đầu cần tới. ID hiện ở thẻ hồ sơ heo
  và đầu màn Dream Team, bấm để chép.
- **Mời bạn** bằng ID (gõ thường hay có gạch đều được). Lời mời là "vào đội hiện
  tại của người mời"; người mời chưa có đội thì đội được lập khi lời mời đầu tiên
  được chấp nhận, người mời làm trưởng đội. Tối đa 10 heo một đội (`MAX_TEAM`).
- **Mỗi heo chỉ ở một đội** (`team_members.user_id` là khoá chính). Đang ở đội có
  người khác thì nút Đồng ý bị khoá — phải **Rời đội** trước. Đội chỉ có mình thì
  tự giải tán khi vào đội khác. Trưởng đội rời đi thì người vào sớm nhất lên thay;
  đội hết người thì xoá. Rời / đổi đội thì huỷ các lời mời mình đã gửi.
- Danh sách thành viên xếp theo **cấp heo rồi XP**: tên, cấp, XP, thanh tiến độ
  lên cấp, streak và trạng thái hôm nay (đã giữ streak / đã vào app nhưng chưa
  giữ / chưa vào app). Thành viên không thấy chi tiêu, ngân sách hay mục tiêu của nhau.
- **Nhắc giữ streak**: bấm được khi bạn đó hôm nay chưa giữ streak; mỗi người nhắc
  một bạn tối đa một lần mỗi ngày (`team_nudges`). Người được nhắc thấy thông
  báo ở màn chính (một lần) và ở đầu màn Dream Team. Chưa có thông báo đẩy ra
  ngoài app — cần app Ekko gửi push nếu muốn nhắc cả khi người dùng chưa mở app.
- "Đã vào app hôm nay" = đã tải màn chính trong ngày (`user_state.last_open_day`).
- **XP từ Dream Team**: một bạn trong đội kiếm XP (bài học, bài test, check-in,
  huy hiệu, thử thách) thì mỗi bạn còn lại nhận thêm `XP × %` (làm tròn xuống;
  mặc định 10%, Admin → Chức năng → **XP từ Heo Dream Team**, 0 = tắt).
  Chỉ tính XP kiếm trong lúc đang chung đội; XP nhận từ đội không chia tiếp cho
  ai (`shareXpWithTeam` trong services/teams.js, ghi nhật ký `team_xp`). Thanh
  tiến độ (thẻ heo + HUD) tô phần này màu vàng sau phần tự kiếm, kèm dòng
  "N XP từ Dream Team"; sang cấp mới thì đếm lại (`user_state.team_xp_level`).

Đáy màn hình được làm mờ dần thay cho thanh tab, để nút hành động và Ekko bot
không trôi lơ lửng trên chữ.

---

## Hai ngôn ngữ: tiếng Việt và tiếng Anh

App người dùng chạy được ở hai thứ tiếng. Tiếng Việt là bản gốc; tiếng Anh là bản
dịch. Nút chuyển nằm **ngoài khung điện thoại**, góc trên phải trang: nó là công
cụ của bản demo, không phải một phần giao diện app, nên không chiếm chỗ trong màn
hình 402pt. Lựa chọn được nhớ trong `localStorage`, và `?lang=en` cho phép mở
thẳng bản tiếng Anh (tiện khi gửi link hoặc chụp ảnh).

Admin portal **không** đổi ngôn ngữ: đó là nơi biên tập bản gốc tiếng Việt.

### Hai lớp, hai chỗ

| Lớp | Ở đâu | Cách làm |
|---|---|---|
| Câu chữ giao diện | `public/app/i18n.js` | `t('câu tiếng Việt')` ngay tại chỗ dùng |
| Nội dung (bài học, nhóm chi tiêu, huy hiệu, cấp độ…) | `server/i18n/en.js` | dịch một lần lúc gói JSON trả về |

Cả hai bảng đều **tra theo chính câu tiếng Việt**, không theo mã khoá. Lý do:
chỗ gọi vẫn đọc được bằng tiếng Việt; thiếu bản dịch thì tự rơi về tiếng Việt
chứ không lòi ra `hud.back`; và bảng đọc như một bảng đối chiếu song ngữ nên
người viết nội dung soát được mà không cần mở mã.

Nội dung nằm trong cơ sở dữ liệu và do Admin biên tập, nên bản dịch **không** để
trong bảng dữ liệu: thêm cột `*_en` là bắt Admin nhập hai lần và mỗi bảng lại
thêm một chỗ phải sửa. Thay vào đó app người dùng gửi header `x-lang`, và
`server/index.js` dịch **một chỗ duy nhất** — lúc `sendJson` — bằng cách đi hết
cây JSON và đổi mọi chuỗi khớp trọn vẹn một khoá trong bảng. Hệ quả: sửa một câu
tiếng Việt trong Admin thì bản dịch của câu đó rơi ra ngoài bảng và câu ấy hiện
tiếng Việt — đúng như vậy, vì nội dung mới thì phải dịch lại.

Chữ do **người dùng tự gõ** (ghi chú khoản chi, tên mục tiêu, câu nhắn cho Ekko
bot) không bao giờ bị dịch.

### Số, tiền và ngày

Tiền vẫn là VNĐ ở cả hai ngôn ngữ, chỉ cách viết đổi: `50.000đ` ↔ `50,000đ`.
Ngày tiếng Anh viết tên tháng (`10 Sep 2026`) vì `10/09` đọc ra hai ngày khác
nhau tuỳ người. Tên tháng của màn Ngân sách cũng vậy: "Tháng 9/2026" ↔
"September 2026" — dịch từng chữ sẽ ra "Month 9/2026".

### Ekko bot

Bot trả lời bằng ngôn ngữ đang chọn, và **sổ hội thoại cũng đọc lại được ở ngôn
ngữ khác**. Câu do máy sinh ra không chỉ lưu chữ: nó lưu kèm mẫu câu và dữ liệu
thô (`meta.say`, `meta.logged`), nên mở lại sổ bằng tiếng Anh thì câu nói tháng
trước được dựng lại nguyên số liệu của tháng trước, chứ không tính lại theo hôm
nay. Câu trả lời tự do của phần AI thì giữ nguyên như lúc nói.

Phần dò ý định nhận từ khoá cả hai thứ tiếng, và việc tìm trong nội dung bài học
chạy trên **bản đã dịch** — câu hỏi tiếng Anh mà đem so với nội dung tiếng Việt
thì không bao giờ khớp.

---

## Concept giao diện

Cùng một lộ trình học có thể được kể bằng nhiều cách. Mỗi cách là một **concept**;
quản trị viên chọn concept trong Admin portal (**Trò chơi hoá → Concept**) và
**chỉ một concept được bật tại một thời điểm** — hai người học mở app phải thấy
cùng một thế giới, nên đây không phải tuỳ chọn của từng người.

| | Concept | Hình hài |
|---|---|---|
| 1 | **Ekko Lover** (mặc định) | Màn chính là hồ sơ heo + năm nút chức năng; Học tập là đường mòn lượn sóng với các điểm dừng tròn |
| 2 | **Ekko Lover Colors** | Bản sao của Ekko Lover để thử phối màu: nền chuyển sắc, mỗi chức năng một màu |
| 3 | **Simple mode** | Cho người dùng khoảng 40–50 tuổi: chữ to hơn một bậc, nút lớn, màn chính rút gọn, ghi chép bằng giọng nói |

Cả ba dùng chung lộ trình Học tập (`views/explore-lover.js`) và đều khai báo
`base: 'lover'` trong `services/concepts.js`. Ekko Lover Colors chỉ khác ở CSS
dưới `html[data-concept="lover-colors"]`.

### Simple mode

- **Chữ to hơn một bậc trên toàn app.** `html[data-concept="simple"]` đổi giá trị
  các token cỡ chữ sang bậc kế tiếp của thang (12→14, 14→16, 16→18, 18→20,
  20→24…), nên mọi màn to lên cùng lúc mà không có cỡ chữ lệch thang. Nút cao
  tối thiểu 52px.
- **Màn chính riêng** (`views/home-simple.js`): lời chào + heo, nút to "Nói để ghi
  chi tiêu", chi tiêu hôm nay, ngân sách tháng (một thanh, một câu còn/vượt) và
  năm chức năng thành danh sách hàng to có một dòng giải thích. Bỏ biểu đồ nhiều
  màu, carousel tin tức, banner tổng kết và ô gõ nhanh ở đáy màn.
- **Nói để ghi** (`app/voice.js`): Web Speech API của trình duyệt (không gửi âm
  thanh lên server Ekko). Nghe → Ekko đọc lại khoản chi, số tiền, nhóm qua
  `POST /api/expenses/parse` (không lưu) → bấm "Lưu" mới ghi qua
  `/api/expenses/quick`. Máy không hỗ trợ hoặc bị từ chối micro thì chuyển sang
  ô gõ chữ to. Server đổi số đọc bằng chữ ra chữ số (`spokenToDigits` trong
  `services/nlp.js`): "ba mươi lăm nghìn" → 35.000, "một triệu hai" → 1.200.000,
  "hai triệu rưỡi" → 2.500.000.
- Onboarding, tour chỉ dẫn và ảnh minh hoạ có bản riêng cho màn của Simple mode.
- Trong app Ekko thật, webview phải được cấp quyền micro (và hỗ trợ Web Speech
  API); trang preview đã thêm `allow="microphone"` cho iframe.

Đổi concept **không đụng tới nội dung hay tiến độ**: cùng thứ tự bài, cùng luật mở
khoá, cùng số bài đã học (`GET /api/learn/map` trả cùng một danh sách chặng, kèm
trường `concept`). Concept đang bật lưu trong `settings.explore_concept`; giá trị
lạ tự lùi về Ekko Lover.

Ba concept đầu tiên (Đảo trên trời, Quần đảo so le, Lối học nút tròn) **đã bị xoá**
cùng ảnh đảo của chúng. Database đang bật một trong ba concept đó sẽ tự chuyển
sang Ekko Lover ở lần khởi động đầu tiên sau khi cập nhật.

---

## Nội dung học tập

Cấu trúc: **Mô-đun** → **Bài học** → các trang, cộng một **bộ trắc nghiệm cuối
mô-đun**.

Trong Admin portal, mỗi mô-đun là một thẻ mở rộng được. Gập lại chỉ thấy emoji,
tên và mô tả; mở ra thấy bảng bài học và toàn bộ câu hỏi cuối mô-đun trong cùng
một chỗ.

### Bài học

Một bài học là **một danh sách trang có thứ tự**, trộn ba loại tuỳ ý:

| Loại trang | Nội dung |
|---|---|
| **Chữ + hình** | Trang chữ kèm ảnh và chú thích |
| **Hình tương tác** | Ảnh có các điểm chạm, mỗi điểm mở một mẩu nội dung |
| **Slide ảnh** | Ảnh toàn trang, tỉ lệ **1 : 1,371** |

Trình soạn chỉ có **một danh sách** và ba nút thêm nằm cạnh nhau. Trước đây có hai
tab "Văn bản" / "Slide ảnh", mỗi tab chỉ thấy một phần các trang — trong khi người
học luôn xem theo đúng một mạch từ trang 1 đến trang cuối, nên chia tab làm người
soạn không thấy được thứ tự thật. Đổi thứ tự bằng ↑ ↓ trên cùng một danh sách;
slide tải lên được nhiều ảnh một lượt.

Cột `lessons.content_type` không còn ô chọn: nó được **suy ra** khi lưu — bài chỉ
gồm slide là `slides`, còn lại là `text`. Đó vốn là bản chất của nó, và cũng đúng
cách bộ seed suy ra kiểu cho dữ liệu cũ.

Ô nội dung nhận cú pháp rút gọn: dòng trống tách đoạn, `**đậm**`, `- ` cho gạch
đầu dòng, `> ` cho trích dẫn. Toàn bộ được escape trước khi dựng HTML, nên nội
dung do quản trị viên nhập không thể chèn mã vào trang.

Toạ độ điểm tương tác lưu theo **phần trăm** chiều rộng và chiều cao ảnh, nên
thay ảnh khác kích thước không làm lệch điểm.

### Trắc nghiệm cuối mô-đun

Câu hỏi thuộc **mô-đun**, không nằm trong bài học. Người học mở được phần trắc
nghiệm sau khi hoàn thành **tất cả** bài học của mô-đun đó.

- Chấm điểm **ở phía máy chủ**. Đáp án đúng không bao giờ được gửi ra client
  trước khi nộp, nên không thể xem trước bằng tab Network.
- Lần đầu nộp bài test của mô đun được một mức XP chung (mặc định 50), không
  phụ thuộc số câu đúng.
- Làm lại được nhưng **không được thêm XP**. Lần làm lại có điểm cao hơn vẫn được
  ghi lại, để xét huy hiệu "Điểm tuyệt đối".
- Trắc nghiệm **không chặn** việc hoàn thành mô-đun: học xong bài cuối là mô-đun
  hoàn thành (không có XP riêng, nhưng tính cho huy hiệu mô-đun).

Bộ khởi tạo có 6 mô-đun / 18 bài học / 44 trang nội dung / 18 câu hỏi (3 câu mỗi
mô-đun).

---

## Ekko bot

Mascot trả lời trong một bottom sheet, xử lý theo thứ tự ưu tiên:

1. **Ghi chi tiêu nhanh.** `"cà phê 35k"`, `"ăn trưa 60 nghìn"`, `"grab 1,2 triệu"`,
   `"mua sách 250.000đ"` đều được đọc đúng số tiền, đoán nhóm chi tiêu theo danh
   sách từ khoá và lưu ngay vào sổ. Một số chỉ được coi là tiền khi có đơn vị
   (`k`, `nghìn`, `triệu`, `đ`…) hoặc dấu phân cách hàng nghìn, nên câu
   *"quy tắc 50/30/20 là gì?"* không bị ghi nhầm thành khoản chi.
2. **Câu hỏi về số liệu của chính người dùng:** streak, cấp độ, chi tiêu tháng
   này, ngân sách còn lại, tiến độ mục tiêu, số huy hiệu.
3. **Lệnh điều hướng:** *"mở ngân sách"*, *"vào mục tiêu"*.
4. **Câu hỏi về Ekko và chương trình** (FAQ có sẵn).
5. **Tìm trong nội dung bài học** và đề xuất mở đúng bài.
6. **Dự phòng bằng Claude** — chỉ khi có `ANTHROPIC_API_KEY`. Không có key thì bot
   chạy hoàn toàn ngoại tuyến.

Từ khoá phân loại chi tiêu nằm ở mục **Nhóm chi tiêu** trong Admin portal, sửa
được mà không cần đụng vào mã.

### Một dòng thời gian, hai chỗ gõ

Câu gõ ở **thanh ghi nhanh** dưới đáy màn hình cũng được ghi vào khung chat của
Ekko bot: một tin của người dùng (đúng câu đã gõ) và một tin xác nhận của bot.
Người dùng chỉ có một chỗ để xem lại "hôm qua mình đã ghi những gì", không phải
hai nơi rời rạc. Câu xác nhận dùng chung một hàm với đường chat
(`expenseLoggedReply` trong `services/botLog.js`) nên hai đường vào nói cùng kiểu.

Tin nhắn mang cột `bot_messages.source`: `chat` (gõ trong khung chat) hoặc `quick`
(gõ ở thanh ghi nhanh). Hai điều phụ thuộc vào cột này:

- Trong khung chat, tin `quick` có nhãn **ghi nhanh** (kèm icon tia chớp), để người dùng hiểu vì sao
  có tin nhắn mình không gõ ở đây.
- Huy hiệu **Bạn của Ekko bot** chỉ đếm `source = 'chat'`. Ghi nhanh 20 khoản
  không làm bạn thành "bạn của bot" — đó là ghi sổ, không phải trò chuyện.

Form **Ghi một khoản chi** (bốn ô nhập) thì *không* đồng bộ vào chat: nó là một
biểu mẫu, không phải một câu nói.

---

## Ba chức năng

- **Lập ngân sách** — thu nhập tháng, hạn mức từng nhóm, đối chiếu với chi tiêu
  thực tế theo thanh tiến độ. Cảnh báo khi một nhóm vượt hạn mức.
- **Mục tiêu tài chính** — chọn từ bộ mục tiêu gợi ý rồi bấm **Tư vấn**: AI phân
  tích tính khả thi và lưu mục tiêu kèm lời tư vấn (Ekko Lover). Hai concept còn
  lại vẫn có kỳ tiết kiệm và nạp nhanh theo các mức có sẵn.
- **Ghi chép chi tiêu** — nhập tay, gõ vào thanh ghi nhanh ở đáy, hoặc nhắn cho
  Ekko bot; tổng hợp theo ngày và theo nhóm.

### Mục tiêu tài chính: chọn trước, sửa sau

Màn hình có **hai tab** ghim ngay dưới HUD:

| Tab | Nội dung |
|---|---|
| **Mục tiêu của bạn** | các mục tiêu đang chạy, lời tư vấn, sửa, xoá (tiến độ và nạp nhanh chỉ ở concept khác Ekko Lover) |
| **Đặt thêm mục tiêu** | bộ mục tiêu gợi ý xếp theo nhóm |

Chưa có mục tiêu nào thì màn hình mở thẳng vào tab gợi ý — tab kia không có gì để
xem. Lưu xong một mục tiêu mới thì về lại tab **Mục tiêu của bạn**, đúng chỗ vừa
thêm vào.

#### Tư vấn trước khi tạo (Ekko Lover)

- Nhóm mục tiêu gợi ý là một hàng tab, **Tự do** đứng đầu.
- Form tạo mới không hỏi kỳ tiết kiệm. Nút cuối form là **Tư vấn** thay cho Lưu.
- **Tư vấn** gọi `POST /api/goals/advice` (`services/goalAdvisor.js`). Có kết quả
  tư vấn là mục tiêu được **ghi ngay vào danh sách**, kèm lời tư vấn (cột
  `goals.advice`, hiện thành dòng "Khả thi · …" trên thẻ mục tiêu). Tư vấn lại
  (sửa rồi bấm lần nữa, gửi kèm `goalId`) thì cập nhật đúng mục tiêu đó. Chưa đủ
  số liệu để tư vấn thì chưa lưu gì.
  - Số dùng để phân tích: thu nhập và khả năng để dành mỗi tháng, lấy theo thứ tự
    số vừa nhập → dữ liệu thật 90 ngày (thu nhập, chi tiêu; cần ít nhất 5 khoản
    chi) → số ước tính đã nhập lần trước (`user_state.est_monthly_*`).
  - Thiếu số nào thì trả `needsInfo` và app hỏi hai con số ước tính: tổng thu nhập
    và tổng tiền có thể tiết kiệm mỗi tháng.
  - Các con số (cần để dành bao nhiêu/tháng, mấy tháng thì đạt, ngày dự kiến)
    luôn tính bằng công thức. Có `ANTHROPIC_API_KEY` thì AI viết nhận xét dựa trên
    đúng các số đó (structured output, `source: 'ai'`); không có khoá hoặc lỗi thì
    nhận xét viết theo công thức (`source: 'rule'`).
  - Kết luận: **Khả thi** (để dành đủ mức cần), **Cần cố gắng** (70–99%), **Khó
    đạt đúng hạn**.
- Màn tư vấn có **Sửa mục tiêu** (về form, giữ số đã nhập), và **Huỷ** trước khi
  có kết quả / **Xem mục tiêu của bạn** sau khi đã lưu.
- Thẻ mục tiêu (Ekko Lover) không có nút nạp tiền, số đã có, thanh tiến độ hay %
  hoàn thành — chỉ số tiền mục tiêu, dòng tư vấn và mức cần để dành mỗi tháng.
  Bấm vào mục tiêu mở lại lời tư vấn đã lưu, kèm **Tư vấn lại** (cập nhật đúng
  mục tiêu đó) và **Sửa mục tiêu**.
- Không còn gì liên quan tới nạp tiền ở Ekko Lover: mức "cần để dành" tính trên
  trọn số tiền mục tiêu (bỏ qua `saved_amount` cũ), câu xác nhận xoá không nhắc
  lịch sử nạp. Huy hiệu `goal_deposits` / `goals_completed` và thử thách "Nạp vào
  mục tiêu" được tắt một lần khi khởi động (`goal_deposits_off_version`) — tắt cho
  **mọi** concept vì huy hiệu / thử thách dùng chung; Admin bật lại được. API nạp
  tiền vẫn còn cho hai concept kia.

Người dùng không bắt đầu từ một form trống. Bộ gợi ý xếp theo bốn nhóm — An toàn,
Mua sắm tài sản, Gia đình, Tự do — mỗi gợi ý là một thẻ có emoji, tên và một dòng
mô tả. Chọn một thẻ là sang màn thiết lập với **tên, số tiền và thời hạn đã điền
trước**; chỉ cần sửa cho khớp hoàn cảnh của mình.

Màn thiết lập có bốn ô: tên, số tiền mục tiêu, thời hạn, và **kỳ tiết kiệm** (mỗi
tháng hoặc mỗi tuần). Bên dưới là ô **"Ekko tính giúp bạn"**: mỗi lần sửa một ô là
nó tính lại ngay số tiền phải để dành mỗi kỳ.

```
30.000.000đ · hạn 11/02/2028 · mỗi tháng  →  1.666.667đ / tháng trong 18 tháng
30.000.000đ · hạn 11/02/2028 · mỗi tuần   →    384.615đ / tuần  trong 78 tuần
```

Vài quyết định đáng biết:

- Số kỳ đếm theo **tháng và tuần dương lịch** giữa hôm nay và thời hạn, nên "18
  tháng" là 18 lần để dành thật, không phải 18 × 30 ngày.
- Ngày "hôm nay" do server trả về (`today` trong `GET /api/goals`), tức là **ngày ở
  Việt Nam**, không phải đồng hồ của thiết bị — cùng một quy ước với luật streak.
- Bộ gợi ý nằm ở `services/goalTemplates.js` để app và Ekko bot dùng chung một
  nguồn. Số tiền và số tháng trong đó là **điểm khởi đầu hợp lý**, không phải khuyến
  nghị tài chính; muốn đổi thì sửa một chỗ.
- Mục tiêu **Tự do** cố tình để trống tên và số tiền — đó là phần người dùng tự đặt.
- Sửa một mục tiêu đã có dùng lại đúng màn đó, nên chỉ có một chỗ để bảo trì.
- `goals.period` và `goals.template` là hai cột mới, thêm bằng `ALTER TABLE ADD
  COLUMN` nên cơ sở dữ liệu đang chạy không cần làm gì.

### Tiết kiệm: lãi trả khi đáo hạn

- Như sổ tiết kiệm có kỳ hạn: trước ngày kết thúc, khoản chỉ là tiền gốc (người
  dùng có thể phá sổ, khi đó không có lãi kỳ hạn). Tới ngày kết thúc, lãi cả kỳ
  (lãi đơn: gốc × %/năm × số tháng / 12) mới được cộng vào khoản.
- Khoản không có ngày kết thúc thì không có lãi kỳ hạn; chỉ hiện lãi tham khảo
  12 tháng.
- API trả `termMonths`, `maturityOn`, `maturityInterest`, `matured`, `balance`
  (gốc, cộng lãi nếu đã đáo hạn); tổng `totals.balance`, `totals.pendingInterest`
  (lãi còn chờ đáo hạn). Xem `sourcePayload` trong `services/savings.js`.
- Ekko Lover: thẻ hiện số dư, "Gốc · Lãi khi đáo hạn", ngày đáo hạn; vuốt thẻ
  sang trái để **Sửa** / **Xoá** (mọi loại khoản).

### Phạm vi và giới hạn AI

- **Giới hạn lượt:** mỗi người tối đa `ai_daily_limit` lượt gọi AI mỗi ngày (mặc
  định 30, Admin đổi ở **Chức năng → AI**, 0 = không giới hạn), đếm chung cho Ekko
  bot, ghi nhanh, đọc hoá đơn, tư vấn mục tiêu (`services/aiQuota.js`, bảng
  `ai_calls`). Hết lượt: ghi nhanh dùng bộ đọc viết sẵn, tư vấn dùng công thức,
  Ekko bot trả câu báo hết lượt, đọc hoá đơn nhắc nhập tay.
- **Phạm vi Ekko bot:** prompt liệt kê chủ đề được / không được trả lời, và Claude
  phải trả `in_scope` (structured output). `in_scope = false` thì server bỏ phần
  AI viết, trả câu cố định và ghi câu hỏi vào `ai_out_of_scope` (Admin xem ở
  Chức năng → AI, chỉ nội dung, không kèm người hỏi). Ghi nhanh, đọc hoá đơn, tư
  vấn mục tiêu vốn chỉ trả dữ liệu theo khuôn cố định nên không trò chuyện được.
- Câu hỏi cho bot tối đa 300 ký tự, câu trả lời tối đa 4 câu. Gọi AI có hạn chờ
  (12–30 giây tuỳ tính năng) và bật server-side fallback khi bị từ chối.
- Tìm bài học của bot so khớp **nguyên từ** và cần ít nhất 2 từ / 60% số từ của
  câu hỏi, để câu kiểu "viết code giúp tôi" không lôi ra bài học chẳng liên quan.
- `ANTHROPIC_BASE_URL` (tuỳ chọn) đổi địa chỉ Messages API — dùng cho proxy, và
  cho kiểm thử với Claude giả.

### Ghi nhanh bằng AI

`services/expenseReader.js` đọc một câu thành các khoản chi, dùng chung cho thanh
ghi nhanh (`POST /api/expenses/quick`), "Nói để ghi" (`/api/expenses/parse`) và
Ekko bot.

- Có `ANTHROPIC_API_KEY`: Claude đọc câu (structured output, effort thấp, hết giờ
  sau 12 giây). Hiểu nhiều khoản trong một câu ("phở 45k, cà phê 25k"), tiếng lóng
  ("năm chục", "1 xị", "2 củ"), ngày tương đối ("hôm qua", "thứ hai").
- Nhóm chi tiêu chỉ được chọn trong đúng danh sách nhóm của Admin (enum mã nhóm),
  kèm tên, nhóm level 1 và **từ khoá** của từng nhóm — sửa từ khoá trong Admin là
  AI phân loại theo. Danh sách nhóm nằm ở đầu prompt và được cache.
- Kết quả AI luôn được kiểm lại (`sanitizeAiItems`): số tiền dương, ngày không ở
  tương lai và không quá 62 ngày trước, mã nhóm có thật. AI báo không chắc mà từ
  khoá của Admin khớp một nhóm thì theo từ khoá. Tối đa 5 khoản mỗi câu.
- Không có khoá, AI lỗi hoặc hết giờ: dùng bộ đọc viết sẵn như trước (một khoản).
- Đo độ chính xác: `node tools/eval-quicklog.mjs --verbose` (gọi API thật, dùng
  nhóm chi tiêu trong database của máy). Bộ đọc viết sẵn đạt khoảng 62% nhóm chi
  tiêu trên bộ câu mẫu này.

### Lọc theo thời gian

Màn Ghi chép chi tiêu có ba tab: **Hôm nay · Tuần này · Tháng này**. Tuần bắt đầu
từ **thứ Hai** theo cách tính của Việt Nam. Mỗi khoảng phủ trọn kỳ chứ không cắt
ở ngày hôm nay, nên một khoản ghi lùi hoặc ghi trước trong kỳ vẫn hiện ra.

Lựa chọn nằm trong URL (`#/expenses?range=week`) nên nó sống sót qua mỗi lần
render lại: ghi nhanh một khoản xong, tab đang chọn vẫn giữ nguyên.

### Thanh ghi nhanh

Đáy mọi màn hình có một ô nhập luôn sẵn sàng. Gõ đúng cách bạn nói thường ngày:

```
cà phê 35k          →  35.000đ · Ăn uống · "cà phê"
đổ xăng 120 nghìn   →  120.000đ · Đi lại · "đổ xăng"
học phí con 2,5tr   →  2.500.000đ · Gia đình · "học phí con"
```

Số tiền gõ tắt được hiểu giống nhau ở thanh ghi nhanh, Ekko bot và ô **Số tiền**
của mọi form (`public/shared/money.js`): `12tr` = 12.000.000, `29tr900` =
29.900.000, `1tr2` = 1.200.000, `2tr05` = 2.050.000, `35k5` = 35.500, `1ty2` =
1.200.000.000, `1tr200k` = 1.200.000. Chữ số ngay sau đơn vị là phần lẻ của đơn vị
đó (đệm cho đủ 3 chữ số). Trong ô Số tiền, số đọc được hiện ngay bên dưới lúc gõ
và ô tự đổi thành số đầy đủ khi rời ô.

Dùng chung bộ đọc tiếng Việt với Ekko bot (`services/nlp.js`) nhưng ghi thẳng
vào sổ qua `POST /api/expenses/quick`, nên một lần ghi nhanh không làm đầy lịch
sử trò chuyện. Câu không có số tiền sẽ bị từ chối kèm gợi ý cách gõ, thay vì lưu
nhầm một khoản 0đ.

Ô nhập chiếm phần còn lại của hàng có nút Ekko bot, nên không thêm tầng chrome
nào ở đáy. Nút gửi chỉ hiện khi đã gõ gì đó.

### Cảnh báo chi tiêu bất thường

Ghi xong một khoản, nếu con số trông bất thường thì thay vì lời xác nhận, người
dùng nhận một **cảnh báo màu hổ phách**:

> **1.500.000đ cho một lần ăn uống?**
> Mức này lớn bất thường cho một khoản ăn uống thường ngày (trên 500.000đ). Nếu
> bạn gõ nhầm số, sửa lại trong sổ chi tiêu nhé.

Việc cần bắt nhất là **gõ nhầm số**: "ăn trưa 2 triệu" gần như luôn là 200 nghìn
bị thêm một số 0. Ba luật trong `services/spendingAlerts.js`, xếp theo mức đáng
nói:

| Mã | Khi nào | Ví dụ |
|---|---|---|
| `daily_large` | vượt ngưỡng "một lần" của nhóm | 1.500.000đ cho Ăn uống |
| `personal_spike` | gấp ≥ 4 lần mức thường của chính người dùng | thường 45k, lần này 300k |
| `budget_share` | một khoản ≥ 50% hạn mức tháng của nhóm | 1,5tr trên hạn mức 3tr |

**Ngưỡng chỉ đặt cho nhóm chi thường ngày** (`categories.daily_limit`): Ăn uống
500.000đ, Đi lại 500.000đ, Giải trí 1.000.000đ, Mua sắm 2.000.000đ. Tiền nhà, học
phí, gia đình, tiết kiệm để trống — ở đó số lớn là bình thường, cảnh báo chỉ là
tiếng ồn. Sửa được trong **Nhóm chi tiêu** ở Admin portal.

Hai điều làm cảnh báo không trở thành tiếng ồn:

- **Ngưỡng của nhóm nhường cho lịch sử của chính người dùng.** Nếu phần lớn khoản
  chi gần đây của họ ở nhóm đó cũng quanh mức ấy (`amount ≤ median × 3`) thì luật
  `daily_large` im lặng. Người hay ăn nhà hàng không bị nhắc mỗi ngày.
- **Mức tham chiếu là trung vị của 20 khoản gần nhất**, không phải trung bình:
  một khoản lệch lớn không kéo mức tham chiếu lên theo.

Cảnh báo **không chặn**: khoản chi vẫn được lưu, người dùng tự sửa hoặc xoá. Nó
xuất hiện ở cả ba đường ghi — thanh ghi nhanh, form Ghi một khoản chi, và tin nhắn
cho Ekko bot (bot chèn thêm một dòng cảnh báo in đậm vào câu xác nhận, nên cảnh báo còn lại
trong lịch sử trò chuyện).

### Chống ghi trùng

Một lần "ghi" của người dùng có thể phát ra **hai lần gọi API**: bấm hai lần liên
tiếp, bàn phím tiếng Việt gửi Enter hai lần khi chốt bộ gõ (`keydown` với
`isComposing`), hay `click` chồng lên `keydown`. Server không có cơ chế nào loại
bỏ bản trùng — hai lần gọi là hai dòng trong sổ.

Mọi hành động ghi dữ liệu vì vậy đi qua `singleFlight()` trong
`shared/client.js`: lần gọi thứ hai bị bỏ qua khi lần đầu còn đang chạy. Riêng
thanh ghi nhanh có thêm lớp thứ hai — **dọn ô nhập ngay khi đã lấy được nội
dung** — để lần gọi đến *sau khi* lần đầu kết thúc cũng không còn gì để gửi; gửi
lỗi thì chữ được trả lại cho người dùng.

Đang dùng ở: thanh ghi nhanh, form ghi khoản chi, nạp tiền vào mục tiêu (concept
khác Ekko Lover), lưu mục tiêu. Nút **Tư vấn** dùng cách khác: khoá nút khi đang
gọi AI, mở lại khi xong. Lưu ý `.is-busy` (làm mờ + `pointer-events: none`) **không** thay được cơ
chế này: nó khoá chuột nhưng không khoá bàn phím.

Mọi lệnh đọc (`GET`) của ba chức năng đều **không trả thưởng**: mở màn hình, đổi
tháng, đổi tab lọc, hay màn hình chính lấy số liệu tóm tắt — tất cả đều miễn phí
và không đụng tới streak. Chỉ các lệnh ghi (hạn mức ngân sách, `POST /api/goals`,
`POST /api/goals/advice`, `POST /api/goals/:id/deposit`, `POST /api/expenses`,
`POST /api/expenses/quick`, tiết kiệm, kế hoạch) mới đi qua `useFeature`, và
cũng chỉ lần đầu mỗi ngày cho mỗi chức năng mới trả XP + streak.

Cờ `usedToday` của mỗi chức năng vì vậy có nghĩa là "hôm nay đã làm gì đó ở
đây", không phải "hôm nay đã mở lên xem".

---

## Icon, không emoji

App không dùng emoji. Mọi biểu tượng lấy từ trang **Icons** của Figma
"[Ekko UI] - Design System" (kiểu Stroke), gom trong
`public/assets/icons/ui-icons.svg` và vẽ bằng `uiIcon('tên')` / `dataIcon(giá trị)`
trong `shared/client.js`. Cột biểu tượng trong database (`icon`, `emoji`, `logo`)
chứa tên icon hoặc đường dẫn ảnh `/assets/...`; admin chọn icon bằng bộ chọn, không
gõ tự do. Cần icon mới thì xuất thêm từ Figma vào sprite, giữ nguyên tên trong Figma.
Dữ liệu cũ còn emoji được đổi một lần lúc khởi động (`server/seed/emojiIcons.js`).

Ngoại lệ: **huy hiệu** vẫn giữ emoji cũ. Card 5 icon ở màn chủ dùng bộ icon riêng
`app-icons.svg`.

## Admin portal

| Mục | Làm được gì |
|---|---|
| Bảng điều khiển | Người hoạt động theo ngày, phân bố cấp độ, bài học phổ biến, mức dùng ba chức năng |
| Người học | Tiến độ, XP, streak, huy hiệu. **Không** hiển thị chi tiêu, ngân sách hay mục tiêu của cá nhân |
| Concept | Chọn cách kể chuyện cho màn Khám phá; chỉ một concept được bật, đổi bất cứ lúc nào |
| Cấp độ | Tên, ngưỡng XP, ảnh nhân vật heo; cảnh báo nếu ngưỡng XP không tăng dần |
| Huy hiệu | Tab theo nhóm; nhóm, loại điều kiện, ngưỡng, phạm vi, XP thưởng, bật/tắt. Mã tự sinh, không hiện |
| Thử thách | Tab theo kỳ (khởi đầu / ngày / tuần); điều kiện, ngưỡng, XP thưởng, bật/tắt |
| Mô đun & bài học | Cây nội dung, tạo/sửa/xoá, đặt cấp độ mở khoá, xuất bản hoặc để nháp |
| Trình soạn frame | Bốn loại frame, xem trước văn bản, khung xem trước 1:1,371 cho slide, trình đặt điểm tương tác, sắp xếp lại thứ tự |
| Chức năng | XP học tập & check-in (mỗi bài học, mỗi bài test mô đun, check-in mỗi ngày); **AI** (lượt mỗi người mỗi ngày, số liệu hôm nay, câu bot từ chối vì ngoài phạm vi); tên, mô tả, XP mỗi ngày, bật/tắt từng chức năng. Riêng **Ghi chép chi tiêu** có thêm tab **Nhóm chi tiêu**: tên, biểu tượng, màu, và từ khoá cho Ekko bot |

Cột **Trạng thái** ở mọi danh sách là một công tắc bật/tắt ngay tại chỗ, không cần
mở hộp thoại: mô-đun và bài học (xuất bản / bản nháp), chức năng (hiện / ẩn
trong app), huy hiệu (bật / tắt). Công tắc lưu ngay khi bấm và tự trả về trạng
thái cũ nếu lưu thất bại, nên hàng trong danh sách không bao giờ hiển thị sai so
với dữ liệu đã lưu.

Ảnh có thể chọn từ bộ artwork có sẵn hoặc tải lên (PNG/JPG/WebP/SVG, tối đa
1,5 MB), lưu vào `public/assets/uploads/`.

---

## Cấu trúc mã nguồn

```
app/
├── server/
│   ├── index.js              máy chủ HTTP, định tuyến, chặn quyền, xử lý lỗi
│   ├── config.js             biến môi trường và bí mật
│   ├── db.js                 lược đồ SQLite + helper truy vấn
│   ├── auth.js               SSO, phiên đăng nhập, phân quyền
│   ├── lib/                  router, JWT HS256, tiện ích ngày giờ
│   ├── i18n/                 bảng đối chiếu Việt–Anh cho nội dung, áp lúc trả JSON
│   ├── services/
│   │   ├── streak.js         luật streak và đóng băng 3 ngày
│   │   ├── progression.js    XP, cấp độ, bộ luật huy hiệu
│   │   ├── challenges.js     thử thách khởi đầu / ngày / tuần
│   │   ├── world.js          dữ liệu cho màn hình chính
│   │   ├── botEngine.js      Ekko bot
│   │   ├── concepts.js       concept giao diện của màn Khám phá
│   │   ├── goalTemplates.js  bộ mục tiêu tiết kiệm gợi ý
│   │   ├── spendingAlerts.js cảnh báo khoản chi bất thường
│   │   ├── botLog.js         sổ hội thoại dùng chung cho chat và ghi nhanh
│   │   └── nlp.js            đọc số tiền và phân loại tiếng Việt
│   ├── routes/               session, learn, features, bot, admin
│   └── seed/                 10 cấp độ, 41 huy hiệu, thử thách, giáo trình 8 mô đun · 34 bài
├── public/
│   ├── shared/               token thiết kế Ekko + client dùng chung
│   ├── app/                  giao diện người học (trong khung iPhone)
│   │   └── i18n.js           câu chữ giao diện + nút chuyển ngôn ngữ
│   ├── admin/                Admin portal
│   └── assets/               ảnh heo, bài học, onboarding, mascot, logo, khung máy
└── test/smoke.js             265 kiểm tra end-to-end
```

Giao diện dùng ES module thuần, không bundler. Màu sắc, khoảng cách, bo góc và
kiểu chữ lấy từ Ekko Design System (`shared/tokens.css`); cả hai giao diện dùng
thẳng các component CSS của design system (button, input, table, badge, toast, icon).

**Không còn màu tự đặt trong dự án.** Mọi giá trị màu đều là token của design
system; lớp phủ mờ và bóng đổ pha từ token bằng `color-mix()` chứ không viết
`rgba()` tay. Ba ngoại lệ, đều là giới hạn của nền tảng chứ không phải màu mới:

| Chỗ | Vì sao |
|---|---|
| `mask-image: ... #000` | `#000` là giá trị kênh mask (đục/trong), không phải màu hiển thị |
| `<meta name=theme-color>` | thẻ meta không nhận `var()`; giá trị là token `--ekko-payday-blue` |
| `<input type=color>` trong Admin | ô chọn màu chỉ nhận hex thật, nên đọc token lúc chạy bằng `getComputedStyle` |

Dải trời của màn Mục tiêu nằm ở **một biến duy nhất**
`--sky-gradient`, ghép từ `--payday-blue-100/-50` và `--jade-100/-50`. Bảng màu
Ekko không có xanh trời nhạt, nên nửa dưới dải trời hơi ngả xanh ngọc — đó là
đánh đổi để không còn hex tự đặt.

Hai chỗ khác từng phải tự đặt màu, nay đã có token đúng:

- **Chuyển sắc của màn chủ Ekko Lover và số dư Tiết kiệm** dùng
  `--secondary-colors-violet` trong bảng màu phụ của design system, thay cho một
  màu tím tự chọn.
- **Cặp "tiền vào / tiền ra"** (nút Thu nhập/Chi tiêu, Nạp/Rút) dùng bộ success
  và warning. Chữ lấy bậc `-700` chứ không lấy `text-success`/`text-warning`
  (bậc `-600`): đây là nút có nhãn cỡ chữ thường, mà bậc `-600` trên nền `-50`
  chỉ đạt 3,15:1 và 2,29:1. Bậc `-700` cho 4,85:1 và 3,90:1.

**Tương phản.** Chữ phụ mang thông tin (thời lượng đọc, nhãn cột, nhãn thứ trên
biểu đồ, trạng thái rỗng) dùng `text-secondary`. `text-tertiary` chỉ dành cho
placeholder và trạng thái đã khoá — đúng vai trò design system đặt cho nó, và
2,4:1 trên nền trắng thì không đủ cho chữ người dùng cần đọc.

**Chế độ tối chưa bật.** `shared/tokens.css` có sẵn trọn bộ giá trị dark theo
`[data-theme="dark"]`, và vì app đã dùng token ngữ nghĩa nên bật thử thì phần
lớn màn hình đã đúng. Chưa bật vì mấy dải chuyển sắc tự vẽ (dải trời, dải
Midnight, nền hero) cần bản riêng cho nền tối, và cần soi lại tương phản trên
từng màn.

---

## Ghi chú kỹ thuật

- **Không có dependency.** Toàn bộ chạy trên thư viện chuẩn của Node: `node:http`,
  `node:sqlite`, `node:crypto`. Không cần cài đặt, không có chuỗi cung ứng npm.
- **Ghi dữ liệu vào SQL đi qua danh sách cột được phép** cho từng loại bản ghi,
  nên trường lạ trong request không thể chạm tới câu lệnh SQL.
- **Phục vụ file tĩnh chặn đường dẫn thoát khỏi thư mục `public`.**
- **Phần thưởng chỉ trả một lần.** Học lại một bài đã hoàn thành vẫn được, nhưng
  không cộng XP lần hai; mở lại một chức năng trong ngày cũng vậy.
- **Toast là component `.ekko-toast` của design system**, không phải kiểu riêng:
  thẻ trắng, bo 24, viền nhạt, ô icon 36px và hai dòng tiêu đề / phụ. Sắc thái
  nằm ở màu ô icon (`bg-success-50`, `bg-error-50`, `bg-brand-50`) chứ không tô
  kín cả thẻ — design system không có toast nền xanh/đỏ. Icon lấy từ sprite
  `shared/icons-core.svg`. Gọi bằng `toast('Đã lưu')` hoặc
  `toast({ title, body }, 'success')`.
- **Toast rơi từ đỉnh màn hình.** Trượt xuống từ mép trên, đậu ngay **dưới HUD**
  trong **4 giây**, rồi trượt lên và biến mất (`TOAST_HOLD` / `TOAST_EXIT` trong
  `shared/client.js`). Chỗ đậu tránh HUD vì XP và streak vừa đổi nằm ở đó.
- **Toast có nút đóng** để tắt sớm — cần cho cảnh báo chi tiêu, vì nó dài hai
  dòng và có thể che nội dung người dùng đang đọc. Bấm đóng thì **huỷ luôn hẹn tự
  tắt**, nếu không hai lần trượt lên sẽ đè nhau. Cả dải toast không nhận chuột
  (`pointer-events: none`) để không chắn nhịp thao tác tiếp theo, nên riêng nút
  đóng phải bật lại (`pointer-events: auto`). Design system không định nghĩa nút
  này, nên nó là `.toast__close` ở phía app, không thêm vào file component.
  Admin portal vẫn dùng `.atoast` riêng ở góc dưới phải.
- **Chuyển động tôn trọng `prefers-reduced-motion`** ở cả hai giao diện.
- Font Bricolage Grotesque và Newsreader nạp từ Google Fonts; nếu không có mạng,
  giao diện tự lùi về font hệ thống mà không vỡ bố cục.

### Việc cần làm trước khi lên môi trường thật

- Đặt `EKKO_SSO_SECRET`, `EKKO_SESSION_SECRET`, `NODE_ENV=production`.
- Chạy sau HTTPS và thêm `Secure` vào cookie phiên (`server/lib/http.js`).
- Chuyển SQLite sang ổ đĩa lưu trữ bền hoặc sang Postgres nếu cần nhiều tiến trình.
- Rà soát giấy phép của bộ icon trước khi phát hành ra ngoài (xem ghi chú trong
  design system).
