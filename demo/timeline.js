// Single source of truth for the demo video. The stage (visuals) and audio.mjs
// (music + sound design) both read this, so cuts land on the beat.
export const FPS = 30;
export const W = 1920, H = 1080;
export const DURATION = 30;
export const BPM = 120; // one bar = 2 s, so scene cuts sit on beats

// Browser window on the light scenes, and its page viewport below the chrome bar.
export const WIN = { x: 160, y: 222, w: 1600, h: 820, bar: 40 };
export const VIEW = { w: WIN.w, h: WIN.h - WIN.bar };
export const PAGE_W = 1440;

export const DARK = [[0, 4.0], [25.6, 99]];
export const WINDOW_IN = 4.0, WINDOW_OUT = 25.3;
export const OUT_FADE = 0.25;

export const headlines = [
  { t0: 0.15, t1: 3.9, text: 'Your wallet is public.', mode: 'statement', y: 330 },
  { t0: 4.3, t1: 7.6, text: '1.2 ETH arrives every 31 days.', mode: 'site', tag: 'HYPOTHESIS', tagKind: 'hypo' },
  { t0: 7.8, t1: 11.2, text: 'Looks like a salary. It might not be.', mode: 'site' },
  { t0: 11.4, t1: 14.8, text: 'Stealth addresses remove it.', mode: 'site', tag: 'WHAT IF' },
  { t0: 15.0, t1: 18.4, text: 'A privacy pool hides the payer.', mode: 'site', tag: 'WHAT IF' },
  { t0: 18.6, t1: 22.0, text: 'Check a transfer before you send it.', mode: 'site' },
  { t0: 22.2, t1: 25.3, text: 'GPT-6.1 Sol can only cite transactions.', mode: 'site', tag: '33 OF 33 TEST RUNS PASSED' },
  { t0: 25.8, t1: 27.8, text: 'Read your wallet before others do.', mode: 'statement' },
];
export const CHAR_STEP = { statement: 0.04, site: 0.026 };

export const chips = {
  t0: 1.5, step: 0.14, t1: 3.9, caption: { t0: 2.4, text: 'ANYONE WITH A BLOCK EXPLORER CAN READ THIS' },
  items: [['FROM', '0x4444...4444'], ['AMOUNT', '1.2 ETH'], ['09 JUL', '09:00 UTC'], ['09 AUG', '09:00 UTC'], ['09 SEP', '09:00 UTC']],
};

export const headerRight = [[0, 'LOCAL | READ-ONLY'], [4.0, 'SYNTHETIC SAMPLE DATA'], [22.2, 'SYNTHETIC SAMPLE | REAL GPT-6.1 SOL RUN'], [25.6, 'LOCAL | READ-ONLY']];

// Which captured screenshot is on screen. Viewport captures sit on top of a full-page base.
export const BASE = { evidence: 'hypo', ai: 'report' };
export const states = [[0, 'hypo'], [7.55, 'evidence'], [11.4, 'report'], [16.0, 'whatif-pool'], [19.7, 'presend'], [22.2, 'presend'], [23.2, 'model']];
export const FADE = 0.3;

// Camera moves: ease from wherever the camera is to a target rectangle (page px).
export const camera = [
  [4.3, 5.2, { state: 'hypo', boxes: ['f3'], pad: 70, max: 2.0 }],
  [7.6, 8.5, { state: 'evidence', boxes: ['rows'], pad: 60, max: 2.0 }],
  [11.4, 12.3, { state: 'report', boxes: ['scnPool', 'whatifList'], pad: 30, max: 1.9 }],
  [18.6, 19.3, { state: 'whatif-pool', boxes: ['presendForm'], pad: 60, max: 1.9 }],
  [19.8, 20.5, { state: 'presend', boxes: ['presendLast'], pad: 80, max: 2.0 }],
  [22.2, 22.9, { state: 'presend', boxes: ['ai'], pad: 70, max: 1.8 }],
  [23.3, 24.0, { state: 'model', boxes: ['evalLine'], pad: 70, max: 2.0 }],
  [25.0, 25.6, { rect: { x: 0, y: 0, w: 1440, h: 702 } }],
];

// Cursor paths in page space. `at` is [state, box, fx, fy] (fractions of the box).
export const cursor = [
  { show: 6.1, hide: 7.8, points: [[6.1, ['hypo', 'f3', 0.75, 0.35]], [6.9, ['hypo', 'view3', 0.5, 0.6]]], clicks: [7.3] },
  { show: 15.2, hide: 16.5, points: [[15.2, ['report', 'whatifList', 0.7, 0.6]], [15.8, ['report', 'scnPool', 0.5, 0.5]]], clicks: [15.95] },
  { show: 18.9, hide: 20.0, points: [[18.9, ['whatif-pool', 'presendForm', 0.55, 0.3]], [19.4, ['whatif-pool', 'presendRun', 0.5, 0.5]]], clicks: [19.55] },
  { show: 22.4, hide: 23.4, points: [[22.4, ['presend', 'ai', 0.5, 0.5]], [22.9, ['presend', 'aiRecorded', 0.5, 0.5]]], clicks: [23.05] },
];

// Annotations drawn over the page. kind: 'accent' (dashed purple) or 'ink' (solid black).
export const callouts = [
  [5.3, 7.2, 'hypo', 'f3', 'SAME AMOUNT | 31 DAYS APART', 'top', 'accent'],
  [8.7, 11.1, 'evidence', 'rows', 'EVERY CLAIM CITES ITS TRANSACTIONS', 'top', 'accent'],
  [12.6, 14.7, 'report', 'whatifRemoved', 'GONE FROM THIS ADDRESS', 'top', 'accent'],
  [16.6, 18.3, 'whatif-pool', 'whatifChanged', 'SAME 1.2 ETH | SAME 31 DAYS', 'bottom', 'accent'],
  [20.5, 21.9, 'presend', 'presendLast', '13 WEEKLY TRANSFERS INSTEAD OF 12', 'top', 'accent'],
  [23.9, 25.2, 'model', 'evalLine', '0 FALSE FINDINGS IN 15 NEAR-MISS RUNS', 'bottom', 'accent'],
];

export const endCard = { t0: 27.9, t1: DURATION };

// Times of sound events, derived from the data above.
export function soundEvents() {
  const typing = headlines.flatMap(h => [...h.text].map((c, i) => c === ' ' ? null : h.t0 + i * CHAR_STEP[h.mode]).filter(v => v != null));
  const clicks = cursor.flatMap(c => c.clicks);
  return { typing, clicks };
}
