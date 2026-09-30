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

export const DARK = [[0, 4.0], [25.3, 99]];
export const WINDOW_IN = 4.0, WINDOW_OUT = 25.0;
export const OUT_FADE = 0.16;

export const headlines = [
  { t0: 0.1, t1: 2.0, text: 'Your wallet is public.', mode: 'statement' },
  { t0: 2.05, t1: 4.0, text: 'Every transfer is a data point.', mode: 'statement', y: 300 },
  { t0: 4.1, t1: 6.3, text: '27 transfers. 7 counterparties.', mode: 'site', tag: 'ETH AND STABLECOINS | WHAT ANY OBSERVER CAN COMPUTE' },
  { t0: 6.35, t1: 8.6, text: 'Every finding is labeled by certainty.', mode: 'site' },
  { t0: 8.65, t1: 10.8, text: '1.2 ETH arrives every 31 days.', mode: 'site', tag: 'HYPOTHESIS', tagKind: 'hypo' },
  { t0: 10.85, t1: 12.9, text: 'Looks like a salary. It might not be.', mode: 'site', tag: 'COULD BE RENT | A SUBSCRIPTION | A SELF-TRANSFER' },
  { t0: 12.95, t1: 15.0, text: 'Stealth addresses remove it.', mode: 'site', tag: 'WHAT IF | ERC-5564' },
  { t0: 15.05, t1: 17.3, text: 'Privacy pools hide the payer, not the rhythm.', mode: 'site', tag: 'WHAT IF | RAILGUN, PRIVACY POOLS' },
  { t0: 17.35, t1: 19.6, text: 'Check a transfer before you send it.', mode: 'site', tag: 'BEFORE YOU SEND' },
  { t0: 19.65, t1: 21.6, text: 'Real mainnet data, independently checked.', mode: 'site', tag: 'LIDO PROTOCOL CONTRACT | NOT A PERSON' },
  { t0: 21.65, t1: 23.6, text: 'GPT-6.1 Sol can only cite transactions.', mode: 'site', tag: 'CODE CHECKS EVERY CLAIM' },
  { t0: 23.65, t1: 25.0, text: '33 of 33 passed. Zero false findings.', mode: 'site', tag: '11 CASES | 5 NEAR-MISS TRAPS | 3 RUNS EACH' },
  { t0: 25.4, t1: 27.4, text: 'Read your wallet before others do.', mode: 'statement' },
];
export const CHAR_STEP = { statement: 0.028, site: 0.016 };

export const chips = {
  t0: 2.6, step: 0.12, t1: 4.0, caption: { t0: 3.2, text: 'SYNTHETIC SAMPLE | READABLE BY ANYONE WITH A BLOCK EXPLORER' },
  items: [['FROM', '0x4444...4444'], ['TO', '0x1111...1111'], ['AMOUNT', '1.2 ETH'], ['TIME', '09 JUL | 09:00 UTC'], ['AGAIN', '09 AUG | 09:00 UTC'], ['AGAIN', '09 SEP | 09:00 UTC']],
};

export const headerRight = [[0, 'LOCAL | READ-ONLY'], [4.0, 'SYNTHETIC SAMPLE DATA'], [19.65, 'RECORDED MAINNET SNAPSHOT'], [21.65, 'SYNTHETIC SAMPLE | REAL GPT-6.1 SOL RUNS'], [25.3, 'LOCAL | READ-ONLY']];

// Which captured screenshot is on screen. Viewport captures sit on top of a full-page base.
export const BASE = { evidence: 'hypo', ai: 'report' };
export const states = [[0, 'report'], [8.4, 'hypo'], [10.65, 'evidence'], [12.95, 'report'], [15.3, 'whatif-pool'], [18.4, 'presend'], [19.65, 'recorded'], [21.65, 'presend'], [22.5, 'model']];
export const FADE = 0.2;

