"""
Sinh `public/assets/lessons/slide-layout.json`: mỗi slide bài học (ảnh 700 × 960)
được tách thành các khối nội dung nằm ngang trên nền một màu, để màn bài học
của Ekko Lover xếp lại các khối cho vừa chiều cao thật của màn (xem
`layoutSlide` trong public/app/views/lesson.js).

Mỗi khối: [y0, y1, x0, x1, độ phủ, tỉ lệ hàng trống, có cột chữ (0/1)]
  - độ phủ: tỉ lệ điểm ảnh khác màu nền trong khung của khối
  - tỉ lệ hàng trống: chữ có khe giữa các dòng, hình minh hoạ thì liền khối
  - có cột chữ: một phần ba bề ngang nào đó có nhịp dòng chữ (chữ đặt cạnh hình)

Chạy lại sau khi thêm hoặc sửa ảnh slide:
    python3 tools/slide-layout.py
"""
from pathlib import Path
import collections, json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'lessons'
OUT = ROOT / 'slide-layout.json'
MERGE_GAP = 22      # hàng trống liền nhau tối đa vẫn tính cùng một khối
TOLERANCE = 28      # chênh lệch màu tối thiểu so với nền để tính là nội dung


def analyze(path):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    px = im.load()
    bg = collections.Counter(px[x, y] for x in range(0, W, 7) for y in (0, 1, H - 1, H - 2)).most_common(1)[0][0]

    def ink(p):
        return max(abs(p[0] - bg[0]), abs(p[1] - bg[1]), abs(p[2] - bg[2])) > TOLERANCE

    rows, thirds = [], []
    for y in range(H):
        xs = [x for x in range(W) if ink(px[x, y])]
        rows.append((min(xs), max(xs), len(xs)) if len(xs) >= 2 else None)
        thirds.append([any(a * W // 3 <= x < (a + 1) * W // 3 for x in xs) for a in range(3)])

    bands, y = [], 0
    while y < H:
        if rows[y] is None:
            y += 1
            continue
        y0, (x0, x1, _), gap, n = y, rows[y], 0, 0
        while y < H:
            if rows[y] is None:
                gap += 1
                if gap > MERGE_GAP:
                    break
            else:
                gap = 0
                x0, x1, n = min(x0, rows[y][0]), max(x1, rows[y][1]), n + rows[y][2]
            y += 1
        y1 = y - gap
        density = n / max(1, (y1 - y0) * (x1 - x0 + 1))
        empty = sum(1 for yy in range(y0, y1) if rows[yy] is None) / max(1, y1 - y0)
        textcol = 0
        for a in range(3):
            ys = [yy for yy in range(y0, y1) if thirds[yy][a]]
            if len(ys) < 40:
                continue
            span = ys[-1] - ys[0] + 1
            runs = sum(1 for i in range(1, len(ys)) if ys[i] - ys[i - 1] > 3)
            if (span - len(ys)) / span >= 0.18 and runs >= 3:
                textcol = 1
        bands.append([y0, y1, x0, x1 + 1, round(density, 3), round(empty, 3), textcol])
    return {'bg': '#%02x%02x%02x' % bg, 'bands': bands}


def main():
    out = {}
    for path in sorted(ROOT.rglob('*.png')):
        if Image.open(path).size != (700, 960):
            continue   # ảnh bìa mô-đun và ảnh khác cỡ không phải slide
        out['/assets/lessons/' + path.relative_to(ROOT).as_posix()] = analyze(path)
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print(f'{len(out)} slide -> {OUT.relative_to(ROOT.parent.parent.parent)}')


if __name__ == '__main__':
    main()
