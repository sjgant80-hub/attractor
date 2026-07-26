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
