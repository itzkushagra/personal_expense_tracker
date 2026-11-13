import { daysInMonth } from "@/lib/dates";
import type {
  FundCategory,
  InvestmentAssetType,
  InvestmentSip,
  InvestmentHolding,
  InvestmentTransaction,
  InvestmentTransactionType,
} from "@/types";

/**
 * Manual portfolio maths. Cost basis uses the average-cost method (what Indian mutual fund
 * statements show): a sale removes units at the holding's average cost so far, and the
 * difference between the sale proceeds and that cost is the realised gain.
 */

type Txn = Pick<InvestmentTransaction, "type" | "date" | "quantity" | "price" | "fees"> &
  Partial<Pick<InvestmentTransaction, "id" | "created_at">>;

const money = (n: number) => Math.round(n * 100) / 100;
const units = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Cash a transaction moves, always ≥ 0: a buy costs quantity × price + fees, a sale brings in
 * quantity × price − fees. An "opening" position moves no cash (you already owned it); its
 * quantity × price + fees is only its cost basis.
 */
export function cashAmount(t: Pick<Txn, "type" | "quantity" | "price" | "fees">): number {
  const gross = Number(t.quantity) * Number(t.price);
  const fees = Number(t.fees || 0);
  if (t.type === "opening") return 0;
  return money(t.type === "sell" ? Math.max(0, gross - fees) : gross + fees);
}

/** Signed ledger amount for the cash account: − for a buy, + for a sale, 0 for opening. */
export function cashDelta(t: Pick<Txn, "type" | "quantity" | "price" | "fees">): number {
  if (t.type === "opening") return 0;
  return t.type === "sell" ? cashAmount(t) : -cashAmount(t);
}

/** Oldest first; same-day rows in the order they were entered. */
export function chronological<T extends Txn>(txns: T[]): T[] {
  return [...txns].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.created_at ?? "").localeCompare(b.created_at ?? "")
  );
}

export interface Position {
  /** Units held now. */
  quantity: number;
  /** Average cost of the units still held (including buy fees). */
  cost_basis: number;
  /** Everything put in: buys and opening positions, including fees. */
  total_invested: number;
  /** Proceeds from sales after fees. */
  total_proceeds: number;
  /** Gain or loss already locked in by sales. */
  realized_gain: number;
  /** Average cost per unit held (0 when nothing is held). */
  average_cost: number;
}

/** Replay transactions in date order. Throws if a sale would sell more units than are held. */
export function positionFrom(txns: Txn[]): Position {
  let quantity = 0;
  let cost = 0;
  let invested = 0;
  let proceeds = 0;
  let realized = 0;
  for (const t of chronological(txns)) {
    const q = Number(t.quantity);
    const gross = q * Number(t.price);
    const fees = Number(t.fees || 0);
    if (t.type === "sell") {
      if (q > quantity + 1e-9) {
        throw new OversellError(t.date, q, quantity);
      }
      const costSold = quantity > 0 ? (cost / quantity) * q : 0;
      const net = Math.max(0, gross - fees);
      realized += net - costSold;
      proceeds += net;
      cost -= costSold;
      quantity -= q;
      if (quantity < 1e-9) {
        quantity = 0;
        cost = 0;
      }
    } else {
      quantity += q;
      cost += gross + fees;
      invested += gross + fees;
    }
  }
  return {
    quantity: units(quantity),
    cost_basis: money(cost),
    total_invested: money(invested),
    total_proceeds: money(proceeds),
    realized_gain: money(realized),
    average_cost: quantity > 0 ? cost / quantity : 0,
  };
}

export class OversellError extends Error {
  constructor(
    public date: string,
    public selling: number,
    public held: number
  ) {
    super(`On ${date} this sells ${units(selling)} units but only ${units(held)} are held then`);
  }
}

/** null when the transactions are consistent, otherwise a message for the user. */
export function validateTransactions(txns: Txn[]): string | null {
  try {
    positionFrom(txns);
    return null;
  } catch (e) {
    if (e instanceof OversellError) return e.message;
    throw e;
  }
}

