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

export const DARK = [[0, 4.0], [24.5, 99]];
export const WINDOW_IN = 4.0, WINDOW_OUT = 24.2;
export const OUT_FADE = 0.16;

export const headlines = [
  { t0: 0.1, t1: 2.0, text: 'Your wallet is public.', mode: 'statement' },
  { t0: 2.05, t1: 4.0, text: 'Every transfer is a data point.', mode: 'statement', y: 300 },
  { t0: 4.1, t1: 6.5, text: '24 transfers. 6 counterparties.', mode: 'site', tag: 'WHAT ANY OBSERVER CAN COMPUTE' },
  { t0: 6.55, t1: 9.0, text: 'Every finding is labeled by certainty.', mode: 'site' },
  { t0: 9.05, t1: 11.5, text: '1.2 ETH arrives every 31 days.', mode: 'site', tag: 'HYPOTHESIS', tagKind: 'hypo' },
  { t0: 11.55, t1: 14.0, text: 'Looks like a salary. It might not be.', mode: 'site', tag: 'COULD BE RENT | A SUBSCRIPTION | A SELF-TRANSFER' },
  { t0: 14.05, t1: 16.5, text: 'Timing leaks routine.', mode: 'site', tag: 'NOT A TIMEZONE' },
  { t0: 16.55, t1: 19.0, text: 'Who you pay is a graph.', mode: 'site' },
  { t0: 19.05, t1: 21.5, text: 'Real mainnet data, independently checked.', mode: 'site', tag: 'LIDO PROTOCOL CONTRACT | NOT A PERSON' },
  { t0: 21.55, t1: 24.2, text: 'A model can suggest. Code has to verify.', mode: 'site', tag: 'OPTIONAL | OPT-IN' },
  { t0: 24.6, t1: 27.0, text: 'Read your wallet before others do.', mode: 'statement' },
];
export const CHAR_STEP = { statement: 0.028, site: 0.016 };

export const chips = {
  t0: 2.6, step: 0.12, t1: 4.0, caption: { t0: 3.2, text: 'SYNTHETIC SAMPLE | READABLE BY ANYONE WITH A BLOCK EXPLORER' },
  items: [['FROM', '0x4444...4444'], ['TO', '0x1111...1111'], ['AMOUNT', '1.2 ETH'], ['TIME', '09 JUL | 09:00 UTC'], ['AGAIN', '09 AUG | 09:00 UTC'], ['AGAIN', '09 SEP | 09:00 UTC']],
};

export const headerRight = [[0, 'LOCAL | READ-ONLY'], [4.0, 'SYNTHETIC SAMPLE DATA'], [19.0, 'RECORDED MAINNET SNAPSHOT'], [21.5, 'SYNTHETIC SAMPLE DATA'], [24.5, 'LOCAL | READ-ONLY']];

// Which captured screenshot is on screen. Viewport captures sit on top of a full-page base.
export const BASE = { evidence: 'hypo', ai: 'report' };
export const states = [[0, 'report'], [8.6, 'hypo'], [11.1, 'evidence'], [14.0, 'report'], [17.4, 'map-hover'], [19.0, 'recorded'], [21.5, 'report'], [22.3, 'ai']];
export const FADE = 0.2;

// Camera moves: ease from wherever the camera is to a target rectangle (page px).
export const camera = [
  [4.0, 4.7, { state: 'report', boxes: ['reportHead', 'overview'], pad: 30 }],
  [6.5, 7.1, { state: 'report', boxes: ['findings'], pad: 36 }],
  [9.0, 9.6, { state: 'hypo', boxes: ['f3'], pad: 60, max: 2.1 }],
  [11.2, 11.8, { state: 'evidence', boxes: ['dialog'], pad: 40 }],
  [14.0, 14.6, { state: 'report', boxes: ['f3'], pad: 60, max: 2.0 }],
  [16.5, 17.1, { state: 'report', boxes: ['map'], pad: 30 }],
  [19.0, 19.6, { state: 'recorded', boxes: ['reportHead', 'stats'], pad: 30 }],
  [21.5, 22.0, { state: 'report', boxes: ['ai'], pad: 80 }],
  [22.35, 22.9, { state: 'ai', boxes: ['dialog'], pad: 50 }],
];

// Cursor paths in page space. `at` is [state, box, fx, fy] (fractions of the box).
export const cursor = [
  { show: 7.8, hide: 8.9, points: [[7.8, ['report', 'f1', 0.6, 0.85]], [8.4, ['report', 'tabHypo', 0.5, 0.55]]], clicks: [8.5] },
  { show: 10.3, hide: 11.4, points: [[10.3, ['hypo', 'f3', 0.75, 0.4]], [10.9, ['hypo', 'view3', 0.5, 0.6]]], clicks: [11.0] },
  { show: 17.0, hide: 18.9, points: [[17.0, ['report', 'map', 0.25, 0.85]], [17.4, ['report', 'node0', 0.5, 0.2]]], clicks: [] },
  { show: 21.7, hide: 22.4, points: [[21.7, ['report', 'ai', 0.5, 0.5]], [22.1, ['report', 'aiOpen', 0.5, 0.55]]], clicks: [22.2] },
];

// Annotations drawn over the page. kind: 'accent' (dashed purple) or 'ink' (solid black).
export const callouts = [
  [4.8, 6.45, 'report', 'overviewMain', 'OBSERVED IN PUBLIC DATA', 'bottom', 'accent'],
  [5.3, 6.45, 'report', 'boundary', 'NOT DETERMINED', 'bottom', 'ink'],
  [7.1, 8.4, 'report', 'tabObserved', 'IN THE DATA', 'top', 'accent'],
  [7.35, 8.4, 'report', 'tabHypo', 'A PATTERN, NOT A FACT', 'top2', 'accent'],
  [7.6, 8.4, 'report', 'tabUnknown', 'OUT OF REACH', 'top', 'ink'],
  [9.6, 10.9, 'hypo', 'f3', 'SAME AMOUNT | ~31 DAYS APART', 'top', 'accent'],
  [11.9, 13.95, 'evidence', 'rows', 'EVERY CLAIM CITES ITS TRANSACTIONS', 'top', 'accent'],
  [12.5, 13.95, 'evidence', 'note', 'SYNTHETIC ROWS ARE LABELED', 'bottom', 'ink'],
  [14.7, 16.45, 'report', 'f3', '21 OF 24 TRANSFERS | 09:00-12:00 UTC', 'bottom', 'accent'],
  [17.5, 18.95, 'map-hover', 'node0', '12 TRANSFERS | 0x3333...3333', 'top', 'accent'],
  [17.9, 18.95, 'report', 'graph', 'EVERY LINE IS A PUBLIC LINK', 'bottom', 'ink'],
  [19.7, 21.45, 'recorded', 'provenance', '100 / 100 MATCHED AN INDEPENDENT RPC', 'bottom', 'accent'],
  [20.1, 21.45, 'recorded', 'badge', 'SAVED SNAPSHOT', 'top', 'ink'],
  [23.0, 24.2, 'ai', 'consent', 'NOTHING IS SENT WITHOUT THIS', 'bottom', 'accent'],
];

export const endCard = { t0: 27.0, t1: DURATION };

// Times of sound events, derived from the data above.
export function soundEvents() {
  const typing = headlines.flatMap(h => [...h.text].map((c, i) => c === ' ' ? null : h.t0 + i * CHAR_STEP[h.mode]).filter(v => v != null));
  const clicks = cursor.flatMap(c => c.clicks);
  return { typing, clicks };
}
