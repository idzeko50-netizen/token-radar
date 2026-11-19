# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/idzeko50-netizen/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/idzeko50-netizen/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar: a pre-token protocol launch radar. It reads a sealed snapshot
of every protocol DefiLlama tracks, ranks the 200 most promising protocols
that record no token by the implied value of a token launch, and hands the
reader a concrete farm plan for each one — with a sortable, filterable
dashboard (board, per-protocol detail view, live-token tab) that renders
with no network.

## Model

Implied value from the snapshot's own figures only — no hardcoded names:

- **Size**: TVL is the bet. `implied = TVL x 0.30`, the base multiple.
- **Momentum**: 7-day TVL change, clamped to −80…+200%, weighted 0.8.
- **Maturity**: how long the protocol has run with no token (days since
  `listed_at`, capped at 1,460), scaling 0.5–1.2. A protocol that survived
  years without a token has more pent-up launch value; unknown age counts
  as 365 days.
- **Breadth**: chain count adds up to 10%.

Board: all 40 watchlist protocols (TVL ≥ $50M, no token recorded, not a
wrapped/staked/bridged product) plus the 160 highest-TVL pre-token
protocols below the floor. The 416 protocols that already record a token
are never ranked; the dashboard's Live tab shows the top 24 by market cap
for comparison. Deterministic (no randomness, no clock dependence),
Node 22 standard library only; two runs write byte-identical output.

## Farm plans

7 steps per protocol, derived from its category, first chain, TVL and age:
chain-specific gas costs, capital of $50–$250 by TVL, 30/45/60-day holds
by age, and category-specific primary, second-leg and weekly actions —
each step carrying what it costs and how long it takes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Reads the sealed snapshot and writes `out/board.json` (200 ranked rows),
`out/data.js` (the dashboard's data), `out/dashboard/` (the page),
`out/screenshots/` (board, detail and filtered views) and
`out/dossier.json` (built with `vendor/makefun-board.ts`).

---

Built for the [token-radar-01](https://make.fun/bounty/token-radar-01)
bounty on [make.fun](https://make.fun/r/ad0wkz82) (referral code `ad0wkz82`).
