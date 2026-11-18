[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/0xvand/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/0xvand/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

An entry for make.fun's **token-radar-01** bounty ("Build the best token launch radar").

The program reads the sealed DefiLlama snapshot (`/input/snapshot.json`) and ranks every protocol that
records no token — and is not a wrapped, staked or bridged product of one that trades — by an implied
value: what its token would be worth if issued on the record as it stands. A static dashboard shows the
ranked board, a detail view per protocol with the full valuation breakdown, and a concrete farm plan
for each.

## The model

Implied value is a category-peer valuation derived from the snapshot alone:

- **Peer multiple** — protocols in the same category that *do* record a token lend their mcap/TVL ratio
  (winsorised to [0.01, 4]); the category's multiple is its median shrunk toward the market median:
  `(n × category median + 4 × market median) / (n + 4)`. A category with no token-bearing peer is priced
  at the market median.
- **Adjustments** — momentum from 7-day TVL change (clamped), a tokenless-age factor from `listed_at`
  (a long record with no token is a proven product), and a chain-breadth factor per extra chain.
- `implied = round(TVL × peerMultiple × momentum × age × breadth)`, computed by `impliedValue` in
  `lib/model.ts`. No protocol name is special-cased; the dashboard recomputes every row in the browser
  and shows the peer evidence (peer count, category median, shrunk multiple) behind each number.

Farm plans are generated per protocol from its category family, chains, TVL and age — a core action, a
follow-through action, a weekly cadence, a breadth or governance step, and a hold-and-claim step, each
with a cost and a time.

## Layout

- `main.ts` — the entrypoint (Node 22, standard library only): reads the snapshot, writes
  `/output/board.json` and `/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and
  writes `/output/dossier.json` via the vendored library.
- `lib/model.ts` — the valuation model, the launch test, the farm-plan generator, and the gate check.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte as the kit ships it.
- `dashboard/` — the static page (board, detail view, filters, methodology and peer table); it renders
  fully offline from `data.js`.
- `screenshots/` — renders of the dashboard: the board, a detail view, a filtered view.

Run it the way the grader does:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Licensed under the MIT License (see `LICENSE`).
