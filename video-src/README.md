# Nguồn dựng video giới thiệu "Học tập"

Video `app/public/assets/video/ekko-hoc-tap.mp4` (2:01, 1080p 30fps) được dựng
hoàn toàn từ thư mục này: ảnh chụp app thật + bố cục HTML/CSS + giọng đọc máy.
App đổi giao diện thì chụp lại, sửa kịch bản nếu cần, rồi dựng lại.

| Tệp | Vai trò |
|---|---|
| `script.json` | Kịch bản 10 cảnh. Mỗi câu: `[phụ đề, câu cho giọng đọc]` — câu thứ hai để `null` thì đọc đúng phụ đề; điền khi cần đọc khác chữ (Ekko → "Éc-cô", XP → "điểm kinh nghiệm", AI → "trí tuệ nhân tạo"). |
| `capture.mjs` | Chụp màn hình app (393×852, @3x) vào `shots/`. Chạy trên server QA có dữ liệu mẫu, tự dựng dữ liệu: đội Dream Team, XP từ đội, 2 khoản ghi nhanh, mục tiêu có tư vấn. Cần 2 tài khoản thử `qa-lan`, `qa-minh` (cookie trong `$SCRATCH/lan.jar`, `minh.jar`). |
| `build-audio.py` | Giọng đọc macOS "Linh" cho từng câu → `voice.wav` + `timeline.json` (giờ của từng cảnh / câu). |
| `video.html` | Bố cục 10 cảnh (1920×1080). Hiệu ứng khai báo bằng `data-a="kiểu@bắt_đầu+thời_lượng"`, `L2+0.4` = 0,4 giây sau khi câu thứ 3 của cảnh bắt đầu. |
| `render.mjs` | Chrome không giao diện dựng từng khung hình → ffmpeg ghép với `voice.wav` thành `out.mp4`. `node render.mjs stills 5 30 90` để xem thử vài khung. |
| `shots/qr.png` | Mã QR "Tải Ekko ngay!" lấy từ video cũ. |

Công cụ: Node ≥ 22 + `npm i puppeteer-core` (dùng Google Chrome có sẵn), ffmpeg
(máy Intel không cài được qua Homebrew — dùng bản kèm gói Python `imageio-ffmpeg`),
macOS có giọng "Linh".

```
python3 build-audio.py <ffmpeg>
FF=<ffmpeg> node render.mjs video
<ffmpeg> -ss 13 -i out.mp4 -frames:v 1 -q:v 3 poster.jpg
```
