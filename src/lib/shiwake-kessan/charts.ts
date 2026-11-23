// グラフ用にデータの形を整える（描画は画面側）
import type { Entry } from "./parse";
import { CREDIT_POSITIVE, isPl, lookupAccount, type AccountMap, type PlKubun } from "./accounts";
import { toPostings, type PlStatement } from "./aggregate";

const REVENUE: ReadonlySet<PlKubun> = CREDIT_POSITIVE as ReadonlySet<PlKubun>;

export interface MonthlyRow {
  month: string; // YYYY-MM
  売上高: number;
  費用合計: number; // 売上原価・販管費・営業外費用・特別損失・法人税等
  当期純利益: number; // 収益合計 − 費用合計
}

// 1つの期の月別推移。仕訳のない月も0で並べる
export function monthly(entries: Entry[], map: AccountMap, closingMonth: number, period: string): MonthlyRow[] {
  const months: string[] = [];
  const [ey, em] = period.split("-").map(Number);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const rows = new Map(months.map((m) => [m, { month: m, 売上高: 0, 費用合計: 0, 当期純利益: 0 }]));
  for (const p of toPostings(entries, closingMonth)) {
    if (p.period !== period) continue;
    const kubun = lookupAccount(p.account, map)?.kubun;
    if (!kubun || !isPl(kubun)) continue;
    const row = rows.get(p.date.slice(0, 7))!;
    if (REVENUE.has(kubun)) {
      if (kubun === "売上高") row.売上高 += -p.dr;
      row.当期純利益 += -p.dr;
    } else {
      row.費用合計 += p.dr;
      row.当期純利益 -= p.dr;
    }
  }
  return months.map((m) => rows.get(m)!);
}

// 費用の内訳（科目別）。大きい順に top 個、残りは「その他」にまとめる
export function expenseBreakdown(pl: PlStatement, top = 8): { account: string; amount: number }[] {
  const lines = (["売上原価", "販売費及び一般管理費", "営業外費用", "特別損失"] as PlKubun[])
    .flatMap((k) => pl.detail[k])
    .filter((l) => l.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const head = lines.slice(0, top);
  const rest = lines.slice(top).reduce((s, l) => s + l.amount, 0);
  return rest > 0 ? [...head, { account: "その他", amount: rest }] : head;
}
