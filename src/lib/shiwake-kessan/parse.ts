// 仕訳帳（1行1仕訳）のファイルを読み、仕訳の配列にする
import Papa from "papaparse";

export interface Entry {
  date: string; // YYYY-MM-DD
  debit: string; // 借方勘定科目
  credit: string; // 貸方勘定科目
  amount: number;
  row: number; // 元のファイルの行番号（1始まり）
}

export interface ColumnMap {
  date: number;
  debit: number;
  credit: number;
  amount: number;
}

export interface ParseIssue {
  row: number;
  kind: "amount" | "date" | "account";
  value: string;
}

// UTF-8 として読めなければ Shift_JIS として読む
export function decodeBytes(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("shift_jis").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

// 区切り（タブ・カンマ）は自動で判定する。すべての値は文字列のまま持つ
export function parseTable(text: string): string[][] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  return result.data.map((r) => r.map((v) => (v ?? "").trim()));
}

const SYNONYMS: Record<keyof ColumnMap, string[]> = {
  date: ["日付", "取引日", "年月日", "伝票日付", "計上日", "仕訳日"],
  debit: ["借方勘定科目", "借方科目", "借方"],
  credit: ["貸方勘定科目", "貸方科目", "貸方"],
  amount: ["金額", "貸借金額", "仕訳金額", "取引金額"],
};

function findColumn(header: string[], key: keyof ColumnMap): number {
  const names = SYNONYMS[key];
  for (const name of names) {
    const i = header.indexOf(name);
    if (i >= 0) return i;
  }
  // 「借方勘定科目（必須）」のような書き方も拾う。「借方取引先」「借方摘要」は拾わない
  if (key === "debit" || key === "credit") {
    const side = key === "debit" ? "借方" : "貸方";
    return header.findIndex((h) => h.includes(side) && h.includes("科目"));
  }
  return header.findIndex((h) => names.some((n) => h.includes(n)));
}

export function guessColumns(header: string[]): Partial<ColumnMap> {
  const map: Partial<ColumnMap> = {};
  for (const key of Object.keys(SYNONYMS) as (keyof ColumnMap)[]) {
    const i = findColumn(header, key);
    if (i >= 0) map[key] = i;
  }
  return map;
}

// 先頭の数行にタイトル行があってもよいように、借方・貸方の列がそろう最初の行をヘッダーとみなす
export function detectHeaderRow(rows: string[][], maxScan = 10): number {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const m = guessColumns(rows[i]);
    if (m.debit !== undefined && m.credit !== undefined && m.amount !== undefined) return i;
  }
  return -1;
}

// 「1,234」「¥1,234」「△1,234」「(1,234)」を数値にする。読めなければ null
export function parseAmount(s: string): number | null {
  let t = s.replace(/[,，¥￥円\s]/g, "");
  t = t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  let sign = 1;
  if (/^[△▲-]/.test(t)) {
    sign = -1;
    t = t.slice(1);
  } else if (/^\(.*\)$/.test(t)) {
    sign = -1;
    t = t.slice(1, -1);
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return sign * Number(t);
}

// 2026/10/01・2026-10-01・20261001・2026年10月1日 を YYYY-MM-DD にする。読めなければ null
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) m = t.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ヘッダーより下の行を仕訳にする。読めない行は捨てずに issues に出す
export function toEntries(
  rows: string[][],
  headerRow: number,
  cols: ColumnMap,
): { entries: Entry[]; issues: ParseIssue[] } {
  const entries: Entry[] = [];
  const issues: ParseIssue[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const row = i + 1;
    const rawDate = r[cols.date] ?? "";
    const debit = r[cols.debit] ?? "";
    const credit = r[cols.credit] ?? "";
    const rawAmount = r[cols.amount] ?? "";
    // 必要な4列がすべて空の行（合計行の下の余白など）は仕訳ではないので飛ばす
    if (!rawDate && !debit && !credit && !rawAmount) continue;

    const date = parseDate(rawDate);
    const amount = parseAmount(rawAmount);
    let ok = true;
    if (date === null) {
      issues.push({ row, kind: "date", value: rawDate });
      ok = false;
    }
    if (amount === null) {
      issues.push({ row, kind: "amount", value: rawAmount });
      ok = false;
    }
    if (!debit || !credit) {
      issues.push({ row, kind: "account", value: `${debit} / ${credit}` });
      ok = false;
    }
    if (ok) entries.push({ date: date!, debit, credit, amount: amount!, row });
  }
  return { entries, issues };
}

// ファイルの中身から、ヘッダーの判定・列の推定・仕訳化までをまとめて行う
export function parseLedger(text: string): {
  header: string[];
  headerRow: number;
  columns: Partial<ColumnMap>;
  entries: Entry[];
  issues: ParseIssue[];
} {
  const rows = parseTable(text);
  const headerRow = detectHeaderRow(rows);
  if (headerRow < 0) return { header: [], headerRow, columns: {}, entries: [], issues: [] };
  const header = rows[headerRow];
  const columns = guessColumns(header);
  if (columns.date === undefined || columns.debit === undefined || columns.credit === undefined || columns.amount === undefined) {
    return { header, headerRow, columns, entries: [], issues: [] };
  }
  const { entries, issues } = toEntries(rows, headerRow, columns as ColumnMap);
  return { header, headerRow, columns, entries, issues };
}
