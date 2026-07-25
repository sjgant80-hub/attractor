# attractor · design note

> Spec: **attractor-spec-v1**. The engineering contract of the liveness classifier.

## Surface

`attractor.mjs` exports:

- `classify(series, opts?)` → `{ class, alive, metrics, explain }` where `class` ∈ {flatline,
  attractor, escaped, unknown}.
- `isAlive(series, opts?)` → boolean (true only for a bounded attractor).
- `CLASS` — the label constants.

## The classification

Over a finite numeric sample:

1. **ESCAPED** if the magnitude has grown strongly (last-quarter mean-abs > `escapeGrowth`× the
   first-quarter's) AND is still trending up across successive windows. Divergence wins first.
2. Else **FLATLINE** if the recent std-dev is below `flatEps` × the trajectory's own scale — it has
   settled to a fixed point.
3. Else **ATTRACTOR** — bounded and still moving.
4. **UNKNOWN** below `minPoints` (default 8): never guess without enough trajectory.

## Invariants

1. **Deterministic.** Same series + same opts ⇒ identical verdict (no RNG, no clock).
2. **Honest.** Returns the evidence (`metrics`) and an `explain` string with every label; documented
   as a heuristic over a sample, not a formal dynamical-systems proof.
3. **Robust.** Non-finite values are filtered, not crashed on; short input returns `unknown`.
4. **Zero dependencies.**

## Verification

`npm test` — classifies known trajectories: constant + converging (flatline), sine + logistic-map
r=3.9 (attractor), exponential + linear growth (escaped), plus determinism, filtering, and short-input
guards. CI runs it on every push.
