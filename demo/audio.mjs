// Composes and renders the soundtrack to demo/out/audio.wav. Everything is synthesized
// here (no samples). 120 BPM in F minor, i–VI–III–VII, arranged around timeline.js:
// filtered intro while the screen is black, full groove over the site, a breakdown on
// the closing line, and a final hit on the end card.
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { DURATION, BPM, WINDOW_IN, DARK, endCard, soundEvents } from './timeline.js';

// Background track: if present, it replaces the synthesized music and only UI sounds are rendered here.
// The track's drop (MUSIC.drop, in the song's own time) is aligned to WINDOW_IN, when the site appears.
const MUSIC = { file: new URL('./music/odyssey.mp3', import.meta.url).pathname, drop: 21.39, fadeOut: 3 };
const SFX_ONLY = existsSync(MUSIC.file);

const RATE = 48000, N = Math.ceil(DURATION * RATE);
const L = new Float32Array(N), R = new Float32Array(N);
const beat = 60 / BPM, bar = 4 * beat, six = beat / 4;
const DROP = WINDOW_IN, BREAK = DARK[1][0], END = endCard.t0;
let seed = 11; const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 31) - 1;
const hz = m => 440 * 2 ** ((m - 69) / 12);
const add = (buf, i, v) => { if (i >= 0 && i < N) buf[i] += v; };
const put = (i, v, pan = 0) => { add(L, i, v * (1 - pan)); add(R, i, v * (1 + pan)); };

// F minor: Fm, Db, Ab, Eb (MIDI roots) with triad tones.
const prog = [[53, 56, 60], [49, 53, 56], [56, 60, 63], [51, 55, 58]];
const chordAt = t => prog[Math.floor(t / bar) % 4];
const groove = t => t >= DROP && t < BREAK;
const kicks = [];
for (let t = DROP; t < BREAK - 0.01; t += beat) kicks.push(t);
kicks.push(END);
const duck = t => { let d = 1; for (const k of kicks) { if (k <= t && t - k < 0.4) d = Math.min(d, 1 - 0.75 * Math.exp(-(t - k) * 11)); } return d; };

if (!SFX_ONLY) {
// ---- Drums ----
function kick(t, amp = 0.95) { const s0 = Math.round(t * RATE); let ph = 0; for (let j = 0; j < 0.4 * RATE; j++) { const u = j / RATE, f = 46 + 110 * Math.exp(-u * 28); ph += 2 * Math.PI * f / RATE; put(s0 + j, (Math.sin(ph) * Math.exp(-u * 8) + (j < 60 ? noise() * 0.3 * (1 - j / 60) : 0)) * amp); } }
function clap(t) {
  const s0 = Math.round(t * RATE); let lp = 0, hp = 0;
  for (let j = 0; j < 0.22 * RATE; j++) {
    const u = j / RATE, n = noise(); lp += 0.25 * (n - lp); hp = n - lp;
    const env = [0, 0.011, 0.022].reduce((a, o) => a + (u >= o ? Math.exp(-(u - o) * (o === 0.022 ? 18 : 140)) : 0), 0);
    put(s0 + j, hp * env * 0.22, 0.05);
  }
}
function hat(t, open, amp) { const s0 = Math.round(t * RATE); let lp = 0; const d = open ? 16 : 70; for (let j = 0; j < (open ? 0.18 : 0.05) * RATE; j++) { const n = noise(); lp += 0.5 * (n - lp); put(s0 + j, (n - lp) * Math.exp(-j / RATE * d) * amp, open ? 0.25 : -0.2); } }
for (let t = 0; t < BREAK - 0.01; t += beat / 2) {
  const onBeat = Math.abs((t / beat) % 1) < 1e-6;
  if (t < DROP) { if (t >= bar) hat(t, false, onBeat ? 0.05 : 0.08); continue; }
  if (onBeat) kick(t);
  const b = Math.round(t / beat) % 4;
  if (onBeat && (b === 1 || b === 3)) clap(t);
  hat(t, !onBeat, onBeat ? 0.04 : 0.065);
}
for (let t = DROP; t < BREAK - 0.01; t += six) if (Math.round(t / six) % 2) hat(t, false, 0.022); // 16th shimmer
// Pickup into the drop: four quick claps on the last beat of the intro.
for (let k = 0; k < 4; k++) clap(DROP - beat + k * six);
kick(END, 1.0);

// ---- Bass: offbeat 8ths on the chord root, ducked by the kick ----
for (let t = DROP; t < BREAK - 0.01; t += beat / 2) {
  const f = hz(chordAt(t)[0] - 24), s0 = Math.round(t * RATE), len = beat / 2 * 0.9;
  for (let j = 0; j < len * RATE; j++) { const u = j / RATE, env = Math.min(1, u * 200) * Math.min(1, (len - u) * 60); put(s0 + j, Math.tanh(2.2 * Math.sin(2 * Math.PI * f * u)) * env * 0.28 * duck(t + u)); }
}
{ const f = hz(prog[0][0] - 24), s0 = Math.round(END * RATE); for (let j = 0; j < 2.8 * RATE; j++) { const u = j / RATE; put(s0 + j, Math.tanh(2 * Math.sin(2 * Math.PI * f * u)) * Math.exp(-u * 1.4) * 0.3); } }

// ---- Pluck arpeggio (additive saw, brightness opens up through the intro), with ping-pong delay ----
const arpL = new Float32Array(N), arpR = new Float32Array(N);
const pattern = [0, 1, 2, 3, 2, 1, 0, 2, 1, 2, 3, 2, 0, 1, 2, 1];
const ARP_END = END + bar;
for (let t = 0, k = 0; t < ARP_END; t += six, k++) {
  const ch = chordAt(t), step = pattern[k % 16], note = (step === 3 ? ch[0] + 12 : ch[step]) + 12;
  const f = hz(note), s0 = Math.round(t * RATE);
  const bright = t < DROP ? 2 + 10 * (t / DROP) ** 2 : t >= BREAK ? 4 : 12;
  const amp = (t >= BREAK && t < END ? 0.07 : 0.1) * (t >= END ? Math.max(0, 1 - (t - END) / bar) : 1);
  const pan = k % 2 ? 0.35 : -0.35;
  for (let j = 0; j < 0.3 * RATE; j++) {
    const u = j / RATE; let v = 0;
    for (let h = 1; h <= bright; h++) v += Math.sin(2 * Math.PI * f * h * u) / h * Math.exp(-u * h * 4);
    v *= Math.exp(-u * 10) * amp * (groove(t + u) ? duck(t + u) * 0.4 + 0.6 : 1);
    add(arpL, s0 + j, v * (1 - pan)); add(arpR, s0 + j, v * (1 + pan));
  }
}
const dly = Math.round(3 * six * RATE);
for (let i = dly; i < N; i++) { arpL[i] += arpR[i - dly] * 0.32; arpR[i] += arpL[i - dly] * 0.32; }
for (let i = 0; i < N; i++) { L[i] += arpL[i]; R[i] += arpR[i]; }

// ---- Pad: detuned saws, one chord per bar, sidechained; opens on the drop and the end card ----
for (let i = 0; i < N; i++) {
  const t = i / RATE; if (t < DROP - beat) continue;
  const ch = chordAt(Math.min(t, END - 0.01)), local = (t % bar) / bar;
  const level = t < DROP ? (t - (DROP - beat)) / beat * 0.5 : t < BREAK ? 1 : t < END ? 0.7 : Math.exp(-(t - END) * 0.9);
  let l = 0, r = 0;
  for (const m of ch) for (const [dt, side] of [[-0.004, -1], [0, 0], [0.004, 1]]) {
    const f = hz(m) * (1 + dt); let v = 0;
    for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t + h) / h;
    l += v * (1 - side * 0.5); r += v * (1 + side * 0.5);
  }
  const g = 0.012 * level * Math.min(1, local * 20 + (t < DROP + 0.01 ? 1 : 0)) * (groove(t) ? duck(t) : 1);
  L[i] += l * g; R[i] += r * g;
}

}

