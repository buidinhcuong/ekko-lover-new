# EkkoFeed — Đề xuất tính năng (bản nháp 3, 19/10/2026)

> **Trạng thái:** đã làm xong **MVP** trên nhánh `tinh-nang/ekkofeed` (chưa gộp vào
> `main`, chưa deploy). Gồm: ô Góp ý ở màn chủ · xem trước có che SĐT / CCCD /
> số tài khoản / tên người · AI phân loại loại / chủ đề / từ khoá / mức gấp (không có
> AI thì dùng bộ từ khoá) · tự chọn ẩn danh · 1 góp ý/ngày, +10 XP/tuần · Góp ý của
> tôi + trạng thái + phản hồi · dòng nhắc vàng khi công ty phản hồi · Admin: đám mây
> từ khoá, nhóm vấn đề, theo chủ đề / loại, danh sách, trả lời từng tin hoặc cả nhóm,
> đổi trạng thái · nội dung nhạy cảm chờ Ekko duyệt · ngưỡng ẩn danh theo công ty ·
> tài khoản HR doanh nghiệp (chỉ thấy công ty mình) · API báo cáo. Còn chờ: điều
> khoản do pháp chế duyệt (đang để câu tạm), xem danh tính tin ẩn danh khi nguy hiểm (GĐ 2).

> Nhánh: `tinh-nang/ekkofeed`. Đây là bản nháp để thống nhất trước khi làm —
> các mục **❓ Cần chốt** ở cuối là những chỗ cần anh/chị quyết.

## 1. Mục tiêu

EkkoFeed là nơi **người lao động cất lên tiếng nói** gửi tới doanh nghiệp mình
đang làm: phàn nàn, yêu cầu, góp ý, mong đợi (và cả lời khen). Doanh nghiệp
nhận được **bức tranh tổng hợp** — đang có những vấn đề gì, bao nhiêu người cùng
gặp, mức độ gấp — rồi **trả lời lại** cho người lao động ngay trong app.

Giá trị cho từng bên:

| Bên | Được gì |
|---|---|
| Người lao động | Nói được điều khó nói trực tiếp, **ẩn danh**, và thấy doanh nghiệp có phản hồi |
| Doanh nghiệp (HR) | Nắm vấn đề sớm trước khi thành nghỉ việc / đình công; số liệu theo nhóm vấn đề, không phải đọc từng tin |
| Ekko | Thêm lý do để người lao động mở app mỗi tuần; thêm giá trị bán cho doanh nghiệp (gói phúc lợi + "lắng nghe nhân viên") |

## 2. Nguyên tắc cốt lõi — phải đúng ngay từ đầu

1. **Người gửi tự chọn ẩn danh hay ghi tên** cho từng góp ý (✅ đã chốt 19/10).
   Mặc định là ẩn danh: doanh nghiệp **không** thấy tên, mã nhân viên hay email.
   Bỏ chọn "Ẩn danh" thì doanh nghiệp thấy tên người gửi (vd. muốn được liên hệ lại).
2. **Không lộ danh tính qua số liệu nhỏ.** Báo cáo cho doanh nghiệp chỉ hiện một
   nhóm / từ khoá khi có **từ 5 người trở lên** (ngưỡng chỉnh được). Dưới ngưỡng
   thì gộp vào "Khác" — tránh trường hợp "phòng chỉ có 2 người, đoán ra ngay ai".
3. **Doanh nghiệp chỉ thấy người của mình.** Dựa trên mã công ty `employer_id`
   từ SSO (đã làm sẵn). Một doanh nghiệp không bao giờ thấy dữ liệu doanh nghiệp khác.
4. **Lọc nội dung trước khi tới doanh nghiệp:** che số điện thoại, số CCCD, số
   tài khoản; câu nêu đích danh một cá nhân (vd "anh tổ trưởng Tuấn…") được làm
   mờ tên; nội dung đe doạ / quấy rối / tự hại → không chuyển cho doanh nghiệp mà
   chuyển cho Ekko xử lý riêng.
5. **Không trả đũa.** Điều khoản sử dụng của doanh nghiệp tham gia ghi rõ cam kết
   không truy tìm, không trả đũa người góp ý. (Cần pháp chế Ekko duyệt — xem mục 9.)

