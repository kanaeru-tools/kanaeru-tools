// 仕訳を科目ごとの縦持ちにし、期ごとの損益計算書を組み立てる
import type { Entry } from "./parse";
import { CREDIT_POSITIVE, isPl, lookupAccount, normalizeAccount, type AccountMap, type PlKubun } from "./accounts";

export interface Posting {
  date: string;
  period: string; // 期末の年月（例：2026-09）。期のラベルに使う
  account: string;
  dr: number; // 借方をプラス、貸方をマイナスにした金額
}

// 決算月から、その日付が属する期の期末（YYYY-MM）を出す
export function periodEnd(date: string, closingMonth: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const endYear = m <= closingMonth ? y : y + 1;
  return `${endYear}-${String(closingMonth).padStart(2, "0")}`;
}

// 決算振替（売上高／損益 など）の仕訳。PL の科目を0にする仕訳なので、行ごと集計から外す
const CLOSING_ACCOUNTS = new Set(["損益"]);
export function isClosingEntry(e: Entry): boolean {
  return CLOSING_ACCOUNTS.has(normalizeAccount(e.debit)) || CLOSING_ACCOUNTS.has(normalizeAccount(e.credit));
}

// 決算月の推定。決算振替 → 減価償却費（期末にまとめて計上されることが多い）→ ちょうど12か月の倍数のデータなら最初の月の前月、の順に見る
export type ClosingSource = "closing" | "depreciation" | "span" | "default";
export function guessClosingMonth(entries: Entry[]): { month: number; source: ClosingSource } {
  const monthOf = (e: Entry) => Number(e.date.slice(5, 7));
  const closing = entries.find(isClosingEntry);
  if (closing) return { month: monthOf(closing), source: "closing" };
  // 毎月償却している帳簿は月がばらけるので、1つの月にそろっているときだけ使う
  const dep = new Set(entries.filter((e) => [e.debit, e.credit].some((a) => normalizeAccount(a) === "減価償却費")).map(monthOf));
  if (dep.size === 1) return { month: [...dep][0], source: "depreciation" };
  if (entries.length) {
    const ym = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
    const dates = entries.map((e) => e.date).sort();
    const span = ym(dates.at(-1)!) - ym(dates[0]) + 1;
    if (span % 12 === 0) return { month: ((Number(dates[0].slice(5, 7)) + 10) % 12) + 1, source: "span" };
  }
  return { month: 3, source: "default" };
}

// 1行1仕訳を、借方・貸方の2行に分ける。決算振替の仕訳は外す
export function toPostings(entries: Entry[], closingMonth: number): Posting[] {
  return entries.filter((e) => !isClosingEntry(e)).flatMap((e) => {
    const period = periodEnd(e.date, closingMonth);
    return [
      { date: e.date, period, account: e.debit, dr: e.amount },
      { date: e.date, period, account: e.credit, dr: -e.amount },
    ];
  });
}

// 対応表にない科目。1つでも残っていたら集計しない（黙って落とすと数字が小さくなるため）
export function findUnmapped(entries: Entry[], map: AccountMap): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    if (!lookupAccount(e.debit, map)) set.add(e.debit);
    if (!lookupAccount(e.credit, map)) set.add(e.credit);
  }
  return [...set].sort();
}

export interface PlLine {
  account: string;
  amount: number;
}

export interface PlStatement {
  period: string;
  detail: Record<PlKubun, PlLine[]>; // 区分ごとの科目の内訳（金額の大きい順）
  total: Record<PlKubun, number>;
  売上総利益: number;
  営業利益: number;
  経常利益: number;
  税引前当期純利益: number;
  当期純利益: number;
}

const emptyByKubun = <T>(f: () => T) =>
  ({
    売上高: f(), 売上原価: f(), 販売費及び一般管理費: f(), 営業外収益: f(),
    営業外費用: f(), 特別利益: f(), 特別損失: f(), 法人税等: f(),
  }) as Record<PlKubun, T>;

// 期ごとの損益計算書。BS の科目と「対象外」の科目は集計に入れない
export function buildPl(entries: Entry[], map: AccountMap, closingMonth: number): PlStatement[] {
  const unmapped = findUnmapped(entries, map);
  if (unmapped.length > 0) throw new Error(`区分の決まっていない科目があります：${unmapped.join("、")}`);

  // 期 → 科目 → 借方プラスの合計
  const sums = new Map<string, Map<string, number>>();
  for (const p of toPostings(entries, closingMonth)) {
    const rule = lookupAccount(p.account, map)!;
    if (!isPl(rule.kubun)) continue;
    const byAccount = sums.get(p.period) ?? new Map<string, number>();
    byAccount.set(p.account, (byAccount.get(p.account) ?? 0) + p.dr);
    sums.set(p.period, byAccount);
  }

  return [...sums.keys()].sort().map((period) => {
    const detail = emptyByKubun<PlLine[]>(() => []);
    const total = emptyByKubun(() => 0);
    for (const [account, dr] of sums.get(period)!) {
      const kubun = lookupAccount(account, map)!.kubun as PlKubun;
      const amount = CREDIT_POSITIVE.has(kubun) ? -dr : dr;
      detail[kubun].push({ account, amount });
      total[kubun] += amount;
    }
    for (const k of Object.keys(detail) as PlKubun[]) detail[k].sort((a, b) => b.amount - a.amount);

    const 売上総利益 = total.売上高 - total.売上原価;
    const 営業利益 = 売上総利益 - total.販売費及び一般管理費;
    const 経常利益 = 営業利益 + total.営業外収益 - total.営業外費用;
    const 税引前当期純利益 = 経常利益 + total.特別利益 - total.特別損失;
    const 当期純利益 = 税引前当期純利益 - total.法人税等;
    return { period, detail, total, 売上総利益, 営業利益, 経常利益, 税引前当期純利益, 当期純利益 };
  });
}