// ---- UI sounds, kept under the music ----
const ev = soundEvents();
for (const t of ev.typing) { const s0 = Math.round(t * RATE); for (let j = 0; j < 0.008 * RATE; j++) put(s0 + j, noise() * Math.exp(-j / RATE * 900) * 0.045, noise() * 0.3); }
for (const t of ev.clicks) { const s0 = Math.round(t * RATE); for (let j = 0; j < 0.04 * RATE; j++) { const u = j / RATE; put(s0 + j, (Math.sin(2 * Math.PI * 2400 * u) * 0.6 + noise() * 0.4) * Math.exp(-u * 180) * 0.22); } }

// ---- Master: short fade in/out, bus saturation, normalize to -1 dBFS ----
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / RATE, g = Math.min(1, t / 0.05) * Math.min(1, (DURATION - t) / 0.5);
  L[i] = Math.tanh(L[i] * g * 1.25); R[i] = Math.tanh(R[i] * g * 1.25); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = SFX_ONLY ? 0.9 : 0.89 / peak, buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * gain * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * gain * 32767), 46 + i * 4); }
await mkdir(new URL('./out/', import.meta.url), { recursive: true });
const out = n => new URL(`./out/${n}`, import.meta.url).pathname;
if (!SFX_ONLY) {
  await writeFile(out('audio.wav'), buf);
  console.log(`wrote demo/out/audio.wav (${DURATION}s, synthesized ${BPM} BPM track)`);
} else {
  await writeFile(out('sfx.wav'), buf);
  const start = MUSIC.drop - WINDOW_IN;
  const graph = `[0:a]aresample=48000,afade=t=in:st=0:d=0.2,afade=t=out:st=${DURATION - MUSIC.fadeOut}:d=${MUSIC.fadeOut}[m];[1:a]volume=0.6[s];[m][s]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]`;
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(start), '-t', String(DURATION), '-i', MUSIC.file, '-i', out('sfx.wav'), '-filter_complex', graph, '-map', '[a]', '-ar', '48000', out('audio.wav')], { stdio: 'inherit' });
  if (r.status) throw new Error('ffmpeg mix failed');
  console.log(`wrote demo/out/audio.wav (${DURATION}s, music from ${start.toFixed(2)}s, drop at ${WINDOW_IN}s)`);
}
