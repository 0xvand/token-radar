// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every other
// protocol the snapshot's own test calls still-to-come: it records no token, and it is not a wrapped,
// staked or bridged product of a token that already trades, not an exchange's own product and not a
// versioned release of another protocol. Protocols that record a token are kept apart and shown at the
// market's own values; pre-token products the test sets aside are shown with their reason, never ranked
// as launches. Every protocol the test passes is ranked: the radar scans the whole universe it is given,
// so a future launch is on the board the day the snapshot first carries it.
//
// Implied value is a category-peer valuation, derived from the snapshot alone:
//
//   peers        = the snapshot's protocols in the same category that DO record a token
//   ratio        = mcap_usd / tvl_usd of a peer, winsorised to [ratio_floor, ratio_cap]
//   peerMultiple = (n x median(category ratios) + shrinkage_k x median(all ratios)) / (n + shrinkage_k)
//                  (n = the category's peer count; a category with no peers gets the market median)
//   base         = tvl_usd x peerMultiple
//   momentum     = 1 + clamp(change_7d, momentum_floor, momentum_cap) / 100 x momentum_weight
//                  (an unreported change counts as 0: no momentum either way)
//   age          = age_floor + min(age_days, age_days_cap) / age_days_cap x age_range
//                  (age_days unknown: unknown_age_days; a long tokenless record is a proven product)
//   breadth      = 1 + breadth_per_chain x min(chains - 1, breadth_max_extra)
//   implied      = max(1, round(base x momentum x age x breadth))
//
// The shrinkage is the model's honesty about thin categories: one peer's ratio never prices a whole
// category, it is pulled toward the market median in proportion to how many peers back it. No protocol
// name is ever special-cased: the same function scores every row, and the dashboard shows each row's
// peer count and multiple so a reader can see how much evidence backs the number.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  shrinkage_k: number;
  ratio_floor: number;
  ratio_cap: number;
  momentum_weight: number;
  momentum_floor: number;
  momentum_cap: number;
  age_floor: number;
  age_range: number;
  age_days_cap: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_extra: number;
}

export const MODEL: ModelConstants = {
  shrinkage_k: 4,
  ratio_floor: 0.01,
  ratio_cap: 4,
  momentum_weight: 0.5,
  momentum_floor: -50,
  momentum_cap: 100,
  age_floor: 0.85,
  age_range: 0.3,
  age_days_cap: 1460,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_max_extra: 5,
};

/** The model's version label: the dashboard names it and the detail view quotes it. */
export const MODEL_VERSION = 'peer-multiple-1';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many set-aside products the Set aside view carries, by TVL. */
export const ASIDE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    peer_count: number;
    momentum_multiplier: number;
    age_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one board row. Multiples are full precision: the page recomputes. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  peer_multiple: number;
  peer_count: number;
  momentum_multiplier: number;
  age_multiplier: number;
  breadth_multiplier: number;
  implied_value_usd: number;
}

/** One category's peer evidence: how many token-bearing peers, their median ratio, the shrunk multiple. */
export interface PeerStat {
  category: string;
  peers: number;
  median: number | null;
  multiple: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A pre-token protocol the launch test sets aside, with the reason it is not a launch candidate. */
export interface AsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  reason: string;
}

/** Everything the dashboard needs: the board, the live set, the set-aside set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  global_peers: number;
  peers: PeerStat[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  aside_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  aside: AsideRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of an asset that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Categories that are products of an underlying asset or venue, not protocols awaiting a launch. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Exchanges whose own products the snapshot's test keeps off the launch list. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Why the launch test sets a pre-token protocol aside, or null when it is a launch candidate: the same
 * test the snapshot's watchlist applies at the floor, applied at every size. A bridge, staking or
 * wrapped product's worth is its underlying asset's, which already trades; an exchange's product and a
 * versioned release belong to a protocol that already has its token or its own listing.
 */
export function asideReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return 'wrapped, staked or bridged product';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped, staked or bridged product';
  if (p.category === 'CEX' || EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return 'an exchange product';
  if (VERSIONED.test(p.name)) return 'a versioned release of another protocol';
  return null;
}

