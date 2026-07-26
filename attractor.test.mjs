#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, isAlive, CLASS } from './attractor.mjs';

// deterministic generators (no RNG — reproducible trajectories)
const constant = (v, n) => Array.from({ length: n }, () => v);
const converging = n => Array.from({ length: n }, (_, i) => 10 / (i + 1));        // → 0
const sine = n => Array.from({ length: n }, (_, i) => Math.sin(i * 0.6) * 5);      // bounded, sustained
const exponential = n => Array.from({ length: n }, (_, i) => Math.pow(1.5, i));    // → ∞
const linearGrow = n => Array.from({ length: n }, (_, i) => i * 3);                // → ∞
// bounded pseudo-chaotic via the logistic map at r=3.9 (stays in [0,1], never repeats)
function logistic(n) { const out = []; let x = 0.4; for (let i = 0; i < n; i++) { x = 3.9 * x * (1 - x); out.push(x); } return out; }

test('a constant series is FLATLINE (dead / settled)', () => {
  const r = classify(constant(7, 40));
  assert.equal(r.class, CLASS.FLATLINE);
  assert.equal(r.alive, false);
});

test('a series converging to a fixed point is FLATLINE', () => {
  const r = classify(converging(60));
  assert.equal(r.class, CLASS.FLATLINE);
});

test('a bounded oscillation (sine) is ATTRACTOR (alive)', () => {
  const r = classify(sine(60));
  assert.equal(r.class, CLASS.ATTRACTOR);
  assert.equal(r.alive, true);
});

test('a bounded chaotic series (logistic map r=3.9) is ATTRACTOR (alive)', () => {
  const r = classify(logistic(80));
  assert.equal(r.class, CLASS.ATTRACTOR, 'never settles, never diverges');
  assert.ok(r.metrics.range > 0.3, 'genuinely varying');
});

test('an exponential series is ESCAPED (runaway)', () => {
  const r = classify(exponential(30));
  assert.equal(r.class, CLASS.ESCAPED);
  assert.equal(r.metrics.diverging, true);
});

test('a linearly growing series is ESCAPED', () => {
  const r = classify(linearGrow(40));
  assert.equal(r.class, CLASS.ESCAPED);
});

test('isAlive is true only for the bounded attractor', () => {
  assert.equal(isAlive(sine(60)), true);
  assert.equal(isAlive(constant(3, 40)), false);
  assert.equal(isAlive(exponential(30)), false);
});

test('too-short series is UNKNOWN, never guessed', () => {
  const r = classify([1, 2, 3]);
  assert.equal(r.class, CLASS.UNKNOWN);
  assert.match(r.reason, /at least 8/);
});

test('non-numeric junk is filtered to EXACTLY the real numbers, not coerced to 0', () => {
  // 9 real numbers + junk that Number() would turn into 0 (null, '', false, [], undefined, NaN, 'x')
  const r = classify([1, 'x', null, 2, undefined, 3, NaN, 4, '', 5, false, 6, [], 7, 8, 9]);
  assert.equal(r.metrics.n, 9, 'kept exactly the 9 numeric values, dropped every junk value');
});

test('an all-junk array is UNKNOWN, never a fabricated FLATLINE at 0', () => {
  const r = classify([null, '', false, [], undefined, NaN, 'x', {}]);
  assert.equal(r.class, CLASS.UNKNOWN, 'no real data → no verdict');
});

test('a bounded step-response that settles at a setpoint is FLATLINE, not ESCAPED', () => {
  // ramps 0→10 over the first half then holds at 10 — high growth ratio but a flat, settled tail
  const step = Array.from({ length: 40 }, (_, i) => (i < 20 ? i * 0.5 : 10));
  const r = classify(step);
  assert.equal(r.class, CLASS.FLATLINE, 'reached its setpoint — dead/settled, not a runaway');
  assert.equal(r.metrics.diverging, false);
});

test('a bounded oscillation with a QUIET START (delayed onset) is ATTRACTOR, not ESCAPED', () => {
  // silent for the first quarter, then a sustained bounded oscillation — a booting live system
  const boot = Array.from({ length: 60 }, (_, i) => (i < 15 ? 0 : 3 * Math.sin(i * 0.6)));
  const r = classify(boot);
  assert.equal(r.class, CLASS.ATTRACTOR, 'a near-zero start must not read as runaway');
  assert.equal(r.metrics.diverging, false);
});

test('a bounded oscillation whose AMPLITUDE ramps then holds is ATTRACTOR, not ESCAPED', () => {
  const ramp = Array.from({ length: 60 }, (_, i) => Math.min(5, 0.1 + i * 0.16) * Math.sin(i * 0.6));
  assert.equal(classify(ramp).class, CLASS.ATTRACTOR);
});

test('classification is translation-invariant — a DC offset does not flip alive↔dead', () => {
  for (const base of [0, 100, 1000, -1000]) {
    const osc = Array.from({ length: 60 }, (_, i) => base + Math.sin(i * 0.6) * 5);
    assert.equal(classify(osc).class, CLASS.ATTRACTOR, `sine on baseline ${base} is still a live oscillation`);
  }
  // and a genuine flatline stays flat regardless of level
  assert.equal(classify(constant(1000, 40)).class, CLASS.FLATLINE);
});

test('numeric STRINGS are accepted as data (the kept-branch is exercised)', () => {
  const r = classify(['0', '1', '0', '-1', '0', '1', '0', '-1', '0', '1', '0', '-1']);
  assert.notEqual(r.class, CLASS.UNKNOWN, 'numeric strings count as real points');
  assert.equal(r.metrics.n, 12);
});

