// 期ごとの貸借対照表（期末の残高）と、期間中の増減表を組み立てる
import type { Entry } from "./parse";
import { BS_KUBUN, lookupAccount, normalizeAccount, type AccountMap, type BsKubun } from "./accounts";
import { buildPl, findUnmapped, toPostings } from "./aggregate";

// balance：期末の残高（期首の残高＋増減）。change：その期の増減だけ（期首の残高が分からないとき）
export type BsMode = "balance" | "change";

export const RETAINED = "繰越利益剰余金";

// 期首の残高の仕訳（前期繰越・開始仕訳）の相手に使われる科目。区分は「対象外」
export const OPENING_ACCOUNTS = ["前期繰越", "開始残高", "期首残高"];

// 資産の区分にあっても、マイナス（貸方）の残高が普通の科目
const CONTRA = /累計額$|引当金$/;

export interface BsLine {
  account: string;
  amount: number; // 資産は借方、負債・純資産は貸方をプラスにした金額
}

export interface BsStatement {
  period: string;
  detail: Record<BsKubun, BsLine[]>;
  total: Record<BsKubun, number>;
  資産合計: number;
  負債合計: number;
  純資産合計: number;
  負債純資産合計: number;
  差額: number; // 資産合計 −（負債＋純資産）。期首の残高の入力の食い違いや、対象外の科目の残りがあると0でなくなる
  negatives: BsLine[]; // 期末にマイナスになっている科目（残高のときだけ。累計額・引当金と、赤字でふつうにマイナスになる繰越利益剰余金は除く）
}

const ASSET: ReadonlySet<BsKubun> = new Set<BsKubun>(["流動資産", "固定資産", "繰延資産"]);
const isBs = (k: string): k is BsKubun => (BS_KUBUN as readonly string[]).includes(k);

// 期首の残高の仕訳が入っているか（前期繰越などの科目が使われているか）
export function hasOpeningEntries(entries: Entry[]): boolean {
  const names = new Set(OPENING_ACCOUNTS);
  return entries.some((e) => names.has(normalizeAccount(e.debit)) || names.has(normalizeAccount(e.credit)));
}

// 期首の残高を入力してもらう科目。データの中の BS の科目に、繰越利益剰余金を必ず足す
export function bsAccounts(entries: Entry[], map: AccountMap): { account: string; kubun: BsKubun }[] {
  const seen = new Map<string, BsKubun>();
  for (const e of entries) {
    for (const a of [e.debit, e.credit]) {
      const k = lookupAccount(a, map)?.kubun;
      if (k && isBs(k) && !seen.has(a)) seen.set(a, k);
    }
  }
  if (![...seen.keys()].some((a) => normalizeAccount(a) === RETAINED)) seen.set(RETAINED, "純資産");
  return [...seen].map(([account, kubun]) => ({ account, kubun })).sort(
    (x, y) => BS_KUBUN.indexOf(x.kubun) - BS_KUBUN.indexOf(y.kubun),
  );
}

// 入力された期首の残高を、BS の区分がある科目だけにし、繰越利益剰余金の書き方のゆれを1つにまとめる（BS に載せる向きのまま）
export function openingByAccount(opening: Record<string, number>, map: AccountMap): Map<string, number> {
  const out = new Map<string, number>();
  for (const [account, amount] of Object.entries(opening)) {
    const isRetained = normalizeAccount(account) === RETAINED;
    const kubun = lookupAccount(account, map)?.kubun ?? (isRetained ? "純資産" : undefined);
    if (!kubun || !isBs(kubun) || !amount) continue;
    const key = isRetained ? RETAINED : account;
    out.set(key, (out.get(key) ?? 0) + amount);
  }
  return out;
}