/** Whether a protocol is one the board may rank: pre-token and passed by the launch test. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && asideReason(p) === null;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The peer evidence the model prices from: per-category ratios and the market-wide median. */
export interface PeerTable {
  globalMultiple: number;
  globalPeers: number;
  byCategory: Map<string, PeerStat>;
}

/**
 * The category-peer table: every protocol that records a token lends its mcap/TVL ratio to its
 * category's pool; each category's multiple is its median pulled toward the market median by the
 * shrinkage constant, in proportion to how many peers back it.
 */
export function peerTable(snapshot: Snapshot, model: ModelConstants = MODEL): PeerTable {
  const winsor = (r: number): number => Math.min(model.ratio_cap, Math.max(model.ratio_floor, r));
  const pools = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = winsor(p.mcap_usd / p.tvl_usd);
    all.push(ratio);
    const key = p.category ?? '';
    const pool = pools.get(key);
    if (pool === undefined) pools.set(key, [ratio]);
    else pool.push(ratio);
  }
  const globalMultiple = all.length > 0 ? median(all) : 0;
  const byCategory = new Map<string, PeerStat>();
  for (const [category, ratios] of pools) {
    const med = median(ratios);
    byCategory.set(category, {
      category,
      peers: ratios.length,
      median: med,
      multiple: (ratios.length * med + model.shrinkage_k * globalMultiple) / (ratios.length + model.shrinkage_k),
    });
  }
  return { globalMultiple, globalPeers: all.length, byCategory };
}

