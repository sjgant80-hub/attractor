// ════════════════════════════════════════════════════════════════
// attractor · a trajectory liveness classifier
//
// Feed it a numeric trajectory — a metric over time, an agent's score across runs, a repo's
// commit cadence, a biomarker series — and it tells you which of three dynamical regimes the system
// is in:
//
//   • FLATLINE — the trajectory has settled to a fixed point; it no longer moves. A dead / converged
//     / stuck system. (Not always bad: a controller that reached its setpoint is "flatline".)
//   • ATTRACTOR — bounded but never settling: it keeps varying within a range without converging or
//     diverging. The signature of a live, self-sustaining system.
//   • ESCAPED — the magnitude is running away without bound. A diverging / runaway system.
//
// This is a heuristic classifier over a finite sample, not a formal Lyapunov analysis — it reports
// the evidence (bounds, recent variance, growth) alongside the label so you can judge. Zero
// dependencies, pure and deterministic: the same series always yields the same verdict.
// ════════════════════════════════════════════════════════════════

export const CLASS = { FLATLINE: 'flatline', ATTRACTOR: 'attractor', ESCAPED: 'escaped', UNKNOWN: 'unknown' };

const DEFAULTS = {
  minPoints: 8,      // below this there isn't enough trajectory to judge
  flatEps: 0.02,     // recent std-dev below this fraction of the trajectory's scale ⇒ settled
  escapeGrowth: 3,   // last-quarter magnitude this many× the first-quarter's ⇒ candidate runaway
};

export function classify(series, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const xs = (Array.isArray(series) ? series : []).map(Number).filter(Number.isFinite);
  if (xs.length < o.minPoints) return { class: CLASS.UNKNOWN, alive: false, reason: `need at least ${o.minPoints} finite points, got ${xs.length}` };

  const n = xs.length;
  const half = Math.floor(n / 2);
  const q = Math.max(2, Math.floor(n / 4));
  const second = xs.slice(half);
  const firstQ = xs.slice(0, q);
  const lastQ = xs.slice(n - q);

  const min = Math.min(...xs), max = Math.max(...xs);
  const range = max - min;
  const scale = Math.max(range, meanAbs(xs), 1e-9);

  const varSecond = variance(second);
  const stdSecond = Math.sqrt(varSecond);
  const magFirst = meanAbs(firstQ), magLast = meanAbs(lastQ);
  const growth = magLast / Math.max(magFirst, 1e-9);

  // Divergence: magnitude has grown strongly AND is still trending up across successive windows.
  const windowMags = chunkMeans(xs.map(Math.abs), 4);
  const diverging = growth > o.escapeGrowth && isTrendingUp(windowMags);
  // Settled: the recent portion barely moves relative to the trajectory's own scale.
  const settled = stdSecond < o.flatEps * scale;

  let cls;
  if (diverging) cls = CLASS.ESCAPED;
  else if (settled) cls = CLASS.FLATLINE;
  else cls = CLASS.ATTRACTOR;

  return {
    class: cls,
    alive: cls === CLASS.ATTRACTOR,
    metrics: {
      n, min: r4(min), max: r4(max), range: r4(range),
      recentStd: r4(stdSecond), scale: r4(scale),
      growth: r4(growth), settled, diverging,
    },
    explain: EXPLAIN[cls],
  };
}

const EXPLAIN = {
  [CLASS.FLATLINE]: 'Settled to a fixed point — recent variation is negligible. Converged or stuck.',
  [CLASS.ATTRACTOR]: 'Bounded but never settling — keeps moving within a range. A live, self-sustaining regime.',
  [CLASS.ESCAPED]: 'Magnitude is running away without bound. Diverging / runaway.',
  [CLASS.UNKNOWN]: 'Not enough trajectory to classify.',
};

// Convenience: is the system alive (a bounded, non-trivial attractor)?
export function isAlive(series, opts) { return classify(series, opts).alive; }

// ── stats helpers (pure) ─────────────────────────────────────────────────────
function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function meanAbs(a) { return a.reduce((s, x) => s + Math.abs(x), 0) / a.length; }
function variance(a) { if (a.length < 2) return 0; const m = mean(a); return a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length; }
function chunkMeans(a, k) {
  const size = Math.max(1, Math.floor(a.length / k));
  const out = [];
  for (let i = 0; i < a.length; i += size) out.push(meanAbs(a.slice(i, i + size)));
  return out;
}
// Trending up = each successive window is >= the previous (allowing tiny noise), net strongly up.
function isTrendingUp(w) {
  if (w.length < 2) return false;
  let ups = 0;
  for (let i = 1; i < w.length; i++) if (w[i] >= w[i - 1] * 0.98) ups++;
  return ups >= w.length - 2 && w[w.length - 1] > w[0] * 1.5;
}
function r4(x) { return Math.round(x * 10000) / 10000; }

export default classify;
