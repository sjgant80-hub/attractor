# CLAUDE.md · attractor

Instructions for any agent working in this repository. See `SPEC.md` for the contract.

## What this is

A trajectory liveness classifier: numeric series → flatline (dead) / attractor (alive) / escaped
(runaway). `attractor.mjs` is the importable engine; `index.html` is a browser demo.

## Invariants to preserve

1. **Deterministic + honest.** No RNG, no clock. Every verdict returns its `metrics` (the evidence)
   and an `explain` string. Do not turn it into a black box that emits a bare label — the whole point
   is that it shows its working, because it is a heuristic over a finite sample, not a Lyapunov proof.
2. **Never guess on thin data.** Below `minPoints`, return `unknown`. Do not lower this to force a
   label.
3. **Divergence is checked before settling** (an escaped series can have a momentarily quiet window).
4. **Robust to junk.** Filter non-finite values; never throw on bad input.
5. **Zero dependencies.** Node standard library only. A change that reddens `npm test` does not ship.

## Run
```
npm test
```
CI runs `npm test` on every push.

## Seam

Public, general-purpose. Plain dynamical-systems language only (flatline / attractor / escaped /
bounded / diverging). Do NOT introduce private estate vocabulary or cosmology (no κ/θ/Ψ, no Lorenz
mysticism, no element or dyad references). The maths stands on its own.
