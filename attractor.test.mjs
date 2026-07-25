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

test('non-numeric junk is filtered, not crashed on', () => {
  const r = classify([1, 'x', null, 2, undefined, 3, NaN, 4, 5, 6, 7, 8, 9]);
  assert.notEqual(r.class, undefined);
  assert.ok(r.metrics.n >= 8, 'kept only the finite points');
});

test('classification is deterministic — same series, same verdict', () => {
  const s = logistic(80);
  assert.deepEqual(classify(s), classify(s));
});

test('every verdict carries a human explanation', () => {
  for (const s of [constant(5, 20), sine(40), exponential(25)]) {
    assert.ok(classify(s).explain && classify(s).explain.length > 10);
  }
});
