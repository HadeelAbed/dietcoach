import { describe, expect, it } from "vitest";
import { parseCsvRows, parseCustomerImportCsv, toCsv } from "../client/src/lib/customerCsv";

describe("customer CSV import format", () => {
  const header = "fullName,phone,email,gender,packageName,durationDays,totalMeals,mealsRemaining,startDate,expiresAt,cashierEmail";

  it("parses BOM, CRLF, quoted commas and escaped quotes", () => {
    expect(parseCsvRows('\uFEFFname,note\r\n"سارة علي","باقة، خاصة"\r\n"test","said ""yes"""')).toEqual([
      ["name", "note"],
      ["سارة علي", "باقة، خاصة"],
      ["test", 'said "yes"'],
    ]);
  });

  it("normalizes a valid Arabic customer and date row", () => {
    const csv = `${header}\n"سارة علي",0791234567,,أنثى,"باقة 10 أيام",10,20,18,2026-11-01,2026-11-11,cashier@example.com`;
    const result = parseCustomerImportCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ fullName: "سارة علي", gender: "female", durationDays: 10, totalMeals: 20, mealsRemaining: 18 });
  });

  it("rejects missing columns and invalid remaining balance", () => {
    expect(parseCustomerImportCsv("fullName,phone\nA,079").errors[0]).toContain("الأعمدة المطلوبة");
    const csv = `${header}\n"سارة علي",0791234567,,female,"باقة",10,20,21,2026-11-01,2026-11-11,cashier@example.com`;
    expect(parseCustomerImportCsv(csv).errors.join(" ")).toContain("الرصيد المتبقي");
  });

  it("rejects impossible dates during preview", () => {
    const csv = `${header}\n"سارة علي",0791234567,,female,"باقة",10,20,10,2026-02-30,2026-11-11,cashier@example.com`;
    expect(parseCustomerImportCsv(csv).errors.join(" ")).toContain("YYYY-MM-DD");
  });

  it("serializes exported CSV with escaped values", () => {
    expect(toCsv([{ fullName: 'Sara "A"', phone: "079" }], ["fullName", "phone"])).toContain('"Sara ""A"""');
  });
});
