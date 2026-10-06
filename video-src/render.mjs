import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const mode = process.argv[2] || 'stills';
const tl = JSON.parse(readFileSync('timeline.json', 'utf8'));
writeFileSync('video.built.html', readFileSync('video.html', 'utf8').replace('__TIMELINE__', JSON.stringify(tl)));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--allow-file-access-from-files', '--no-first-run'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('page:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('file://' + process.cwd() + '/video.built.html', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
const cdp = await page.createCDPSession();
const grab = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })).data, 'base64');
if (mode === 'stills') {
  const times = process.argv.slice(3).map(Number);
  for (const t of times) { await page.evaluate((x) => window.renderAt(x), t); writeFileSync(`still_${t}.jpg`, await grab()); }
} else {
  const fps = 30; const n = Math.ceil(tl.duration * fps);
  const ff = spawn(process.env.FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-i', 'voice.wav',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-shortest', 'out.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i += 1) {
    await page.evaluate((x) => window.renderAt(x), i / fps);
    const buf = await grab();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log('frame', i, '/', n);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('done');
}
await browser.close();
