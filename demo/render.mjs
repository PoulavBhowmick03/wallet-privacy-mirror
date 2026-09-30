// Renders demo/stage.html frame by frame and encodes it with ffmpeg.
//   node demo/render.mjs --stills 3,20,38      quick PNG stills for review
//   node demo/render.mjs --scale 1             1080p draft
//   node demo/render.mjs                       4K master (scale 2)
import { chromium } from '@playwright/test';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join } from 'node:path';
import { cpus } from 'node:os';
import { FPS, DURATION, W, H } from './timeline.js';

const DIR = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const scale = Number(opt('--scale') ?? 2);
const stills = opt('--stills')?.split(',').map(Number);
const workers = Number(opt('--workers') ?? Math.max(2, Math.min(8, cpus().length - 4)));
const OUT = join(DIR, 'out'), FRAMES = join(OUT, `frames-${scale}x`);
await mkdir(OUT, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
async function openStage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  // Serve demo/ from a fake origin so ES modules and fetch work without a server.
  await page.route('http://demo.local/**', async route => {
    const path = join(DIR, decodeURIComponent(new URL(route.request().url()).pathname));
    await route.fulfill({ body: await readFile(path), contentType: types[extname(path)] || 'application/octet-stream' });
  });
  page.on('pageerror', e => { console.error('stage error:', e.message); process.exit(1); });
  await page.goto('http://demo.local/stage.html');
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  return page;
}

const browser = await chromium.launch({ channel: 'chrome' });
if (stills) {
  const page = await openStage(browser);
  for (const t of stills) { await page.evaluate(t => render(t), t); await page.screenshot({ path: join(OUT, `still-${t}.png`) }); }
  await browser.close(); console.log('stills written to', OUT); process.exit(0);
}

const total = Math.round(DURATION * FPS);
await rm(FRAMES, { recursive: true, force: true }); await mkdir(FRAMES, { recursive: true });
let done = 0; const started = Date.now();
await Promise.all(Array.from({ length: workers }, async (_, w) => {
  const page = await openStage(browser);
  for (let f = w; f < total; f += workers) {
    await page.evaluate(t => render(t), f / FPS);
    await page.screenshot({ path: join(FRAMES, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
    if (++done % 150 === 0) console.log(`${done}/${total} frames · ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
}));
await browser.close();

const name = scale === 1 ? 'demo-1080p.mp4' : 'demo-4k.mp4';
const audio = join(OUT, 'audio.wav');
const hasAudio = await readFile(audio).then(() => true, () => false);
const ff = ['-y', '-v', 'error', '-framerate', String(FPS), '-i', join(FRAMES, 'f%05d.jpg'), ...(hasAudio ? ['-i', audio] : []),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', scale === 1 ? '18' : '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), join(OUT, name)];
await new Promise((ok, fail) => spawn('ffmpeg', ff, { stdio: 'inherit' }).on('exit', c => c ? fail(new Error(`ffmpeg ${c}`)) : ok()));
console.log(`wrote ${join(OUT, name)}${hasAudio ? '' : ' (no audio: run node demo/audio.mjs first)'}`);