export interface HoldingSummary extends Position {
  /** quantity × latest price, or the cost basis when no price has been entered. */
  current_value: number;
  /** current_value − cost_basis. */
  unrealized_gain: number;
  /** Unrealised gain as a % of the cost basis (null when nothing is held). */
  unrealized_pct: number | null;
  /** True when no price has been entered, so the value shown is the cost. */
  valued_at_cost: boolean;
}

export function summarizeHolding(
  holding: Pick<InvestmentHolding, "current_price">,
  txns: Txn[]
): HoldingSummary {
  const pos = positionFrom(txns);
  const priced = holding.current_price !== null && holding.current_price !== undefined;
  const value = priced ? money(pos.quantity * Number(holding.current_price)) : pos.cost_basis;
  const gain = money(value - pos.cost_basis);
  return {
    ...pos,
    current_value: value,
    unrealized_gain: gain,
    unrealized_pct: pos.cost_basis > 0 ? (gain / pos.cost_basis) * 100 : null,
    valued_at_cost: !priced,
  };
}

export interface PortfolioSummary {
  /** Cost of what is held now. */
  invested: number;
  current_value: number;
  unrealized_gain: number;
  unrealized_pct: number | null;
  realized_gain: number;
  /** Share of current value by asset type, largest first. */
  allocation: { asset_type: InvestmentAssetType; value: number; pct: number }[];
  /** Funds with a category (large / mid / small cap...): share of their combined value. */
  by_fund_category: { category: Exclude<FundCategory, "">; value: number; pct: number }[];
  holding_count: number;
}

