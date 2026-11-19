// Token Radar model (radar-2): one sealed snapshot in, one ranked board out.
//
// The board ranks pre-token protocols only. A protocol is pre-token when its
// snapshot record carries no token at all (mcap_usd, gecko_id and symbol all
// null). Protocols whose token already trades are never ranked: they are set
// aside with their market caps shown as the market's own numbers.
//
// Implied value follows only from the snapshot's own figures:
//
//   base     = tvl_usd x 0.30
//   growth   = clamp(change_7d, -80, 200) per cent
//   growthM  = 1 + (growth / 100) x 0.8
//   age      = days from listed_at to the snapshot's as_of (unknown: 365)
//   maturity = 0.5 + min(age, 1460) / 1460 x 0.7
//   breadth  = 1 + min(max(chains - 1, 0), 5) x 0.02
//   implied  = max(1, round(base x growthM x maturity x breadth))
//
// TVL is the size of the bet, seven-day growth is its momentum, age is how
// long the protocol has run with no token (the longer it has run, the more
// pent-up the launch), and chain breadth is how widely it operates. No
// protocol name is ever special-cased: the same function scores every row.
// Farm plans are derived from the same record (category, chains, TVL, age),
// never from a hand-written list of names.

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
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.3,
  growth_weight: 0.8,
  growth_floor: -80,
  growth_cap: 200,
  maturity_floor: 0.5,
  maturity_range: 0.7,
  maturity_days: 1460,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_cap: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One step of a farm plan: the action, what it costs, and how long it takes. */
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
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row, farm plan included so page and board agree. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  watchlist: boolean;
  farm_steps: string[];
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

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  pre_token_total: number;
  tokened_total: number;
  rows: RadarRow[];
  live: LiveRow[];
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

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap);
  const breadthMult = 1 + extraChains * model.chain_step;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, whatever the protocol's shape.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: the highest-TVL pre-token protocols below the watchlist
  // floor, capped at EARLY_ROWS. Never a replacement for a watchlist row.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isPreToken(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const watchSet = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, breadthMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, breadthMult, age };
  });
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
    token_status: 'pre-token' as const,
    watchlist: watchSet.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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

/** Gas on a chain, from the chain's own name: what a transaction costs and in what asset. */
export function gasFor(chain: string): { fee: string; unit: string } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { fee: '$6', unit: 'ETH' };
  if (c === 'solana') return { fee: '$0.05', unit: 'SOL' };
  if (c === 'base' || c === 'optimism' || c === 'arbitrum' || c === 'zksync era' || c === 'linea' || c === 'scroll' || c === 'mode' || c === 'blast' || c === 'ink' || c === 'unichain' || c === 'katana' || c === 'world chain' || c === 'abstract') return { fee: '$0.30', unit: 'ETH' };
  if (c === 'binance' || c === 'bnb chain') return { fee: '$0.20', unit: 'BNB' };
  if (c === 'polygon') return { fee: '$0.05', unit: 'POL' };
  if (c === 'avalanche') return { fee: '$0.50', unit: 'AVAX' };
  if (c === 'tron') return { fee: '$1.50', unit: 'TRX' };
  if (c === 'sui') return { fee: '$0.05', unit: 'SUI' };
  if (c === 'aptos') return { fee: '$0.05', unit: 'APT' };
  if (c === 'hyperliquid l1') return { fee: '$0.10', unit: 'HYPE' };
  if (c === 'monad') return { fee: '$0.10', unit: 'MON' };
  if (c === 'sonic') return { fee: '$0.10', unit: 'S' };
  if (c === 'berachain') return { fee: '$0.10', unit: 'BERA' };
  if (c === 'sei') return { fee: '$0.05', unit: 'SEI' };
  if (c === 'gnosis') return { fee: '$0.20', unit: 'xDAI' };
  if (c === 'mantle') return { fee: '$0.20', unit: 'MNT' };
  if (c === 'fantom') return { fee: '$0.10', unit: 'FTM' };
  if (c === 'near') return { fee: '$0.05', unit: 'NEAR' };
  if (c === 'starknet') return { fee: '$0.50', unit: 'ETH' };
  if (c === 'cronos') return { fee: '$0.20', unit: 'CRO' };
  if (c === 'plasma' || c === 'stable' || c === 'tempo' || c === 'arc') return { fee: '$0.10', unit: 'ETH' };
  return { fee: '$2', unit: 'the chain\'s gas token' };
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

/** The category's primary action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the lending position open.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in a balanced pair and keep the position open.`;
  if (c.includes('yield') || c.includes('leveraged farm')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and let the yield compound.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds inside its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and place one market position on ${chain}, sized so one loss cannot wipe the stake.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares for the full hold.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold the minted balance.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full hold.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} from the farming wallet over the hold.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC onto ${chain} through ${name}'s own app and use it in one native protocol there.`;
  if (c.includes('govern')) return `Deposit $${capital} into ${name} on ${chain} and vote or delegate in its governance from the farming wallet.`;
  if (c.includes('launchpad')) return `Commit $${capital} of USDC to ${name}'s next launch allocation on ${chain} and hold the allocation.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second leg: a different action from the first, so the plan is a routine, not one click. */
function secondFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow up to 30% of the supplied value from ${name} on ${chain} and redeposit the borrowed funds once, then leave the loop alone.`;
  if (c.includes('dex')) return `Stake the LP receipt from ${name} in its rewards gauge on ${chain}, or move it to a second pool if there is no gauge.`;
  if (c.includes('yield') || c.includes('leveraged farm')) return `Open a second, smaller vault position in ${name} on ${chain} with a different asset so the wallet shows two vaults, not one.`;
  if (c.includes('bridge')) return `Bridge a small amount back the other way through ${name} so the wallet shows two-way use, then keep the main balance working.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the receipt token from ${name} once on ${chain} if the protocol offers it, and record the new receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the first hedge on ${name} after a week and open a fresh one, so the wallet shows repeated trading rather than a single trade.`;
  if (c.includes('prediction')) return `Place a second, smaller position on a different ${name} market on ${chain} and let both resolve before touching the funds.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Allocate a second deposit to a different ${name} vault on ${chain} so the wallet holds two vault shares.`;
  if (c.includes('stable')) return `Provide the minted stable asset as liquidity in ${name}'s main pool on ${chain} for the rest of the hold.`;
  if (c.includes('rwa')) return `Check ${name}'s yield accrual on ${chain} after the first week and, if it pays out, restake the payout into the same asset.`;
  if (c.includes('insurance')) return `Add a second, smaller cover policy from ${name} on ${chain} for a different risk so the wallet holds two policies.`;
  if (c.includes('payment')) return `Set one recurring payment through ${name} on ${chain} so the wallet shows repeated use across the hold.`;
  if (c.includes('chain')) return `Stake a small part of the bridged balance in ${chain}'s native staking through ${name}'s app and keep the rest liquid.`;
  if (c.includes('govern')) return `Vote on a second ${name} proposal on ${chain} after the first, so the wallet shows sustained governance activity.`;
  if (c.includes('launchpad')) return `Register the farming wallet for ${name}'s next allocation round on ${chain} and complete any identity or holding check it asks for.`;
  return `Swap a small amount through ${name} on ${chain} so the wallet shows more than a single deposit.`;
}

/** The weekly qualifying action, worded for the category. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Each week, adjust the ${p.name} position on ${chain} once: add a little collateral, repay a little debt, or claim and redeposit rewards.`;
  if (c.includes('dex')) return `Each week, rebalance the ${p.name} pool position on ${chain} once or claim and restake the trading fees it earned.`;
  if (c.includes('bridge')) return `Each week, move a small amount through ${p.name} to ${chain} or back, so the wallet keeps showing bridge activity.`;
  if (c.includes('staking') || c.includes('restak')) return `Each week, claim the staking rewards ${p.name} pays on ${chain} and restake them instead of withdrawing.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Each week, adjust the ${p.name} hedge on ${chain} once: resize it, roll it, or take a small profit and reopen.`;
  if (c.includes('prediction')) return `Each week, place one new small position on a fresh ${p.name} market on ${chain} and let the old ones resolve.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Each week, check the ${p.name} vault on ${chain} once and claim or compound any rewards it shows.`;
  if (c.includes('govern')) return `Each week, vote on any live ${p.name} proposal on ${chain} from the farming wallet, even a small one.`;
  return `Each week, make one qualifying action in ${p.name} on ${chain}: a deposit, a swap, a claim or a vote.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * Every step is derived from the protocol's own record (category, chains, TVL,
 * age); the chain sets the gas price and asset, the category sets the actions,
 * TVL sets the capital, age sets the hold. No name is special-cased.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const otherChains = p.chains.length > 1 ? ` It also runs on ${p.chains.slice(1, 3).join(' and ')}, but farm on ${chain} first.` : '';
  return [
    {
      text: `Open a fresh wallet for this farm only, fund it on ${chain} with ${gas.unit} for gas and $${capital} of USDC to deploy.${otherChains}`,
      cost: `about ${gas.fee} of gas per transaction, plus the $${capital} of capital`,
      time: '10 minutes to set up',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas.fee} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondFor(p, capital, chain),
      cost: `about ${gas.fee} of gas and no new capital`,
      time: '10 minutes',
    },
    {
      text: weeklyFor(p, chain),
      cost: `about ${gas.fee} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the ${p.name} position on ${chain} for at least ${hold} days so the activity is counted in more than one snapshot, and do not move the funds to another wallet mid-hold.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and the ${chain} explorer, and claim only from the link the protocol itself publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log for ${p.name} on ${chain}, then unwind by reversing the steps above, starting with the second leg.`,
      cost: `about ${gas.fee} of gas per exit transaction`,
      time: '15 minutes to unwind',
    },
  ];
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

/** A board row's dashboard form, with the farm plan so page and board agree. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    watchlist: row.watchlist,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const preTotal = snapshot.protocols.filter(isPreToken).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    pre_token_total: preTotal,
    tokened_total: snapshot.protocols.length - preTotal,
    rows: board.map(radarRow),
    live,
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
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