## 3. Người lao động thấy gì (app)

Ô **"Góp ý"** là ô thứ 6 trong hàng Chức năng ở màn chủ (cạnh Học tập, Mục tiêu,
Ngân sách, Ghi chép, Tiết kiệm) — ✅ đã chốt 19/10.

**3.1 Gửi tiếng nói** — một màn đơn giản, gõ được trong 30 giây:

- Ô nội dung (10–1.000 ký tự), có nút **🎤 nói để ghi** (dùng lại phần "Nói để
  ghi chi tiêu" sẵn có).
- **Loại:** Phàn nàn · Yêu cầu · Góp ý / mong đợi · Khen ngợi — AI gợi ý sẵn
  theo nội dung, người dùng sửa được.
- **Chủ đề:** AI gợi ý (xem mục 5), sửa được.
- **Ẩn danh** (mặc định bật) — tắt nếu muốn ghi tên.
- Trước khi gửi: hiện lại nội dung **đúng như doanh nghiệp sẽ thấy** (đã che số
  điện thoại, tên người…) để người dùng yên tâm.

**3.2 Không có bảng tin chung** (✅ đã chốt 19/10) — góp ý là chuyện **riêng**:
mỗi người chỉ thấy góp ý của mình và phản hồi doanh nghiệp gửi cho mình. Không ai
thấy góp ý hay phản hồi của đồng nghiệp. Độ lớn của một vấn đề do hệ thống tự đếm
khi gom nhóm (mục 5), không cần người khác bấm +1.

**3.3 Góp ý của tôi** — danh sách tin mình đã gửi và **trạng thái**:
Đã gửi → Đã tiếp nhận → Đang xử lý → Đã phản hồi → Đã đóng. Có phản hồi thì
hiện dòng nhắc vàng ở màn chủ (giống lời nhắc streak).

**3.4 Ekko bot** — nhắn "muốn góp ý với công ty…" thì bot mở sẵn màn gửi.

**3.5 Thưởng & giới hạn (✅ đã chốt 19/10):** +10 XP cho góp ý đầu tiên mỗi tuần.
Mỗi người **tối đa 1 góp ý mỗi ngày** để tránh gửi rác. (Huy hiệu "Tiếng nói" để sau.)

## 4. Admin / doanh nghiệp thấy gì

**4.1 Báo cáo tổng hợp** (lọc theo công ty + kỳ 7 / 30 / 90 ngày):

- **Đám mây từ khoá** — chữ càng to là càng nhiều người nhắc (theo số *người*,
  không theo số tin, để một người gửi nhiều tin không làm lệch). Bấm một từ →
  xem các vấn đề chứa từ đó.
- **Nhóm vấn đề cần giải quyết** (quan trọng nhất) — mỗi nhóm:
  - tiêu đề do AI tóm tắt ("Lương tăng ca tháng 9 trả chậm"),
  - chủ đề, số người, số tin, xu hướng so với kỳ trước (↑ ↓),
  - **mức độ ưu tiên** (Khẩn · Cao · Trung bình · Thấp — theo số người × độ gấp × cảm xúc),
  - 2–3 câu trích **đã diễn đạt lại** (không nguyên văn, để không nhận ra văn phong),
  - trạng thái xử lý và người phụ trách.
- **Phân bố** theo loại (phàn nàn / yêu cầu / góp ý / khen), theo chủ đề, và
  **chỉ số cảm xúc** theo tuần (tích cực ↔ tiêu cực).

**4.2 Trả lời người lao động:**

- **Trả lời theo nhóm vấn đề** (cách chính): viết một lần, hệ thống gửi **riêng
  tới từng người** đã nêu vấn đề đó (mỗi người thấy trong "Góp ý của tôi", không
  ai thấy người khác). Đổi trạng thái nhóm.
- **Trả lời riêng** một tin: người gửi nhận trong "Góp ý của tôi". Tin ẩn danh
  thì doanh nghiệp vẫn không biết là ai; tin ghi tên thì thấy tên người gửi.
- Mẫu câu trả lời gợi ý bằng AI (doanh nghiệp sửa rồi mới gửi).

**4.3 Phân quyền:**

| Vai trò | Thấy gì |
|---|---|
| Quản trị Ekko (admin hiện tại) | Mọi công ty; hàng chờ kiểm duyệt nội dung nhạy cảm; tạo / thu hồi tài khoản quản trị doanh nghiệp |
| **Quản trị doanh nghiệp (vai trò mới)** | Đăng nhập thẳng Admin portal. Chỉ thấy **công ty mình** (khoá theo `employer_id`): **Bảng điều khiển Giáo dục tài chính** (từ khoá Ekko bot theo ngưỡng ẩn danh của công ty) + báo cáo EkkoFeed, nhóm vấn đề, trả lời. Không thấy danh tính người gửi ẩn danh (chỉ thấy tên ở tin người gửi tự ghi tên), không thấy công ty khác, không thấy các trang cài đặt của Ekko |

**✅ Đã chốt (19/10):** ai có tài khoản thì truy cập. HR doanh nghiệp tự đăng nhập
xem báo cáo công ty mình — không qua Ekko gửi báo cáo.

Cấp tài khoản: quản trị Ekko vào **Admin → Doanh nghiệp → Thêm quản trị**, nhập
email HR + chọn công ty → hệ thống tạo tài khoản và mật khẩu tạm (hiện một lần,
như "Đặt lại mật khẩu" hiện nay). HR đổi mật khẩu ở lần đăng nhập đầu. Một công
ty có thể có nhiều quản trị; thu hồi bất cứ lúc nào. Mọi lần xem báo cáo / trả
lời đều ghi nhật ký (ai, lúc nào) để kiểm tra khi cần.

## 5. Gom nhóm & từ khoá — cách làm

Mỗi tin khi gửi được Claude đọc một lần (giống "ghi nhanh" hiện nay, có giới hạn lượt) để ra:

```json
{
  "type": "complaint | request | suggestion | praise",
  "topic": "salary | overtime | benefits | safety | facilities | management | training | finance | other",
  "keywords": ["tăng ca", "trả chậm", "lương tháng 9"],
  "sentiment": -0.7,
  "urgency": "high",
  "summary": "Lương tăng ca tháng 9 bị trả chậm",
  "redacted_text": "… (đã che SĐT, tên người) …",
  "sensitive": false
}
```

- **Chủ đề gợi ý:** Lương & thưởng · Giờ làm & tăng ca · Phúc lợi & BHXH · An
  toàn & môi trường làm việc · Cơ sở vật chất (nhà ăn, ký túc xá, xe đưa đón) ·
  Quản lý & cách đối xử · Đào tạo & thăng tiến · Tài chính cá nhân / ứng lương · Khác.
- **Gom nhóm vấn đề:** tin mới so với các nhóm đang mở của cùng công ty (theo
  chủ đề + từ khoá + tóm tắt); giống thì gộp vào, khác thì mở nhóm mới. Mỗi đêm
  chạy lại để gộp các nhóm trùng. Admin gộp / tách tay được.
- **Không có AI** (hết lượt, lỗi): dùng bộ từ khoá viết sẵn như phần "Người dùng
  hỏi Ekko bot về gì" đang có — vẫn ra chủ đề và từ khoá, chỉ thiếu tóm tắt.

## 6. API báo cáo (cho Admin và tích hợp hệ thống HR sau này)

```
GET  /api/admin/feed/report?employer=CT-001&days=30
```
```json
{
  "employer": "CT-001", "from": "2026-09-20", "to": "2026-10-19", "minGroup": 5,
  "totals": { "posts": 412, "people": 187, "replied": 0.64, "sentiment": -0.21 },
  "keywords": [
    { "text": "tăng ca", "people": 58, "posts": 71, "weight": 1.0, "trend": "+35%" },
    { "text": "nhà ăn",  "people": 41, "posts": 49, "weight": 0.71, "trend": "-10%" }
  ],
  "issues": [
    { "id": 31, "title": "Lương tăng ca tháng 9 trả chậm", "topic": "overtime",
      "people": 46, "posts": 52, "priority": "urgent", "sentiment": -0.8,
      "trend": "+120%", "status": "open", "quotes": ["…", "…"] }
  ],
  "byTopic": [{ "topic": "overtime", "people": 61 }],
  "byType":  [{ "type": "complaint", "posts": 230 }]
}
```

`weight` (0–1) là độ to của chữ trên đám mây từ khoá, tính theo số **người**.

Các API khác: `GET /api/admin/feed/issues/:id`, `POST /api/admin/feed/issues/:id/reply`,
`PATCH /api/admin/feed/issues/:id` (trạng thái, phụ trách, gộp / tách),
`GET /api/admin/feed/moderation` (hàng chờ kiểm duyệt — chỉ quản trị Ekko).
Tích hợp ngoài (hệ thống HR của doanh nghiệp): cùng API báo cáo, đăng nhập bằng
**API key riêng cho từng doanh nghiệp**, chỉ đọc báo cáo tổng hợp.

## 7. Dữ liệu (thêm vào SQLite, chỉ **thêm** bảng — không đổi bảng cũ)

| Bảng | Nội dung chính |
|---|---|
| `feed_posts` | user_id, employer_key, type, topic, text (gốc, chỉ Ekko xem), redacted_text, summary, keywords (JSON), sentiment, urgency, anonymous, status, issue_id, created_at |
| `feed_issues` | employer_key, title, topic, status, priority, owner, people, posts, opened_at, resolved_at |
| `feed_replies` | issue_id hoặc post_id, nội dung, người trả lời (vai trò), created_at |
| `employer_admins` | user_id, employer_key — quản trị doanh nghiệp |

## 8. Lộ trình đề xuất

| Giai đoạn | Nội dung | Ước lượng |
|---|---|---|
| **MVP (thử nội bộ)** | Gửi góp ý (ẩn danh, loại, chủ đề AI gợi ý, che SĐT/CCCD) · "Góp ý của tôi" + trạng thái · Admin: danh sách, lọc công ty, **đám mây từ khoá + nhóm theo chủ đề**, trả lời từng tin · API báo cáo · **tài khoản quản trị doanh nghiệp** (chỉ thấy công ty mình) | ~1–1,5 tuần |
| **GĐ 2** | Gom nhóm vấn đề bằng AI + trả lời theo nhóm · ưu tiên / xu hướng · kiểm duyệt nội dung nhạy cảm | ~1–2 tuần |
| **GĐ 3** | API key cho hệ thống HR · thông báo đẩy khi có phản hồi · báo cáo xuất PDF hằng tháng | tuỳ đối tác |

Làm trên nhánh `tinh-nang/ekkofeed`, thử ở môi trường staging với 1 doanh nghiệp
thí điểm trước khi gộp vào `main`.

## 9. ❓ Cần chốt

1. ~~Ai được xem báo cáo?~~ **✅ Đã chốt:** ai có tài khoản thì truy cập — HR doanh
   nghiệp có tài khoản quản trị doanh nghiệp, tự đăng nhập, chỉ thấy công ty mình.
2. ~~Ẩn danh hay ghi tên?~~ **✅ Đã chốt:** người gửi tự chọn cho từng góp ý (mặc định ẩn danh).
   **Còn mở:** với tin ẩn danh, **Ekko** có được xem danh tính trong trường hợp nguy
   hiểm (đe doạ, tự hại, quấy rối) không? Đề xuất: hệ thống vẫn lưu người gửi (để gửi
   phản hồi về đúng người), chỉ quản trị Ekko mở được khi có cảnh báo nguy hiểm, mỗi
   lần mở ghi nhật ký; doanh nghiệp tuyệt đối không mở được.
3. **Ngưỡng ẩn danh** cho báo cáo: 5 người có hợp lý với quy mô các công ty đang onboard không (công ty nhỏ 20–30 người có thể cần 3)?
4. ~~Bảng tin công ty?~~ **✅ Đã chốt:** không có — góp ý là chuyện riêng, chỉ người gửi thấy góp ý và phản hồi của mình.
5. ~~Ai trả lời?~~ **✅ Theo điểm 1:** HR doanh nghiệp có tài khoản tự trả lời.
6. **Pháp lý:** cần pháp chế Ekko duyệt điều khoản thu thập & chia sẻ ý kiến người lao động (Nghị định 13/2023 về dữ liệu cá nhân), và cam kết không trả đũa trong hợp đồng với doanh nghiệp.
7. **Có thưởng XP** cho việc góp ý không, hay để tách hẳn khỏi phần trò chơi cho nghiêm túc?
