# Ảnh chụp màn hình · App người dùng

Toàn bộ chức năng của **App người dùng**, chụp kèm khung iPhone do chính app vẽ
(`.device` trong `app/public/app/`), hai bản ngôn ngữ. Không có ảnh Admin portal
ở đây.

| # | Màn hình |
|---|---|
| 01 | Trang chủ · bản đồ học tập, ở đầu lộ trình |
| 02 | Bản đồ, cuộn tới giữa (tên mô-đun ghim trên đỉnh) |
| 03 | Bản đồ, cuộn tới cuối (các mô-đun còn khoá) |
| 04 | Ghi chép chi tiêu · danh sách + thước ngân sách tháng |
| 05 | Ghi một khoản chi (kèm ô ảnh hoá đơn) |
| 06 | Lập ngân sách · tổng quan tháng |
| 07 | Ngân sách · form chỉnh sửa theo nhóm |
| 08 | Mục tiêu của bạn |
| 09 | Đặt thêm mục tiêu · bộ gợi ý |
| 10 | Mục tiêu · form thiết lập, kèm phần Ekko tính giúp |
| 11 | Huy hiệu & cấp độ |
| 12 | Huy hiệu · hoạt động gần đây |
| 13 | Sáu cấp độ (bottom sheet, sáu chú heo) |
| 14 | Ekko bot |
| 15 | Trình phát bài học |
| 16 | Bài học · cuộn trong khung |
| 17 | Trắc nghiệm cuối mô-đun |

## Chụp lại

Cần server đang chạy ở `http://localhost:4321` (`npm start` trong `app/`).

```bash
node "Ảnh chụp màn hình/chup-anh.mjs" "Ảnh chụp màn hình/App người dùng - Tiếng Việt"
LANG_CODE=en node "Ảnh chụp màn hình/chup-anh.mjs" "Ảnh chụp màn hình/App người dùng - English"
```

Script dùng Chrome ở chế độ headless và nói chuyện với nó qua CDP bằng WebSocket
có sẵn trong Node — không thêm phụ thuộc nào. `ONLY=04,05` để chụp lại vài màn.
