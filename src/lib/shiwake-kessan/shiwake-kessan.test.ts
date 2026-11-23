import { describe, expect, it } from "vitest";
import { decodeBytes, parseAmount, parseDate, parseLedger } from "./parse";
import { STANDARD_ACCOUNTS } from "./accounts";
import { buildPl, findUnmapped, periodEnd } from "./aggregate";

// 架空の会社（3月決算）。1行目はタイトル、2行目がヘッダー
const SAMPLE = [
  "仕訳帳（架空）\t\t\t\t",
  "日付\t借方勘定科目\t貸方勘定科目\t金額\t摘要",
  "2025/04/30\t普通預金\t売上高\t100,000\t4月分",
  "2025/05/31\t普通預金\t売上高\t100,000\t5月分",
  "2025/05/31\t仕入高\t普通預金\t30,000\t",
  "2025/06/10\t消耗品費\t現金\t¥5,000\t",
  "2025/07/01\t支払利息\t普通預金\t1,200\t",
  "2025/08/01\t普通預金\t雑収入\t300\t",
  "2026/03/31\t固定資産除却損\t工具器具備品\t8,000\t",
  "2026/03/31\t法人税、住民税及び事業税\t普通預金\t70,000\t均等割",
  "2026/03/31\t売上高\t損益\t200,000\t決算振替（PL から外す）",
  "2026/03/31\t損益\t仕入高\t30,000\t決算振替（PL から外す）",
  "2026/03/31\t損益\t繰越利益剰余金\t86,100\t決算振替（PL から外す）",
  "2026/04/30\t普通預金\t売上高\t50,000\t翌期",
  "\t\t\t\t",
].join("\n");

describe("読み込み", () => {
  it("金額と日付の書き方のゆれを読む", () => {
    expect(parseAmount("¥1,234")).toBe(1234);
    expect(parseAmount("△500")).toBe(-500);
    expect(parseAmount("１２３")).toBe(123);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseDate("20261001")).toBe("2026-10-01");
    expect(parseDate("2026-1-5")).toBe("2026-01-05");
    expect(parseDate("2026年10月1日")).toBe("2026-10-01");
    expect(parseDate("2026/02/30")).toBeNull();
  });

  it("タイトル行を飛ばしてヘッダーを見つけ、列を当てる", () => {
    const r = parseLedger(SAMPLE);
    expect(r.headerRow).toBe(1);
    expect(r.columns).toEqual({ date: 0, debit: 1, credit: 2, amount: 3 });
    expect(r.entries).toHaveLength(12); // 空の行は数えない
    expect(r.issues).toHaveLength(0);
  });

  it("「借方取引先」を借方の科目と取り違えない", () => {
    const text = "日付,借方取引先,借方勘定科目,貸方勘定科目,貸借金額\n2026/01/01,A社,現金,売上高,100";
    expect(parseLedger(text).columns).toEqual({ date: 0, debit: 2, credit: 3, amount: 4 });
  });

  it("読めない行は捨てずに点検結果に出す", () => {
    const text = "日付,借方,貸方,金額\n2026/01/01,現金,売上高,100\n2026/13/01,現金,売上高,abc";
    const r = parseLedger(text);
    expect(r.entries).toHaveLength(1);
    expect(r.issues.map((i) => i.kind)).toEqual(["date", "amount"]);
  });

  it("Shift_JIS のファイルも読める", () => {
    // 「日付」を Shift_JIS にしたバイト列
    const sjis = new Uint8Array([0x93, 0xfa, 0x95, 0x74]);
    expect(decodeBytes(sjis)).toBe("日付");
  });
});

describe("集計", () => {
  it("決算月から期を決める", () => {
    expect(periodEnd("2025-09-30", 9)).toBe("2025-09");
    expect(periodEnd("2025-10-01", 9)).toBe("2026-09");
    expect(periodEnd("2026-03-31", 12)).toBe("2026-12");
  });

  it("対応表にない科目があれば集計しない", () => {
    const { entries } = parseLedger("日付,借方,貸方,金額\n2026/01/01,謎の科目,現金,100");
    expect(findUnmapped(entries, STANDARD_ACCOUNTS)).toEqual(["謎の科目"]);
    expect(() => buildPl(entries, STANDARD_ACCOUNTS, 3)).toThrow("謎の科目");
  });

  it("報告式の各利益を出す。損益の振替は数えない", () => {
    const pls = buildPl(parseLedger(SAMPLE).entries, STANDARD_ACCOUNTS, 3);
    expect(pls.map((p) => p.period)).toEqual(["2026-03", "2027-03"]);
    const pl = pls[0];
    expect(pl.total.売上高).toBe(200000);
    expect(pl.売上総利益).toBe(170000); // 200,000 − 仕入 30,000
    expect(pl.営業利益).toBe(165000); // − 消耗品費 5,000
    expect(pl.経常利益).toBe(164100); // ＋ 雑収入 300 − 支払利息 1,200
    expect(pl.税引前当期純利益).toBe(156100); // − 除却損 8,000
    expect(pl.当期純利益).toBe(86100); // − 法人税等 70,000
    expect(pl.detail.販売費及び一般管理費).toEqual([{ account: "消耗品費", amount: 5000 }]);
    expect(pls[1].total.売上高).toBe(50000);
  });

  it("利用者が区分を変えると集計に反映される", () => {
    const { entries } = parseLedger("日付,借方,貸方,金額\n2026/01/01,改装工事費,現金,500");
    const map = { ...STANDARD_ACCOUNTS, 改装工事費: { kubun: "固定資産" as const } };
    expect(buildPl(entries, STANDARD_ACCOUNTS, 3)[0].営業利益).toBe(-500);
    expect(buildPl(entries, map, 3)).toEqual([]); // PL の科目が1つもない
  });
});