/** A category's multiple: its shrunk peer median, or the market median when it has no token-bearing peer. */
export function peerStatFor(table: PeerTable, category: string | null): PeerStat {
  const stat = table.byCategory.get(category ?? '');
  if (stat !== undefined) return stat;
  return { category: category ?? '', peers: 0, median: null, multiple: table.globalMultiple };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  table: PeerTable,
  model: ModelConstants,
): { implied: number; peerMultiple: number; peerCount: number; momentumMult: number; ageMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const stat = peerStatFor(table, protocol.category);
  const growthPct = Math.min(model.momentum_cap, Math.max(model.momentum_floor, finite(protocol.change_7d, 0)));
  const momentumMult = 1 + (growthPct / 100) * model.momentum_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const ageMult = model.age_floor + (Math.min(Math.max(ageForModel, 0), model.age_days_cap) / model.age_days_cap) * model.age_range;
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra);
  const base = protocol.tvl_usd * stat.multiple;
  const implied = Math.max(1, Math.round(base * momentumMult * ageMult * breadthMult));
  return { implied, peerMultiple: stat.multiple, peerCount: stat.peers, momentumMult, ageMult, breadthMult, age };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n: the whole still-to-come universe. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const table = peerTable(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter(isRankable)
    .map((p) => ({ p, ...impliedValue(p, snapshot.as_of, table, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      peer_multiple: round4(s.peerMultiple),
      peer_count: s.peerCount,
      momentum_multiplier: round4(s.momentumMult),
      age_multiplier: round4(s.ageMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The gas a first position costs on a chain, in the plain bands a farmer budgets by. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $12 of gas';
  if (chain === 'Solana') return 'under $1 of fees';
  return 'about $3 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category family's key, from the category's own words: one family per kind of protocol. */
function familyOf(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('liquidity manager')) return 'dex';
  if (c.includes('lend') || c.includes('collateral')) return 'lending';
  if (c.includes('cdp')) return 'cdp';
  if (c.includes('deriv') || c.includes('perpetual')) return 'perps';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('staking') || c.includes('restak')) return 'staking';
  if (c.includes('basis')) return 'basis';
  if (c.includes('curator') || c.includes('allocator') || c.includes('aggregator') || c.includes('yield')) return 'vault';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('stable')) return 'stable';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('payment') || c.includes('card')) return 'payments';
  if (c.includes('index')) return 'index';
  if (c.includes('privacy')) return 'privacy';
  if (c.includes('chain')) return 'chain';
  if (c.includes('btc')) return 'btc';
  if (c.includes('otc')) return 'otc';
  if (c.includes('governance')) return 'governance';
  if (c.includes('farm')) return 'farm';
  return 'generic';
}

/** The family's core action: the one move that makes a wallet a real user of the protocol. */
function coreAction(family: string, p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  switch (family) {
    case 'dex': return `Swap about $${capital} of USDC for the pool's other asset on ${name} (${chain}), then add the pair as liquidity to its main pool and keep the position open.`;
    case 'lending': return `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the supply open so the wallet is a live lender.`;
    case 'cdp': return `Deposit $${capital} of collateral into a ${name} vault on ${chain} and mint its stablecoin against it, keeping the vault safely above its liquidation line.`;
    case 'perps': return `Deposit $${capital} of USDC as margin on ${name} and open one small position, so the wallet trades rather than only deposits.`;
    case 'bridge': return `Bridge $${capital} of USDC from ${chain} to a second chain through ${name}, then use the bridged funds in an app on the far side.`;
    case 'staking': return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the staking receipt in the wallet.`;
    case 'basis': return `Deposit $${capital} of USDC into a ${name} basis vault on ${chain} and keep the vault shares.`;
    case 'vault': return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares in the wallet.`;
    case 'rwa': return `Mint $${capital} of ${name}'s yield asset on ${chain} with USDC and hold the asset in the wallet.`;
    case 'stable': return `Mint $${capital} of the stable asset through ${name} on ${chain}, then hold half and pool half against USDC.`;
    case 'prediction': return `Fund $${capital} on ${name} and take a position in one liquid market, sized small enough to hold to settlement.`;
    case 'insurance': return `Supply $${capital} of USDC to a ${name} underwriting pool on ${chain}, or buy a live cover if a pool is closed.`;
    case 'payments': return `Load $${capital} onto ${name} and make real payments with it, the way a card or payments user would.`;
    case 'index': return `Mint $${capital} of a ${name} index token on ${chain} and hold it in the wallet.`;
    case 'privacy': return `Route $${capital} through ${name}'s private transfer flow on ${chain} and keep the received funds in the same wallet.`;
    case 'chain': return `Bridge $${capital} of USDC onto ${name} and transact there weekly: swap, lend or pay inside its own apps so the wallet is a chain user.`;
    case 'btc': return `Deposit $${capital} of a BTC-backed asset into ${name} on ${chain} and keep the position open.`;
    case 'otc': return `Register on ${name} and complete one small OTC trade of about $${capital} so the wallet has settled history.`;
    case 'governance': return `Deposit $${capital} into ${name}'s incentive market on ${chain} and keep the position that earns the incentives.`;
    case 'farm': return `Open a $${capital} leveraged yield position on ${name} (${chain}) at its lowest leverage setting and keep it open.`;
    default: return `Deposit $${capital} of USDC into ${name} on ${chain} and use its core product once, keeping the position open.`;
  }
}

/** The family's second action: the follow-through that separates a farmer from a one-visit wallet. */
function secondAction(family: string, p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  const half = Math.max(25, Math.round(capital / 2));
  switch (family) {
    case 'dex': return `Trade actively as well: make ten swaps of $25 to $100 across at least three pairs on ${name} over the first month, not one swap on one day.`;
    case 'lending': return `Borrow about $${half} against the supply, hold the borrow for a week, then repay in full; repeat the cycle once a month so both sides of the market know the wallet.`;
    case 'cdp': return `Use the minted stablecoin rather than selling it at once: pool it or lend it inside ${name}'s own ecosystem for at least two weeks.`;
    case 'perps': return `Trade both directions over time: one small long and one small short in different weeks, each closed cleanly, so the record is trading and not a single bet.`;
    case 'bridge': return `Bridge back a smaller amount, about $${half}, a week later, and vary the route or the destination chain once, so the history is not a single hop.`;
    case 'staking': return `Put the staking receipt to work once: lend it or pool it in a venue ${name} itself lists, then unwind it back to the plain receipt.`;
    case 'basis': return `Add a second, smaller deposit of about $${half} after the first month, so the position grows the way a real allocator's would.`;
    case 'vault': return `Deposit into a second ${name} vault with a different strategy or risk setting, about $${half}, so the wallet is not in a single vault only.`;
    case 'rwa': return `Hold through at least one full yield cycle of the asset, then top up by about $${half} rather than exiting at the first distribution.`;
    case 'stable': return `Spend or transfer a small part of the stable asset to a second wallet you control, so it circulates instead of sitting minted and idle.`;
    case 'prediction': return `Take positions in at least three different markets over the season, including one you hold to settlement and claim properly.`;
    case 'insurance': return `Renew or extend the position once when its first term ends, so the cover or capital record spans more than one period.`;
    case 'payments': return `Keep using it weekly: at least one real payment or top-up a week, in varied amounts, rather than one load and silence.`;
    case 'index': return `Rebalance once with the index: add about $${half} after a month so the holding shows an ongoing allocation, not a single mint.`;
    case 'privacy': return `Make a second private transfer of a different amount at least a week later, so the usage is a pattern and not a test.`;
    case 'chain': return `Claim any chain-level rewards or faucet-style distributions ${name} offers its active wallets, and keep a small native balance for gas.`;
    case 'btc': return `Top the position up by about $${half} after a month, so the deposit history is a pattern of use.`;
    case 'otc': return `Complete a second trade in the opposite direction at least two weeks later, so the account reads as a counterparty, not a probe.`;
    case 'governance': return `Vote in every live governance vote ${name} opens to position holders while the position runs, and keep a note of each vote.`;
    case 'farm': return `Adjust the position once — add about $${half} of collateral or roll it to a neighbouring market — so it is managed, not abandoned.`;
    default: return `Use ${name}'s second surface as well — its other market, vault or tool — with about $${half}, so the wallet is a user of the whole product.`;
  }
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const family = familyOf(p);
  const steps: FarmStep[] = [
    {
      text: `Open a fresh wallet for ${p.name} and fund it with the gas token of ${chain}; keep its seed phrase offline and never farm from an exchange account.`,
      cost: `no fee to create, ${gas} to fund and make the first transaction`,
      time: '5 minutes',
    },
    {
      text: coreAction(family, p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: secondAction(family, p, capital, chain),
      cost: `about $${Math.max(25, Math.round(capital / 2))} more capital and ${gas}`,
      time: '20 minutes, then minutes a week',
    },
    {
      text: `Repeat one qualifying action every week — a deposit, a swap, a borrow or a vote — so the wallet shows a history across many snapshots, not a single visit.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
  ];
  if (p.chains.length >= 2) {
    steps.push({
      text: `Use ${p.name} on a second chain too (${p.chains[1]}): bridge a small amount over and repeat the core action there, since multi-chain users are the ones launches usually reward.`,
      cost: `about $5 for the bridge plus ${gasFor(p.chains[1]!)}`,
      time: '20 minutes once',
    });
  } else {
    steps.push({
      text: `Join ${p.name}'s governance forum and community calls, and vote or comment on live proposals so the wallet is known beyond its transactions.`,
      cost: 'no fee',
      time: '15 minutes a week',
    });
  }
  steps.push({
    text: `Hold every position for at least ${hold} days, then check ${p.name}'s own points or rewards page and claim only from the link it publishes; write the wallet, dates and transactions in a farm log.`,
    cost: `the $${capital} stays in the positions; never pay anyone to claim`,
    time: `${hold} days, then 10 minutes`,
  });
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The pre-token protocols the launch test sets aside, by TVL, for the dashboard's Set aside view. */
export function asideRows(snapshot: Snapshot): AsideRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && asideReason(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, ASIDE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      reason: asideReason(p)!,
    }));
}

/** A board row's compact form for data.js. The peer multiple is full precision: the page recomputes with it. */
export function radarRow(row: BoardRow, peerMultiple: number): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    peer_multiple: peerMultiple,
    peer_count: row.model.peer_count,
    momentum_multiplier: row.model.momentum_multiplier,
    age_multiplier: row.model.age_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    implied_value_usd: row.implied_value_usd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const table = peerTable(snapshot, model);
  const live = liveRows(snapshot);
  const aside = asideRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  // The peer evidence for every category the board names, in name order.
  const named = new Set<string>();
  for (const r of board) named.add(r.category ?? '');
  const peers: PeerStat[] = [...named]
    .sort()
    .map((category) => table.byCategory.get(category) ?? { category, peers: 0, median: null, multiple: table.globalMultiple });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: table.globalMultiple,
    global_peers: table.globalPeers,
    peers,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    aside_size: snapshot.protocols.filter((p) => isPreToken(p) && asideReason(p) !== null).length,
    rows: board.map((row) => radarRow(row, peerStatFor(table, row.category).multiple)),
    live,
    aside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
