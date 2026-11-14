export type CustomerImportRow = {
  fullName: string;
  phone: string;
  email: string;
  gender: "female" | "male" | "unspecified";
  packageName: string;
  durationDays: number;
  totalMeals: number;
  mealsRemaining: number;
  startDate: string;
  expiresAt: string;
  cashierEmail: string;
};

export type CustomerCsvParseResult = {
  rows: CustomerImportRow[];
  errors: string[];
};

export function parseCsvRows(source: string): string[][] {
  const input = source.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(cell => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("يوجد حقل نصي غير مغلق بعلامة اقتباس في ملف CSV.");
  row.push(field);
  if (row.some(cell => cell.trim() !== "")) rows.push(row);
  return rows;
}

const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const genderValue = (value: string): CustomerImportRow["gender"] | null => {
  const normalized = value.trim().toLocaleLowerCase();
  if (["female", "f", "أنثى", "انثى"].includes(normalized)) return "female";
  if (["male", "m", "ذكر"].includes(normalized)) return "male";
  if (["unspecified", "unknown", "غير محدد", "أفضل عدم الإفصاح", ""].includes(normalized)) return "unspecified";
  return null;
};

export function parseCustomerImportCsv(source: string): CustomerCsvParseResult {
  let matrix: string[][];
  try {
    matrix = parseCsvRows(source);
  } catch (error) {
    return { rows: [], errors: [error instanceof Error ? error.message : "تعذّر قراءة ملف CSV."] };
  }
  if (matrix.length < 2) return { rows: [], errors: ["الملف فارغ أو لا يحتوي صفوف عملاء."] };

  const headers = matrix[0].map(header => header.trim());
  const requiredHeaders = ["fullName", "phone", "gender", "packageName", "durationDays", "totalMeals", "mealsRemaining", "startDate", "expiresAt", "cashierEmail"];
  const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
  if (missingHeaders.length) return { rows: [], errors: [`الأعمدة المطلوبة غير موجودة: ${missingHeaders.join(", ")}`] };
  const index = new Map(headers.map((header, i) => [header, i]));
  const cell = (row: string[], header: string) => (row[index.get(header)!] ?? "").trim();
  const rows: CustomerImportRow[] = [];
  const errors: string[] = [];

  matrix.slice(1).forEach((raw, position) => {
    const line = position + 2;
    const number = (header: string) => Number(cell(raw, header));
    const gender = genderValue(cell(raw, "gender"));
    const row: CustomerImportRow = {
      fullName: cell(raw, "fullName"),
      phone: cell(raw, "phone"),
      email: cell(raw, "email"),
      gender: gender ?? "unspecified",
      packageName: cell(raw, "packageName"),
      durationDays: number("durationDays"),
      totalMeals: number("totalMeals"),
      mealsRemaining: number("mealsRemaining"),
      startDate: cell(raw, "startDate"),
      expiresAt: cell(raw, "expiresAt"),
      cashierEmail: cell(raw, "cashierEmail").toLowerCase(),
    };
    const issues: string[] = [];
    if (row.fullName.length < 2 || row.fullName.length > 160) issues.push("اسم العميل غير صالح");
    if (row.phone.length < 7 || row.phone.length > 40) issues.push("رقم الهاتف غير صالح");
    if (gender === null) issues.push("الجنس يجب أن يكون female أو male أو unspecified");
    if (!row.packageName || row.packageName.length > 140) issues.push("اسم الباقة مطلوب");
    if (!Number.isInteger(row.durationDays) || row.durationDays < 1 || row.durationDays > 3650) issues.push("مدة الباقة يجب أن تكون عدداً صحيحاً بين 1 و3650 يوماً");
    if (!Number.isInteger(row.totalMeals) || row.totalMeals < 1 || row.totalMeals > 5000) issues.push("إجمالي الوجبات غير صالح");
    if (!Number.isInteger(row.mealsRemaining) || row.mealsRemaining < 0 || row.mealsRemaining > row.totalMeals) issues.push("الرصيد المتبقي يجب أن يكون بين صفر وإجمالي الوجبات");
    if (!isIsoDate(row.startDate) || !isIsoDate(row.expiresAt)) issues.push("التواريخ يجب أن تكون بصيغة YYYY-MM-DD");
    if (!row.cashierEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.cashierEmail)) issues.push("بريد الكاشير غير صالح");
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) issues.push("البريد الإلكتروني للعميل غير صالح");
    if (issues.length) errors.push(`السطر ${line}: ${issues.join("؛ ")}`);
    else rows.push(row);
  });
  if (rows.length > 500) errors.push("الحد الأعلى للاستيراد في المرة الواحدة 500 عميل.");
  return { rows, errors };
}

export function toCsv(rows: Array<Record<string, string | number | null | undefined>>, headers: string[]) {
  const escape = (value: string | number | null | undefined) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return `\uFEFF${[headers, ...rows.map(row => headers.map(header => row[header] ?? ""))].map(line => line.map(escape).join(",")).join("\r\n")}`;
}
