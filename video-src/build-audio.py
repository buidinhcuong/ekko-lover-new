"""Tạo giọng đọc (macOS `say`, giọng Linh) cho từng câu trong script.json, ghép
thành voice.wav và ghi timeline.json (giờ bắt đầu/kết thúc của từng cảnh, từng câu).

    python3 build-audio.py /đường/dẫn/ffmpeg
"""
import json, subprocess, sys, wave, re, os

FF = sys.argv[1] if len(sys.argv) > 1 else 'ffmpeg'
RATE, LEAD, GAP, TAIL = 44100, 0.7, 0.32, 0.9
TAILS = {'outro': 4.0, 'hook': 0.6}
os.makedirs('audio', exist_ok=True)
scenes = json.load(open('script.json', encoding='utf-8'))
silence = lambda sec: b'\x00\x00' * int(round(sec * RATE))
t, timeline, pcm = 0.0, [], bytearray()
for si, sc in enumerate(scenes):
    start, lines = t, []
    pcm += silence(LEAD); t += LEAD
    for li, (sub, tts) in enumerate(sc['lines']):
        aiff, wav = f'audio/{si:02d}_{li}.aiff', f'audio/{si:02d}_{li}.wav'
        subprocess.run(['say', '-v', 'Linh', '-r', '182', '-o', aiff, tts or sub], check=True)
        subprocess.run([FF, '-y', '-loglevel', 'error', '-i', aiff, '-ar', str(RATE), '-ac', '1', wav], check=True)
        w = wave.open(wav); data = w.readframes(w.getnframes()); dur = w.getnframes() / RATE
        lines.append({'text': sub, 'start': round(t, 3), 'end': round(t + dur, 3)})
        pcm += data; t += dur
        if li < len(sc['lines']) - 1:
            pcm += silence(GAP); t += GAP
    tail = TAILS.get(sc['id'], TAIL); pcm += silence(tail); t += tail
    timeline.append({'id': sc['id'], 'start': round(start, 3), 'end': round(t, 3), 'lines': lines})
out = wave.open('voice.wav', 'wb'); out.setnchannels(1); out.setsampwidth(2); out.setframerate(RATE); out.writeframes(bytes(pcm)); out.close()
json.dump({'duration': round(t, 3), 'scenes': timeline}, open('timeline.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('Tổng thời lượng', round(t, 1), 'giây')
