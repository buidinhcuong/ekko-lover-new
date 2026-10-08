import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const from = Number(process.argv[2]);
const tl = JSON.parse(readFileSync('timeline.json', 'utf8'));
writeFileSync('video.built.html', readFileSync('video.html', 'utf8').replace('__TIMELINE__', JSON.stringify(tl)));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto('file://' + process.cwd() + '/video.built.html', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
const cdp = await page.createCDPSession();
const fps = 30, n = Math.ceil(tl.duration * fps), i0 = Math.round(from * fps);
const ff = spawn(process.env.FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
  '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', 'tail.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
for (let i = i0; i < n; i += 1) {
  await page.evaluate((x) => window.renderAt(x), i / fps);
  const buf = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })).data, 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await browser.close();
console.log('tail frames', n - i0);
