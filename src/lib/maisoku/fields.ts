export type FieldId =
  | "headline" | "subheadline" | "propertyName" | "propertyType" | "address"
  | "access1" | "access2" | "rent" | "managementFee" | "deposit" | "keyMoney"
  | "layout" | "builtYear" | "buildingArea" | "landArea" | "structure" | "floors"
  | "parking" | "availability" | "equipment" | "remarks" | "companyName"
  | "companyAddress" | "phone" | "email" | "license" | "contact" | "transaction" | "ad" | "tradeRemarks";

type Field = {
  id: FieldId;
  label: string;
  placeholder?: string;
  type?: "number" | "email" | "tel";
  multiline?: boolean;
  wide?: boolean;
  options?: string[];
};

export const fieldGroups: { title: string; description?: string; fields: Field[] }[] = [
  { title: "キャッチコピー", fields: [
    { id: "headline", label: "キャッチコピー", placeholder: "物件の魅力をひとことで", wide: true },
  ] },
  { title: "物件の基本情報", fields: [
    { id: "propertyName", label: "物件名", placeholder: "物件名を入力", wide: true },
    { id: "propertyType", label: "物件の種類", options: ["戸建て", "マンション", "アパート", "その他"] },
    { id: "layout", label: "間取り", placeholder: "例：3LDK" },
    { id: "address", label: "所在地", placeholder: "都道府県・市区町村から入力", wide: true },
    { id: "access1", label: "交通", placeholder: "例：○○線「○○駅」徒歩10分", wide: true },
    { id: "access2", label: "交通（追加）", placeholder: "2つ目の路線など", wide: true },
    { id: "buildingArea", label: "建物・専有面積（㎡）", type: "number", placeholder: "例：80.5" },
    { id: "landArea", label: "土地面積（㎡）", type: "number", placeholder: "例：100" },
    { id: "builtYear", label: "築年（西暦）", type: "number", placeholder: "例：2000" },
    { id: "structure", label: "構造", placeholder: "例：木造" },
    { id: "floors", label: "階数", placeholder: "例：2階建" },
    { id: "parking", label: "駐車場", placeholder: "例：1台無料" },
  ] },
  { title: "賃貸条件", fields: [
    { id: "rent", label: "家賃（円／月）", type: "number", placeholder: "例：80000" },
    { id: "managementFee", label: "管理費・共益費（円／月）", type: "number", placeholder: "例：3000" },
    { id: "deposit", label: "敷金", placeholder: "例：1ヶ月、なし" },
    { id: "keyMoney", label: "礼金", placeholder: "例：なし" },
    { id: "availability", label: "入居時期", placeholder: "例：即入居可", wide: true },
  ] },
  { title: "紹介文・設備", fields: [
    { id: "subheadline", label: "サブコピー", placeholder: "おすすめのポイント", wide: true },
    { id: "equipment", label: "設備・条件", placeholder: "駐車場、エアコン、ガス・水道など", multiline: true },
    { id: "remarks", label: "備考", placeholder: "補足したい条件や紹介文", multiline: true },
  ] },
  { title: "会社・取引情報", description: "掲載したい会社情報を入力してください。空欄のままでも作成できます。", fields: [
    { id: "companyName", label: "会社名", placeholder: "会社名を入力", wide: true },
    { id: "companyAddress", label: "会社所在地", wide: true },
    { id: "phone", label: "電話番号", type: "tel" },
    { id: "email", label: "メールアドレス", type: "email" },
    { id: "license", label: "宅建免許番号", wide: true },
    { id: "contact", label: "担当者" },
    { id: "transaction", label: "取引態様", options: ["貸主", "代理", "専任媒介", "一般媒介", "その他"] },
    { id: "ad", label: "広告料（AD）", placeholder: "例：1ヶ月" },
    { id: "tradeRemarks", label: "取引に関する特記事項", multiline: true },
  ] },
];

export const photoSlots = [
  { id: "main", label: "メイン写真", hint: "外観など、いちばん見せたい写真" },
  { id: "small1", label: "小写真 1", hint: "室内・設備など" },
  { id: "small2", label: "小写真 2", hint: "室内・設備など" },
  { id: "small3", label: "小写真 3", hint: "室内・設備など" },
  { id: "small4", label: "小写真 4", hint: "室内・設備など" },
  { id: "floorplan", label: "間取り図", hint: "画像全体が入るように表示します" },
] as const;

export const sample: Partial<Record<FieldId, string>> = {
  headline: "緑を楽しむ、ゆとりある暮らし。",
  subheadline: "明るいリビングと、お気に入りの場所を。",
  propertyName: "サンプルハウス（架空の物件）", propertyType: "戸建て",
  address: "東京都○○区サンプル町1-2-3（架空）",
  access1: "サンプル線「みどり駅」徒歩8分", access2: "サンプルバス「公園前」徒歩3分",
  rent: "80000", managementFee: "3000", deposit: "1ヶ月", keyMoney: "なし",
  layout: "3LDK", builtYear: "2005", buildingArea: "82.5", landArea: "100",
  structure: "木造", floors: "2階建", parking: "1台無料", availability: "相談",
  equipment: "・エアコン\n・独立洗面台\n・バス・トイレ別\n・都市ガス／公営水道",
  remarks: "ここは架空のサンプルです。\n物件のおすすめポイントや補足条件を自由に入力できます。",
  companyName: "サンプル不動産（架空）", companyAddress: "東京都○○区サンプル町4-5-6（架空）",
  phone: "03-0000-0000", email: "sample@example.com", license: "サンプル免許番号（架空）",
  contact: "サンプル担当", transaction: "一般媒介", ad: "1ヶ月",
};

export function formatField(id: FieldId, raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (id === "rent") {
    const amount = Number(value);
    return Number.isFinite(amount) ? `${(amount / 10000).toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 4 })}万円` : value;
  }
  if (id === "managementFee") {
    const amount = Number(value);
    return Number.isFinite(amount) ? `${amount.toLocaleString("ja-JP")}円／月` : value;
  }
  if (id === "buildingArea" || id === "landArea") return `${value} ㎡`;
  if (id === "builtYear") return `${value}年`;
  return value;
}
