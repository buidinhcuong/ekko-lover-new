"""
Sinh `public/assets/lessons/slide-native.json`: các slide bài học được dựng lại
bằng chữ thật (lấy từ Figma) thay cho ảnh, để màn bài học của Ekko Lover dàn
lại chữ cho vừa thẻ và phóng minh hoạ lấp chỗ trống (xem `renderNative` trong
public/app/views/lesson.js).

Nguồn: `tools/figma/slides.json` — bản trích các khung slide 350 × 480 trong
Figma "Giáo dục tài chính", mỗi khung đã ghép với ảnh slide của app (ảnh là
bản xuất @2x của chính khung đó).

Mỗi slide thành một danh sách hàng, theo thứ tự đọc:
  - text: một khối chữ của Figma (giữ nội dung, cỡ, màu, đậm nhạt, danh sách)
  - cols: vài khối chữ đặt cạnh nhau
  - img:  một vùng cắt từ ảnh slide — minh hoạ (art) hoặc ô có chữ bên trong
          (ô viền gradient, bảng, thẻ...) giữ nguyên thiết kế
Chữ đặt cạnh minh hoạ được tách ra: chữ trải hết bề ngang, minh hoạ xuống
dưới. Toạ độ giữ đơn vị của khung Figma (350 × 480).

Chỉ dựng lại những slide còn khoảng trống lớn khi xếp bằng ảnh (danh sách
--only), các slide khác vẫn dùng `slide-layout.json`.

    python3 tools/slide-native.py [--only danh-sach.json]
"""
from pathlib import Path
import json, sys

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'public' / 'assets' / 'lessons' / 'slide-native.json'
FW, FH = 350, 480

WEIGHT = {'Regular': 400, 'Medium': 500, 'SemiBold': 600, 'Bold': 600, 'ExtraBold': 600}


def clip(b):
    x, y, w, h = b
    x0, y0, x1, y1 = max(0, x), max(0, y), min(FW, x + w), min(FH, y + h)
    return [x0, y0, max(0, x1 - x0), max(0, y1 - y0)]


def area(b):
    return b[2] * b[3]


def inter(a, b):
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
    return max(0, x1 - x0) * max(0, y1 - y0)


def union(bs):
    x0 = min(b[0] for b in bs); y0 = min(b[1] for b in bs)
    x1 = max(b[0] + b[2] for b in bs); y1 = max(b[1] + b[3] for b in bs)
    return [x0, y0, x1 - x0, y1 - y0]


def has_text(n):
    return n['t'] == 'TEXT' or any(has_text(k) for k in n.get('k', []))


def text_block(n):
    """Khối chữ Figma -> đoạn văn; mỗi đoạn là các đoạn chữ cùng kiểu."""
    paras, cur = [], {'li': None, 'runs': []}
    for s in n['s']:
        parts = s['c'].split('\n')
        for i, part in enumerate(parts):
            if i > 0:
                paras.append(cur)
                cur = {'li': None, 'runs': []}
            if cur['li'] is None:
                cur['li'] = s['li']
            if part:
                style = s['f'].split('/')[-1]
                run = {'c': part, 'w': WEIGHT.get(style.replace(' Italic', ''), 400), 'z': round(s['z'], 2), 'col': s['col']}
                if 'Italic' in style:
                    run['it'] = 1
                if s['lh'] != 'auto':
                    run['lh'] = round(float(s['lh'].rstrip('%')) * (s['z'] / 100 if s['lh'].endswith('%') else 1), 2)
                if s.get('td') and s['td'] != 'NONE':
                    run['td'] = s['td'].lower()
                if s.get('tc') and s['tc'] not in ('ORIGINAL', None):
                    run['tc'] = s['tc'].lower()
                if isinstance(s['ls'], (int, float)) and s['ls']:
                    run['ls'] = round(s['ls'], 2)
                elif isinstance(s['ls'], str) and s['ls'] not in ('0%',):
                    run['ls'] = round(float(s['ls'].rstrip('%')) * s['z'] / 100, 2)
                cur['runs'].append(run)
    paras.append(cur)
    for p in paras:
        p['li'] = {'UNORDERED': 'ul', 'ORDERED': 'ol'}.get(p['li'])
        if not p['li']:
            del p['li']
    return {'t': 'text', 'b': clip(n['b']), 'al': n['al'].lower(), 'ps': n.get('ps') or 0, 'p': paras}