// Camera moves: ease from wherever the camera is to a target rectangle (page px).
export const camera = [
  [4.0, 4.7, { state: 'report', boxes: ['reportHead', 'stats'], pad: 30 }],
  [6.35, 6.95, { state: 'report', boxes: ['findings'], pad: 36 }],
  [8.65, 9.25, { state: 'hypo', boxes: ['f3'], pad: 60, max: 2.1 }],
  [10.75, 11.35, { state: 'evidence', boxes: ['dialog'], pad: 40 }],
  [12.95, 13.6, { state: 'report', boxes: ['scnPool', 'whatifList'], pad: 24, max: 2.0 }],
  [15.3, 15.8, { state: 'whatif-pool', boxes: ['scnPool', 'whatifList'], pad: 24, max: 2.0 }],
  [17.35, 17.95, { state: 'whatif-pool', boxes: ['presendForm'], pad: 50, max: 2.0 }],
  [18.45, 18.95, { state: 'presend', boxes: ['presendResult'], pad: 30, max: 2.0 }],
  [19.65, 20.25, { state: 'recorded', boxes: ['reportHead', 'stats'], pad: 30 }],
  [21.65, 22.2, { state: 'presend', boxes: ['ai'], pad: 60 }],
  [22.55, 23.1, { state: 'model', boxes: ['evalLine', 'metrics'], pad: 40 }],
  [23.65, 24.2, { state: 'model', boxes: ['evalLine'], pad: 90, max: 2.2 }],
  [24.7, 25.3, { rect: { x: 0, y: 0, w: 1440, h: 702 } }],
];

// Cursor paths in page space. `at` is [state, box, fx, fy] (fractions of the box).
export const cursor = [
  { show: 7.7, hide: 8.6, points: [[7.7, ['report', 'f1', 0.6, 0.85]], [8.2, ['report', 'tabHypo', 0.5, 0.55]]], clicks: [8.3] },
  { show: 9.9, hide: 10.8, points: [[9.9, ['hypo', 'f3', 0.75, 0.4]], [10.4, ['hypo', 'view3', 0.5, 0.6]]], clicks: [10.55] },
  { show: 14.4, hide: 16.0, points: [[14.4, ['report', 'whatifRemoved', 0.7, 0.5]], [15.0, ['report', 'scnPool', 0.5, 0.5]]], clicks: [15.2] },
  { show: 17.6, hide: 18.9, points: [[17.6, ['whatif-pool', 'presendForm', 0.5, 0.3]], [18.1, ['whatif-pool', 'presendRun', 0.5, 0.5]]], clicks: [18.3] },
  { show: 21.9, hide: 22.8, points: [[21.9, ['presend', 'ai', 0.5, 0.5]], [22.3, ['presend', 'aiRecorded', 0.5, 0.5]]], clicks: [22.4] },
];

// Annotations drawn over the page. kind: 'accent' (dashed purple) or 'ink' (solid black).
export const callouts = [
  [4.8, 6.25, 'report', 'coverage', 'SAYS WHAT IT CANNOT SEE', 'bottom', 'accent'],
  [5.2, 6.25, 'report', 'badge', 'INVENTED DATA | CLEARLY LABELED', 'top', 'ink'],
  [6.9, 8.2, 'report', 'tabObserved', 'IN THE DATA', 'top', 'accent'],
  [7.1, 8.2, 'report', 'tabHypo', 'A PATTERN, NOT A FACT', 'top2', 'accent'],
  [7.3, 8.2, 'report', 'tabUnknown', 'OUT OF REACH', 'top', 'ink'],
  [9.2, 10.4, 'hypo', 'f3', 'SAME AMOUNT | ~31 DAYS APART', 'top', 'accent'],
  [11.4, 12.85, 'evidence', 'rows', 'EVERY CLAIM CITES ITS TRANSACTIONS', 'top', 'accent'],
  [11.9, 12.85, 'evidence', 'note', 'SYNTHETIC ROWS ARE LABELED', 'bottom', 'ink'],
  [13.7, 14.9, 'report', 'whatifRemoved', 'GONE FROM THIS ADDRESS', 'top', 'accent'],
  [15.6, 17.25, 'whatif-pool', 'whatifChanged', 'PAYER HIDDEN | SAME 1.2 ETH, SAME 31 DAYS', 'bottom', 'accent'],
  [18.8, 19.55, 'presend', 'presendLast', '13 WEEKLY TRANSFERS INSTEAD OF 12', 'top', 'accent'],
  [20.2, 21.55, 'recorded', 'provenance', '100 / 100 MATCHED AN INDEPENDENT RPC', 'bottom', 'accent'],
  [22.9, 23.6, 'model', 'metrics', '2 PROPOSED | 2 PASSED CHECKS', 'top', 'accent'],
  [24.1, 24.95, 'model', 'evalLine', 'REAL API RUNS | ~$0.13 FOR ALL 33', 'bottom', 'accent'],
];

export const endCard = { t0: 27.5, t1: DURATION };

// Times of sound events, derived from the data above.
export function soundEvents() {
  const typing = headlines.flatMap(h => [...h.text].map((c, i) => c === ' ' ? null : h.t0 + i * CHAR_STEP[h.mode]).filter(v => v != null));
  const clicks = cursor.flatMap(c => c.clicks);
  return { typing, clicks };
}