export function summarizePortfolio(
  holdings: { asset_type: InvestmentAssetType; fund_category?: FundCategory; summary: HoldingSummary }[]
): PortfolioSummary {
  const invested = money(holdings.reduce((s, h) => s + h.summary.cost_basis, 0));
  const value = money(holdings.reduce((s, h) => s + h.summary.current_value, 0));
  const realized = money(holdings.reduce((s, h) => s + h.summary.realized_gain, 0));
  const byType = new Map<InvestmentAssetType, number>();
  for (const h of holdings) {
    if (h.summary.current_value <= 0) continue;
    byType.set(h.asset_type, (byType.get(h.asset_type) ?? 0) + h.summary.current_value);
  }
  const allocation = [...byType.entries()]
    .map(([asset_type, v]) => ({ asset_type, value: money(v), pct: value > 0 ? (v / value) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  const byCategory = new Map<Exclude<FundCategory, "">, number>();
  for (const h of holdings) {
    if (!h.fund_category || h.summary.current_value <= 0) continue;
    byCategory.set(h.fund_category, (byCategory.get(h.fund_category) ?? 0) + h.summary.current_value);
  }
  const categorised = [...byCategory.values()].reduce((sum, v) => sum + v, 0);
  const by_fund_category = [...byCategory.entries()]
    .map(([category, v]) => ({ category, value: money(v), pct: categorised > 0 ? (v / categorised) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  return {
    invested,
    current_value: value,
    unrealized_gain: money(value - invested),
    unrealized_pct: invested > 0 ? ((value - invested) / invested) * 100 : null,
    realized_gain: realized,
    allocation,
    by_fund_category,
    holding_count: holdings.filter((h) => h.summary.quantity > 0).length,
  };
}

const TYPES: InvestmentTransactionType[] = ["buy", "sell", "opening"];
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export interface TransactionInput {
  type: InvestmentTransactionType;
  date: string;
  quantity: number;
  price: number;
  fees: number;
  account_id: string | null;
  note: string;
  sip_id: string | null;
}

/**
 * Units bought for an amount, the way fund houses allot them: (amount - charges) / NAV,
 * rounded to 4 decimal places.
 */
export function unitsForAmount(amount: number, nav: number, fees = 0): number {
  if (!(nav > 0)) return 0;
  return Math.round(((amount - fees) / nav) * 10000) / 10000;
}

/** Check a transaction from a request body. Returns the cleaned row or a message. */
export function parseTransactionInput(body: Record<string, unknown>): { value: TransactionInput } | { error: string } {
  const type = body.type as InvestmentTransactionType;
  if (!TYPES.includes(type)) return { error: "Type must be buy, sell or opening" };
  if (!isDate(body.date)) return { error: "Enter a valid date" };
  const price = Number(body.price);
  const fees = body.fees === undefined || body.fees === null || body.fees === "" ? 0 : Number(body.fees);
  if (!Number.isFinite(price) || price < 0) return { error: "Price can't be negative" };
  if (!Number.isFinite(fees) || fees < 0) return { error: "Fees can't be negative" };
  // Buying "by amount" (how SIPs work): units = (amount - charges) / NAV.
  const noQuantity = body.quantity === undefined || body.quantity === null || body.quantity === "";
  const byAmount = noQuantity && body.amount !== undefined && body.amount !== null && body.amount !== "";
  let quantity = Number(body.quantity);
  if (byAmount) {
    const amount = Number(body.amount);
    if (type === "sell") return { error: "Enter the units sold" };
    if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be more than 0" };
    if (!(price > 0)) return { error: "Enter the NAV / price to work out the units" };
    if (fees >= amount) return { error: "Charges can't be the whole amount" };
    quantity = unitsForAmount(amount, price, fees);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantity must be more than 0" };
  if (type === "sell" && fees > quantity * price) return { error: "Fees can't be more than the sale amount" };
  const account = typeof body.account_id === "string" && body.account_id ? body.account_id : null;
  return {
    value: {
      type,
      date: body.date as string,
      quantity,
      price,
      fees,
      // Units you already owned didn't move cash now.
      account_id: type === "opening" ? null : account,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : "",
      sip_id: type === "buy" && typeof body.sip_id === "string" && body.sip_id ? body.sip_id : null,
    },
  };
}

/** Postgres / PostgREST errors meaning a table isn't there yet (migration not applied). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message ?? "");
}

const ASSET_TYPES: InvestmentAssetType[] = [
  "mutual_fund", "stock", "etf", "bond", "fixed_deposit", "gold", "crypto", "retirement", "other",
];

const FUND_CATEGORIES: FundCategory[] = [
  "", "large_cap", "mid_cap", "small_cap", "large_mid_cap", "flexi_cap", "multi_cap", "focused", "value",
  "elss", "index", "sectoral", "international", "hybrid", "debt", "liquid", "gold_silver", "other",
];

export interface HoldingInput {
  name?: string;
  asset_type?: InvestmentAssetType;
  fund_category?: FundCategory;
  symbol?: string;
  current_price?: number | null;
  valued_on?: string | null;
  note?: string;
  is_active?: boolean;
}

/**
 * Check holding fields from a request body. `partial` (an edit) only checks the fields sent.
 * Entering a price without a date stamps it with `today`.
 */
export function parseHoldingInput(
  body: Record<string, unknown>,
  { partial, today }: { partial: boolean; today: string }
): { value: HoldingInput } | { error: string } {
  const v: HoldingInput = {};
  if (!partial || "name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "Give the holding a name" };
    v.name = name.slice(0, 120);
  }
  if (!partial || "asset_type" in body) {
    const type = (body.asset_type ?? "mutual_fund") as InvestmentAssetType;
    if (!ASSET_TYPES.includes(type)) return { error: "Unknown asset type" };
    v.asset_type = type;
  }
  if ("fund_category" in body) {
    const c = (body.fund_category ?? "") as FundCategory;
    if (!FUND_CATEGORIES.includes(c)) return { error: "Unknown fund category" };
    v.fund_category = c;
  }
  if ("symbol" in body) v.symbol = typeof body.symbol === "string" ? body.symbol.trim().slice(0, 40) : "";
  if ("note" in body) v.note = typeof body.note === "string" ? body.note.slice(0, 500) : "";
  if ("is_active" in body) v.is_active = body.is_active !== false;
  if ("current_price" in body) {
    const raw = body.current_price;
    if (raw === null || raw === "" || raw === undefined) {
      v.current_price = null;
      v.valued_on = null;
    } else {
      const price = Number(raw);
      if (!Number.isFinite(price) || price < 0) return { error: "Current price can't be negative" };
      v.current_price = price;
      v.valued_on = isDate(body.valued_on) ? body.valued_on : today;
    }
  }
  return { value: v };
}

// --- SIPs ---

/** The date a SIP instalment falls on in a month (day 29-31 clamps to the month's last day). */
export function sipDueDate(sip: Pick<InvestmentSip, "day_of_month">, year: number, month: number): string {
  const day = Math.min(sip.day_of_month, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type SipState = "logged" | "due" | "upcoming" | "paused" | "not_started";

export interface SipStatus {
  /** This month's instalment date. */
  due_date: string;
  state: SipState;
  /** This month's instalment, when logged. */
  logged?: { id: string; quantity: number; price: number };
}

/** Where a SIP stands this month, given its holding's transactions. */
export function sipStatus(
  sip: Pick<InvestmentSip, "id" | "day_of_month" | "start_date" | "is_active">,
  txns: Pick<InvestmentTransaction, "id" | "sip_id" | "date" | "quantity" | "price">[],
  today: string
): SipStatus {
  const [y, m] = today.split("-").map(Number);
  const due_date = sipDueDate(sip, y, m);
  const month = today.slice(0, 7);
  const t = txns.find((x) => x.sip_id === sip.id && x.date.startsWith(month));
  if (t) return { due_date, state: "logged", logged: { id: t.id, quantity: Number(t.quantity), price: Number(t.price) } };
  if (!sip.is_active) return { due_date, state: "paused" };
  if (sip.start_date.slice(0, 7) > month) return { due_date, state: "not_started" };
  return { due_date, state: due_date <= today ? "due" : "upcoming" };
}

export interface SipInput {
  holding_id?: string;
  amount?: number;
  day_of_month?: number;
  account_id?: string | null;
  start_date?: string;
  is_active?: boolean;
  note?: string;
}

/** Check SIP fields from a request body. `partial` (an edit) only checks the fields sent. */
export function parseSipInput(
  body: Record<string, unknown>,
  { partial, today }: { partial: boolean; today: string }
): { value: SipInput } | { error: string } {
  const v: SipInput = {};
  if (!partial) {
    if (typeof body.holding_id !== "string" || !body.holding_id) return { error: "Choose the fund for this SIP" };
    v.holding_id = body.holding_id;
  }
  if (!partial || "amount" in body) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { error: "SIP amount must be more than 0" };
    v.amount = amount;
  }
  if (!partial || "day_of_month" in body) {
    const day = Number(body.day_of_month);
    if (!Number.isInteger(day) || day < 1 || day > 31) return { error: "SIP day must be between 1 and 31" };
    v.day_of_month = day;
  }
  if ("account_id" in body) v.account_id = typeof body.account_id === "string" && body.account_id ? body.account_id : null;
  if (!partial || "start_date" in body) {
    const raw = body.start_date;
    if (raw !== undefined && raw !== null && raw !== "" && !isDate(raw)) return { error: "Enter a valid start date" };
    v.start_date = isDate(raw) ? raw : today;
  }
  if ("is_active" in body) v.is_active = body.is_active !== false;
  if ("note" in body) v.note = typeof body.note === "string" ? body.note.slice(0, 500) : "";
  return { value: v };
}

/**
 * The row to insert for a parsed transaction. sip_id is only sent when set, so ordinary buys
 * keep working on a database that doesn't have the SIP column yet.
 */
export function transactionRow(value: TransactionInput): Omit<TransactionInput, "sip_id"> & { sip_id?: string } {
  const { sip_id, ...rest } = value;
  return sip_id ? { ...rest, sip_id } : rest;
}
