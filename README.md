# attractor

**Live:** [sjgant80-hub.github.io/attractor](https://sjgant80-hub.github.io/attractor/)

A trajectory **liveness classifier**. Give it a numeric series — a metric over time, an agent's score
across runs, a repo's commit cadence, a biomarker trend — and it tells you which dynamical regime the
system is in:

- **FLATLINE** — settled to a fixed point; it no longer moves. Dead / converged / stuck.
- **ATTRACTOR** — bounded but never settling; keeps varying within a range. Alive, self-sustaining.
- **ESCAPED** — magnitude running away without bound. Diverging / runaway.

## Use

```js
import { classify, isAlive } from './attractor.mjs';

classify([5,5,5,5,5,5,5,5]).class;              // 'flatline'
classify([0,1,0,-1,0,1,0,-1,0,1,0,-1]).class;   // 'attractor'
classify([1,2,4,8,16,32,64,128]).class;         // 'escaped'
isAlive(mySeries);                               // true only for a bounded attractor
```

Every verdict comes with the evidence (`metrics`: bounds, recent variance, growth) and a plain
explanation — it's a heuristic over a finite sample, not a formal Lyapunov exponent, so it shows its
working rather than asking you to trust a bare label.

## Test

```
npm test
```

Zero dependencies. Deterministic: the same series always yields the same verdict.