// 期（期末の年月。決算月はすべて同じ）の並びで、間に抜けている期を返す
export function missingPeriods(periods: string[]): string[] {
  const years = periods.map((p) => Number(p.slice(0, 4))).sort((a, b) => a - b);
  if (years.length === 0) return [];
  const month = periods[0].slice(4);
  const have = new Set(years);
  const out: string[] = [];
  for (let y = years[0]; y <= years.at(-1)!; y++) if (!have.has(y)) out.push(`${y}${month}`);
  return out;
}

// opening は最初の期の期首の残高（BS に載せる向きの金額）。mode が change のときは使わない
export function buildBs(
  entries: Entry[],
  map: AccountMap,
  closingMonth: number,
  mode: BsMode,
  opening: Record<string, number> = {},
): BsStatement[] {
  const unmapped = findUnmapped(entries, map);
  if (unmapped.length > 0) throw new Error(`区分の決まっていない科目があります：${unmapped.join("、")}`);

  // 期 → 科目 → 借方プラスの増減。対象外の科目（諸口など）に残った額は、差額として表れる
  const moves = new Map<string, Map<string, number>>();
  for (const p of toPostings(entries, closingMonth)) {
    const kubun = lookupAccount(p.account, map)!.kubun;
    if (!isBs(kubun)) continue;
    const byAccount = moves.get(p.period) ?? new Map<string, number>();
    byAccount.set(p.account, (byAccount.get(p.account) ?? 0) + p.dr);
    moves.set(p.period, byAccount);
  }
  // 損益の振替は toPostings で外しているので、当期純利益を繰越利益剰余金に1回だけ足す
  const netIncome = new Map(buildPl(entries, map, closingMonth).map((pl) => [pl.period, pl.当期純利益]));
  const periods = [...new Set([...moves.keys(), ...netIncome.keys()])].sort();

  // 残高は借方プラスで持つ。期首の残高は BS の向きなので、負債・純資産は符号を返す
  const balance = new Map<string, number>();
  const retainedKey = (name: string) => (normalizeAccount(name) === RETAINED ? RETAINED : name);
  if (mode === "balance") {
    for (const [key, amount] of openingByAccount(opening, map)) {
      const kubun = key === RETAINED ? "純資産" : lookupAccount(key, map)!.kubun;
      balance.set(key, ASSET.has(kubun as BsKubun) ? amount : -amount);
    }
  }

  return periods.map((period) => {
    if (mode === "change") balance.clear();
    for (const [account, dr] of moves.get(period) ?? []) {
      const key = retainedKey(account);
      balance.set(key, (balance.get(key) ?? 0) + dr);
    }
    balance.set(RETAINED, (balance.get(RETAINED) ?? 0) - (netIncome.get(period) ?? 0));

    const detail = Object.fromEntries(BS_KUBUN.map((k) => [k, [] as BsLine[]])) as Record<BsKubun, BsLine[]>;
    const total = Object.fromEntries(BS_KUBUN.map((k) => [k, 0])) as Record<BsKubun, number>;
    for (const [account, dr] of balance) {
      const kubun = account === RETAINED ? "純資産" : lookupAccount(account, map)?.kubun;
      if (!kubun || !isBs(kubun) || dr === 0) continue;
      const amount = ASSET.has(kubun) ? dr : -dr;
      detail[kubun].push({ account, amount });
      total[kubun] += amount;
    }
    for (const k of BS_KUBUN) detail[k].sort((a, b) => b.amount - a.amount);

    const 資産合計 = total.流動資産 + total.固定資産 + total.繰延資産;
    const 負債合計 = total.流動負債 + total.固定負債;
    const 純資産合計 = total.純資産;
    const 負債純資産合計 = 負債合計 + 純資産合計;
    const negatives =
      mode === "balance"
        ? BS_KUBUN.flatMap((k) => detail[k]).filter((l) => l.amount < 0 && !CONTRA.test(l.account) && l.account !== RETAINED)
        : [];
    return {
      period, detail, total, 資産合計, 負債合計, 純資産合計, 負債純資産合計,
      差額: 資産合計 - 負債純資産合計, negatives,
    };
  });
}