def convert(slide):
    els = []
    for n in slide['k']:
        if n.get('hidden') or (n.get('op') is not None and n['op'] == 0):
            return None, 'phần tử ẩn'
        if n.get('rot'):
            return None, 'phần tử xoay'
        b = clip(n['b'])
        if area(b) < 4:
            continue
        if n['t'] == 'TEXT':
            els.append({'kind': 'text', 'b': b, 'node': n})
        else:
            els.append({'kind': 'img', 'b': b, 'text': has_text(n), 'small': b[2] <= 64 and b[3] <= 48})
    if not any(e['kind'] == 'text' for e in els):
        return None, 'không có khối chữ rời'

    # Chữ nằm đè lên một ô/hình (≥ 40% diện tích) thì thuộc về vùng ảnh đó.
    imgs = [e for e in els if e['kind'] == 'img']
    for e in [e for e in els if e['kind'] == 'text']:
        host = next((i for i in imgs if inter(e['b'], i['b']) >= 0.4 * area(e['b'])), None)
        if host:
            host['b'] = union([host['b'], e['b']]); host['text'] = True
            els.remove(e)

    # Gom thành hàng theo chồng lấn chiều dọc.
    els.sort(key=lambda e: (e['b'][1], e['b'][0]))
    rows = []
    for e in els:
        top, bot = e['b'][1], e['b'][1] + e['b'][3]
        if rows and top < rows[-1]['bot'] - 4:
            rows[-1]['els'].append(e); rows[-1]['bot'] = max(rows[-1]['bot'], bot)
        else:
            rows.append({'els': [e], 'bot': bot})

    out = []
    for r in rows:
        texts = [e for e in r['els'] if e['kind'] == 'text']
        pics = [e for e in r['els'] if e['kind'] == 'img']
        art = [p for p in pics if not p['text'] and not p['small']]
        # Hàng có icon nhỏ cạnh chữ, hoặc có ô chứa chữ cạnh chữ rời: giữ nguyên cả hàng.
        if texts and (any(p['small'] for p in pics) or any(p['text'] for p in pics)):
            u = union([e['b'] for e in r['els']])
            out.append({'t': 'img', 'b': u, 'art': False})
            continue
        if not pics:
            blocks = [text_block(e['node']) for e in sorted(texts, key=lambda e: e['b'][0])]
            # Các khối chữ chồng lên nhau theo chiều dọc (cột) hay xếp dọc?
            if len(blocks) > 1 and all(blocks[i]['b'][0] + blocks[i]['b'][2] <= blocks[i + 1]['b'][0] + 2 for i in range(len(blocks) - 1)):
                out.append({'t': 'cols', 'items': blocks, 'b': union([b['b'] for b in blocks])})
            else:
                out.extend(sorted(blocks, key=lambda b: b['b'][1]))
            continue
        if not texts:
            u = union([p['b'] for p in pics])
            out.append({'t': 'img', 'b': u, 'art': not any(p['text'] for p in pics)})
            continue
        # Chữ + minh hoạ cạnh nhau: tách chữ ra trước, minh hoạ xuống dưới.
        tb = union([t['b'] for t in texts])
        ab = union([a['b'] for a in art])
        if inter(tb, ab) > 0:
            # Chồng lấn: chỉ tách được nếu minh hoạ nằm hẳn một bên chữ — cắt bỏ phần đè.
            if ab[0] >= tb[0] + tb[2] * 0.6:
                cut = tb[0] + tb[2] - ab[0]
                ab = [ab[0] + cut, ab[1], ab[2] - cut, ab[3]]
            elif ab[0] + ab[2] <= tb[0] + tb[2] * 0.4:
                cut = ab[0] + ab[2] - tb[0]
                ab = [ab[0], ab[1], ab[2] - cut, ab[3]]
            else:
                out.append({'t': 'img', 'b': union([e['b'] for e in r['els']]), 'art': False})
                continue
            if ab[2] < 40:
                out.append({'t': 'img', 'b': union([e['b'] for e in r['els']]), 'art': False})
                continue
        for t in sorted(texts, key=lambda e: e['b'][1]):
            out.append(text_block(t['node']))
        out.append({'t': 'img', 'b': ab, 'art': True})

    for r in out:
        if r['t'] == 'img':
            x, y, w, h = r['b']
            r['b'] = [round(v, 1) for v in r['b']]
            if r.get('art'):
                if x + w >= FW - 1 and x > 8: r['bleed'] = 'r'
                elif x <= 1 and x + w < FW - 8: r['bleed'] = 'l'
                if y + h >= FH - 1: r['ground'] = 1
            if not r.get('art'):
                r.pop('art', None)
    return {'bg': (slide.get('fill') or ['#ffffff'])[0].split('@')[0], 'rows': out}, None


def main():
    data = json.loads((ROOT / 'figma' / 'slides.json').read_text())
    only = None
    if '--only' in sys.argv:
        only = set(json.loads(Path(sys.argv[sys.argv.index('--only') + 1]).read_text()))
    out, skipped = {}, {}
    for path, slide in data.items():
        if only is not None and path not in only:
            continue
        spec, why = convert(slide)
        if spec:
            out[path] = spec
        else:
            skipped[path] = why
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print(f'{len(out)} slide -> {OUT.name}; bỏ qua {len(skipped)}')
    for p, why in skipped.items():
        print('  -', p, why)


if __name__ == '__main__':
    main()