test('a linear runaway is ESCAPED at ODD sample lengths too (even windowing)', () => {
  for (const n of [9, 11, 13, 15, 40]) {
    assert.equal(classify(Array.from({ length: n }, (_, i) => i * 3)).class, CLASS.ESCAPED, `n=${n}`);
  }
});

test('a large valid input does not crash (no array-spread stack overflow)', () => {
  const big = Array.from({ length: 200000 }, (_, i) => Math.sin(i * 0.1) * 5);
  const r = classify(big);
  assert.equal(r.class, CLASS.ATTRACTOR, 'a 200k-point bounded oscillation classifies without crashing');
});

test('classification is deterministic — same series, same verdict', () => {
  const s = logistic(80);
  assert.deepEqual(classify(s), classify(s));
});

test('the explanation matches the verdict (not just any long string)', () => {
  assert.match(classify(constant(5, 20)).explain, /settled|fixed point|converged/i);
  assert.match(classify(sine(40)).explain, /bounded|never settling|self-sustaining/i);
  assert.match(classify(exponential(25)).explain, /running away|diverging|runaway/i);
});

// ── boundary/branch tests designed against witness mutation survivors ─────────

test('EXACTLY minPoints (8) points is enough to classify — not UNKNOWN (< boundary)', () => {
  // pins the `xs.length < o.minPoints` boundary: 8 points must pass, not be rejected.
  // a `<=` mutant would reject exactly-8 as UNKNOWN.
  const r = classify([0, 1, 0, -1, 0, 1, 0, -1]);
  assert.notEqual(r.class, CLASS.UNKNOWN, '8 finite points meets the minimum');
  assert.equal(r.metrics.n, 8);
});

test('metrics.growth is the finite last/first envelope ratio, never NaN (index -1)', () => {
  // pins `windowPeaks[windowPeaks.length - 1]`: a `+ 1` mutant reads past the end (undefined)
  // and makes growth NaN. Assert it is finite and equals lastPeak/firstPeak for a linear runaway.
  const r = classify(Array.from({ length: 40 }, (_, i) => i * 3));
  assert.ok(Number.isFinite(r.metrics.growth), 'growth must be a finite number, not NaN');
  assert.ok(r.metrics.growth > 1, 'a runaway grows across its envelope');
});

test('variance of a length-2 tail is computed, not short-circuited to 0 (< 2 guard)', () => {
  // with minPoints lowered so the second-half tail is exactly 2 points, the variance guard
  // `a.length < 2` must still compute a real variance. A `<= 2` mutant returns 0 → std 0 →
  // spuriously "settled" → FLATLINE. Correct code sees the oscillation and returns ATTRACTOR.
  const r = classify([0, 5, 0, 5], { minPoints: 4 });
  assert.equal(r.class, CLASS.ATTRACTOR, 'a moving length-2 tail is not settled');
  assert.equal(r.metrics.settled, false);
});

test('window peaks use half-open [lo,hi) ranges — no boundary bleed (< hi loop)', () => {
  // Designed so an `i <= hi` mutant pulls the next window\'s leading value into the current
  // window: that flattens the envelope\'s final ratio below 1.15, so the mutant sees ATTRACTOR
  // while the correct half-open windowing sees a genuine runaway.
  const r = classify([1, 3, 5, 7, 9, 11, 100, 50]);
  assert.equal(r.class, CLASS.ESCAPED, 'last-window spike is a runaway envelope');
  assert.equal(r.metrics.diverging, true);
});

test('envelope growth uses strict > 1.15× per window — a ratio of exactly 1.15 still expands (< boundary)', () => {
  // second window peak is EXACTLY 1.15× the first (1 → 1.15). The check `peaks[i] < peaks[i-1]*1.15`
  // must treat equality as "still expanding" (strict <). A `<=` mutant would reject the exact-1.15
  // step as a plateau and mislabel this clear runaway as non-escaped.
  const r = classify([1, 1, 1.15, 1.15, 3, 3, 10, 10]);
  assert.equal(r.class, CLASS.ESCAPED, 'a window at exactly 1.15× is still part of an expanding envelope');
});

test('divergence requires BOTH last===peak AND net growth past the factor (&& not ||)', () => {
  // a monotonic envelope [1, 1.2, 1.44, 1.728]: every window grows >15% (last IS the global peak),
  // but net growth (1.728×) never reaches the escape factor (3×). Correct AND ⇒ ATTRACTOR.
  // An `||` mutant fires on the "last===peak" clause alone and wrongly calls it ESCAPED.
  const r = classify([1, 1, 1.2, 1.2, 1.44, 1.44, 1.728, 1.728]);
  assert.equal(r.class, CLASS.ATTRACTOR, 'monotonic but sub-threshold growth is a live attractor, not runaway');
  assert.equal(r.metrics.diverging, false);
});

test('escape needs net growth STRICTLY past the factor — exactly factor× is not escaped (> boundary)', () => {
  // envelope [1, 1.4, 2, 3]: last peak is EXACTLY 3× the first (== escapeGrowth factor 3).
  // `last > peaks[0]*factor` is strict, so exactly-3× does NOT diverge ⇒ ATTRACTOR.
  // A `>=` mutant would treat the exact factor as a runaway and flip it to ESCAPED.
  const r = classify([1, 1, 1.4, 1.4, 2, 2, 3, 3]);
  assert.equal(r.class, CLASS.ATTRACTOR, 'reaching exactly the escape factor is the boundary, not past it');
  assert.equal(r.metrics.diverging, false);
});
