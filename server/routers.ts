import { COOKIE_NAME } from "@shared/const";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { branches, cashiers, customers, deliveryLinks, deliveryStations, mealPackages, redemptions, registrationLinks } from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createGoogleWalletSaveUrl, googleWalletErrorCode as googleWalletErrorCodeFn, resolveGoogleWalletRequestOrigin, syncGoogleWalletClassLocations, upsertGoogleWalletObject } from "./googleWallet";

const dbOrFail = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حالياً" });
  return db;
};

type Actor = { role: "manager"; cashierId: null; branchId: null } | { role: "cashier"; cashierId: number; branchId: number };
const operatorProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const db = await dbOrFail();
  let actor: Actor;
  if (ctx.user.role === "admin") {
    actor = { role: "manager", cashierId: null, branchId: null };
  } else {
    const [cashier] = await db.select().from(cashiers).where(and(eq(cashiers.email, (ctx.user.email ?? "").toLowerCase()), eq(cashiers.active, 1))).limit(1);
    if (!cashier) throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب غير مرتبط بكاشير فعّال. اطلب من المدير إضافتك بالبريد نفسه." });
    actor = { role: "cashier", cashierId: cashier.id, branchId: cashier.branchId };
  }
  return next({ ctx: { ...ctx, actor } });
});

const managerProcedure = adminProcedure;
const linkPath = (kind: "register" | "delivery", token: string) => `/${kind}/${token}`;
const deliveryStationPath = (token: string) => `/delivery-scan/${token}`;
const saveDeliveryStationLink = async (db: NonNullable<Awaited<ReturnType<typeof getDb>>>, cashierId: number, createdByUserId: number, rotate = false) => {
  const [cashier] = await db.select({ id: cashiers.id, branchId: cashiers.branchId }).from(cashiers).where(and(eq(cashiers.id, cashierId), eq(cashiers.active, 1))).limit(1);
  if (!cashier) throw new TRPCError({ code: "NOT_FOUND", message: "الكاشير غير موجود أو موقوف" });
  const [station] = await db.select().from(deliveryStations).where(eq(deliveryStations.cashierId, cashierId)).limit(1);
  if (station?.active === 1 && !rotate) return { url: deliveryStationPath(station.token), reused: true };
  const token = nanoid(40);
  if (station) {
    await db.update(deliveryStations).set({ token, branchId: cashier.branchId, createdByUserId, active: 1, lastUsedAt: null }).where(eq(deliveryStations.id, station.id));
  } else {
    await db.insert(deliveryStations).values({ token, cashierId, branchId: cashier.branchId, createdByUserId, active: 1 });
  }
  return { url: deliveryStationPath(token), reused: false };
};
const syncCustomerWallet = async (customerId: number) => {
  const db = await dbOrFail();
  const [row] = await db.select({ customer: customers, branchName: branches.name }).from(customers).innerJoin(branches, eq(customers.sourceBranchId, branches.id)).where(eq(customers.id, customerId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "العميل غير موجود" });
  try {
    const { objectId } = await upsertGoogleWalletObject({ ...row.customer, branchName: row.branchName });
    await db.update(customers).set({ googleWalletObjectId: objectId, googleWalletStatus: "ready", googleWalletErrorCode: null, googleWalletUpdatedAt: new Date() }).where(eq(customers.id, customerId));
    return { status: "ready" as const, errorCode: null };
  } catch (error) {
    const errorCode = googleWalletErrorCodeFn(error);
    console.error(`[Google Wallet] Customer ${customerId} synchronization failed: ${errorCode}`);
    await db.update(customers).set({ googleWalletStatus: "error", googleWalletErrorCode: errorCode }).where(eq(customers.id, customerId));
    return { status: "error" as const, errorCode };
  }
};

const syncBranchWalletLocations = async () => {
  const db = await dbOrFail();
  const rows = await db.select({ latitude: branches.latitude, longitude: branches.longitude }).from(branches);
  const locations = rows.flatMap(row => row.latitude != null && row.longitude != null ? [{ latitude: row.latitude, longitude: row.longitude }] : []);
  if (locations.length > 10) return { status: "error" as const, errorCode: "too_many_locations", locationCount: locations.length };
  try {
    const result = await syncGoogleWalletClassLocations(locations);
    return { status: locations.length ? "ready" as const : "no_locations" as const, errorCode: null, locationCount: result.locationCount };
  } catch (error) {
    const errorCode = googleWalletErrorCodeFn(error);
    console.error(`[Google Wallet] Branch location synchronization failed: ${errorCode}`);
    return { status: "error" as const, errorCode, locationCount: locations.length };
  }
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  dashboard: router({
    data: operatorProcedure.query(async ({ ctx }) => {
      const db = await dbOrFail();
      const isManager = ctx.actor.role === "manager";
      const allBranches = isManager ? await db.select().from(branches).orderBy(desc(branches.createdAt)) : await db.select().from(branches).where(eq(branches.id, ctx.actor.branchId!));
      const allCashiers = isManager ? await db.select().from(cashiers).orderBy(desc(cashiers.createdAt)) : await db.select().from(cashiers).where(eq(cashiers.id, ctx.actor.cashierId!));
      const clientRows = isManager
        ? await db.select().from(customers).orderBy(desc(customers.createdAt))
        : await db.select().from(customers).where(eq(customers.sourceCashierId, ctx.actor.cashierId!)).orderBy(desc(customers.createdAt));
      const packageRows = await db.select().from(mealPackages).orderBy(desc(mealPackages.createdAt));
      const activityRows = isManager
        ? await db.select().from(redemptions).orderBy(desc(redemptions.createdAt))
        : await db.select().from(redemptions).where(eq(redemptions.cashierId, ctx.actor.cashierId!)).orderBy(desc(redemptions.createdAt));
      const branchMap = new Map(allBranches.map(item => [item.id, item.name]));
      const cashierMap = new Map(allCashiers.map(item => [item.id, item.name]));
      const customerMap = new Map(clientRows.map(item => [item.id, item.fullName]));
      const redemptionsToday = activityRows.filter(item => item.createdAt.toDateString() === new Date().toDateString()).length;
      return {
        operator: { id: ctx.user.id, name: ctx.user.name ?? "فريق Diet Coach", email: ctx.user.email, role: ctx.actor.role, branchId: ctx.actor.branchId, cashierId: ctx.actor.cashierId },
        branches: allBranches,
        cashiers: allCashiers.map(item => ({ ...item, branchName: branchMap.get(item.branchId) ?? "—" })),
        packages: isManager ? packageRows : packageRows.filter(item => item.active === 1),
        customers: clientRows.map(item => ({ ...item, branchName: branchMap.get(item.sourceBranchId) ?? "—", cashierName: cashierMap.get(item.sourceCashierId) ?? "—" })),
        activity: activityRows.map(item => ({ ...item, customerName: customerMap.get(item.customerId) ?? "عميل", branchName: item.branchId == null ? "—" : branchMap.get(item.branchId) ?? "—", cashierName: item.cashierId == null ? "الإدارة" : cashierMap.get(item.cashierId) ?? "—", methodLabel: item.method === "delivery" ? "توصيل" : "الكاشير" })),
        stats: { customers: clientRows.length, mealsRemaining: clientRows.reduce((sum, item) => sum + item.mealsRemaining, 0), redemptionsToday, branches: allBranches.length, cashiers: allCashiers.length },
      };
    }),
  }),

  manager: router({
    createBranch: managerProcedure.input(z.object({ name: z.string().trim().min(2).max(140), location: z.string().trim().max(255).optional(), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional() }).refine(value => (value.latitude == null) === (value.longitude == null), { message: "أدخلي خط العرض والطول معاً" })).mutation(async ({ ctx, input }) => {
      const db = await dbOrFail();
      await db.insert(branches).values({ name: input.name, location: input.location || null, latitude: input.latitude ?? null, longitude: input.longitude ?? null, createdByUserId: ctx.user.id });
      return { ok: true, walletLocationsSync: await syncBranchWalletLocations() };
    }),
    updateBranch: managerProcedure.input(z.object({ branchId: z.number().int().positive(), name: z.string().trim().min(2).max(140), location: z.string().trim().max(255).optional(), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional() }).refine(value => (value.latitude == null) === (value.longitude == null), { message: "أدخلي خط العرض والطول معاً" })).mutation(async ({ input }) => {
      const db = await dbOrFail();
      const [branch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, input.branchId)).limit(1);
      if (!branch) throw new TRPCError({ code: "NOT_FOUND", message: "الفرع غير موجود" });
      await db.update(branches).set({ name: input.name, location: input.location || null, latitude: input.latitude ?? null, longitude: input.longitude ?? null }).where(eq(branches.id, input.branchId));
      return { ok: true, walletLocationsSync: await syncBranchWalletLocations() };
    }),
    syncBranchLocations: managerProcedure.mutation(async () => syncBranchWalletLocations()),
    createCashier: managerProcedure.input(z.object({ name: z.string().trim().min(2).max(140), email: z.string().trim().email().max(320), branchId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrFail();
      const [branch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, input.branchId)).limit(1);
      if (!branch) throw new TRPCError({ code: "NOT_FOUND", message: "الفرع غير موجود" });
      await db.insert(cashiers).values({ name: input.name, email: input.email.toLowerCase(), branchId: input.branchId, createdByUserId: ctx.user.id });
      return { ok: true };
    }),
    setCashierActive: managerProcedure.input(z.object({ cashierId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ input }) => {
      const db = await dbOrFail();
      await db.update(cashiers).set({ active: input.active ? 1 : 0 }).where(eq(cashiers.id, input.cashierId));
      return { ok: true };
    }),
    seedDefaultMealPackages: managerProcedure.mutation(async ({ ctx }) => {
      const db = await dbOrFail();
      const createdCount = await db.transaction(async tx => {
        const durations = [10, 20, 24, 26, 30];
        const packageTypes = ["باقة دجاج", "الباقة المتنوعة", "الباقة المتنوعة للروبيان والسلمون"];
        const mealTiers = [
          { name: "وجبة واحدة يومياً", mealsPerDay: 1 },
          { name: "وجبتان يومياً", mealsPerDay: 2 },
          { name: "3 وجبات يومياً", mealsPerDay: 3 },
          { name: "4 وجبات يومياً", mealsPerDay: 4 },
        ];
        const defaults = packageTypes.flatMap(packageType => mealTiers.flatMap(tier => durations.map(durationDays => ({ name: `${packageType} — ${tier.name}`, durationDays, totalMeals: durationDays * tier.mealsPerDay }))));
        const existing = await tx.select({ id: mealPackages.id, name: mealPackages.name, durationDays: mealPackages.durationDays }).from(mealPackages).for("update");
        const legacyTiers = new Set(mealTiers.map(tier => tier.name));
        for (const item of existing) if (legacyTiers.has(item.name)) await tx.update(mealPackages).set({ name: `باقة دجاج — ${item.name}` }).where(eq(mealPackages.id, item.id));
        const current = await tx.select({ name: mealPackages.name, durationDays: mealPackages.durationDays }).from(mealPackages).for("update");
        if (current.length >= defaults.length) return 0;
        const existingKeys = new Set(current.map(item => `${item.name}:${item.durationDays}`));
        const missing = defaults.filter(item => !existingKeys.has(`${item.name}:${item.durationDays}`));
        if (missing.length) await tx.insert(mealPackages).values(missing.map(item => ({ ...item, createdByUserId: ctx.user.id, active: 1 })));
        return missing.length;
      });
      return { createdCount };
    }),
    createMealPackage: managerProcedure.input(z.object({ name: z.string().trim().min(2).max(140), durationDays: z.number().int().min(1).max(3650), totalMeals: z.number().int().min(1).max(5000) })).mutation(async ({ ctx, input }) => {
      const db = await dbOrFail();
      await db.insert(mealPackages).values({ ...input, createdByUserId: ctx.user.id, active: 1 });
      return { ok: true };
    }),
    updateMealPackage: managerProcedure.input(z.object({ packageId: z.number().int().positive(), name: z.string().trim().min(2).max(140), durationDays: z.number().int().min(1).max(3650), totalMeals: z.number().int().min(1).max(5000) })).mutation(async ({ input }) => {
      const db = await dbOrFail();
      const [existing] = await db.select({ id: mealPackages.id }).from(mealPackages).where(eq(mealPackages.id, input.packageId)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "الباقة غير موجودة" });
      await db.update(mealPackages).set({ name: input.name, durationDays: input.durationDays, totalMeals: input.totalMeals }).where(eq(mealPackages.id, input.packageId));
      return { ok: true };
    }),
    setMealPackageActive: managerProcedure.input(z.object({ packageId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ input }) => {
      const db = await dbOrFail();
      const [existing] = await db.select({ id: mealPackages.id }).from(mealPackages).where(eq(mealPackages.id, input.packageId)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "الباقة غير موجودة" });
      await db.update(mealPackages).set({ active: input.active ? 1 : 0 }).where(eq(mealPackages.id, input.packageId));
      return { ok: true };
    }),
    importCustomers: managerProcedure.input(z.array(z.object({
      fullName: z.string().trim().min(2).max(160),
      phone: z.string().trim().min(7).max(40),
      email: z.string().trim().email().max(320).optional().or(z.literal("")),
      gender: z.enum(["female", "male", "unspecified"]),
      packageName: z.string().trim().min(1).max(140),
      durationDays: z.number().int().min(1).max(3650),
      totalMeals: z.number().int().min(1).max(5000),
      mealsRemaining: z.number().int().min(0).max(5000),
      deliveryMode: z.enum(["delivery", "manual"]).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      cashierEmail: z.string().trim().email().max(320),
    }).refine(row => row.mealsRemaining <= row.totalMeals, { message: "الرصيد المتبقي يتجاوز إجمالي الوجبات" })).min(1).max(500)).mutation(async ({ ctx, input }) => {
      const db = await dbOrFail();
      const cashierEmails = [...new Set(input.map(row => row.cashierEmail.trim().toLowerCase()))];
      const cashierRows = await db.select().from(cashiers).where(inArray(cashiers.email, cashierEmails));
      const cashierByEmail = new Map(cashierRows.filter(item => item.active === 1).map(item => [item.email.toLowerCase(), item]));
      if (input.some(row => !cashierByEmail.has(row.cashierEmail.trim().toLowerCase()))) throw new TRPCError({ code: "BAD_REQUEST", message: "لم تُستورد البيانات: كل cashierEmail يجب أن يطابق بريداً لكاشير نشط في النظام." });
      const dateFromIso = (value: string) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new TRPCError({ code: "BAD_REQUEST", message: "التاريخ غير صالح؛ استخدمي YYYY-MM-DD." });
        return date;
      };
      const phones = input.map(row => row.phone.trim());
      if (new Set(phones).size !== phones.length) throw new TRPCError({ code: "CONFLICT", message: "الملف يحتوي أرقام هاتف مكررة؛ أزيلي التكرار ثم أعيدي الاستيراد." });
      if ((await db.select({ phone: customers.phone }).from(customers).where(inArray(customers.phone, phones))).length) throw new TRPCError({ code: "CONFLICT", message: "بعض أرقام الهاتف موجودة مسبقاً؛ لم يتم استيراد أي صف." });
      for (const row of input) if (dateFromIso(row.expiresAt) < dateFromIso(row.startDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "تاريخ انتهاء الباقة لا يمكن أن يسبق تاريخ البدء." });
      await db.transaction(async tx => {
        for (const row of input) {
          const cashier = cashierByEmail.get(row.cashierEmail.trim().toLowerCase())!;
          const [link] = await tx.insert(registrationLinks).values({ token: nanoid(40), branchId: cashier.branchId, cashierId: cashier.id, totalMeals: row.totalMeals, packageSelectionEnabled: 0, createdByUserId: ctx.user.id, usedAt: new Date() });
          await tx.insert(customers).values({ token: nanoid(40), membershipNumber: `DC-${nanoid(10).toUpperCase()}`, deliveryMode: row.deliveryMode ?? "manual", fullName: row.fullName, phone: row.phone.trim(), email: row.email || null, gender: row.gender, packageId: null, packageName: row.packageName, packageDays: row.durationDays, packageStartedAt: dateFromIso(row.startDate), packageExpiresAt: dateFromIso(row.expiresAt), totalMeals: row.totalMeals, mealsRemaining: row.mealsRemaining, registrationLinkId: link.insertId, sourceBranchId: cashier.branchId, sourceCashierId: cashier.id });
        }
      });
      return { importedCount: input.length };
    }),
    updateCustomer: managerProcedure.input(z.object({ customerId: z.number().int().positive(), fullName: z.string().trim().min(2).max(160), phone: z.string().trim().min(7).max(40), email: z.string().trim().email().max(320).optional().or(z.literal("")), gender: z.enum(["female", "male", "unspecified"]), deliveryMode: z.enum(["delivery", "manual"]), packageName: z.string().trim().min(1).max(140), packageDays: z.number().int().min(0).max(3650), packageStartedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")), packageExpiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")), totalMeals: z.number().int().min(1).max(5000), mealsRemaining: z.number().int().min(0).max(5000) }).refine(value => value.mealsRemaining <= value.totalMeals, { message: "عدد الوجبات المتبقية لا يمكن أن يتجاوز إجمالي الوجبات" }).refine(value => value.packageDays === 0 || (!!value.packageStartedAt && !!value.packageExpiresAt), { message: "أدخلي تاريخ بدء وانتهاء الباقة" }).refine(value => !value.packageStartedAt || !value.packageExpiresAt || value.packageExpiresAt >= value.packageStartedAt, { message: "تاريخ انتهاء الباقة لا يمكن أن يسبق تاريخ البدء" }))
      .mutation(async ({ input }) => {
        const db = await dbOrFail();
        const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)).limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "العميل غير موجود" });
        const dateAtNoon = (value: string) => value ? new Date(`${value}T12:00:00.000Z`) : null;
        await db.update(customers).set({ fullName: input.fullName, phone: input.phone, email: input.email || null, gender: input.gender, deliveryMode: input.deliveryMode, packageName: input.packageName, packageDays: input.packageDays, packageStartedAt: dateAtNoon(input.packageStartedAt ?? ""), packageExpiresAt: dateAtNoon(input.packageExpiresAt ?? ""), totalMeals: input.totalMeals, mealsRemaining: input.mealsRemaining }).where(eq(customers.id, input.customerId));
        const wallet = await syncCustomerWallet(input.customerId);
        return { ok: true, walletStatus: wallet.status, walletErrorCode: wallet.errorCode };
      }),
  }),

  registration: router({
    createLink: operatorProcedure.input(z.object({ cashierId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrFail();
      const [availablePackage] = await db.select({ id: mealPackages.id }).from(mealPackages).where(eq(mealPackages.active, 1)).limit(1);
      if (!availablePackage) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا توجد باقات مفعّلة. على المدير إضافة باقة واحدة على الأقل أولاً." });
      let cashierId = ctx.actor.cashierId;
      if (ctx.actor.role === "manager") cashierId = input.cashierId ?? null;
      if (!cashierId) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر كاشيراً لهذا الرابط" });
      const [cashier] = await db.select().from(cashiers).where(and(eq(cashiers.id, cashierId), eq(cashiers.active, 1))).limit(1);
      if (!cashier) throw new TRPCError({ code: "NOT_FOUND", message: "الكاشير غير موجود أو غير فعّال" });
      const token = nanoid(40);
      await db.insert(registrationLinks).values({ token, branchId: cashier.branchId, cashierId: cashier.id, totalMeals: 0, packageSelectionEnabled: 1, createdByUserId: ctx.user.id });
      return { url: linkPath("register", token), token };
    }),
    info: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).query(async ({ input }) => {
      const db = await dbOrFail();
      const [row] = await db.select({ link: registrationLinks, branchName: branches.name, cashierName: cashiers.name }).from(registrationLinks).innerJoin(branches, eq(registrationLinks.branchId, branches.id)).innerJoin(cashiers, eq(registrationLinks.cashierId, cashiers.id)).where(eq(registrationLinks.token, input.token)).limit(1);
      if (!row || row.link.usedAt) throw new TRPCError({ code: "NOT_FOUND", message: "رابط التسجيل غير صالح أو تم استخدامه" });
      const packages = row.link.packageSelectionEnabled ? await db.select({ id: mealPackages.id, name: mealPackages.name, durationDays: mealPackages.durationDays, totalMeals: mealPackages.totalMeals }).from(mealPackages).where(eq(mealPackages.active, 1)).orderBy(desc(mealPackages.createdAt)) : [];
      return { totalMeals: row.link.totalMeals, packageSelectionEnabled: row.link.packageSelectionEnabled === 1, packages, branchName: row.branchName, cashierName: row.cashierName };
    }),
    submit: publicProcedure.input(z.object({ token: z.string().min(20).max(64), fullName: z.string().trim().min(2).max(160), phone: z.string().trim().min(7).max(40), email: z.string().trim().email().max(320).optional().or(z.literal("")), gender: z.enum(["female", "male", "unspecified"]), packageId: z.number().int().positive().optional(), deliveryMode: z.enum(["delivery", "manual"]).optional() })).mutation(async ({ input }) => {
      const db = await dbOrFail();
      const customer = await db.transaction(async tx => {
        const [link] = await tx.select().from(registrationLinks).where(eq(registrationLinks.token, input.token)).limit(1);
        if (!link || link.usedAt) throw new TRPCError({ code: "NOT_FOUND", message: "رابط التسجيل غير صالح أو تم استخدامه" });
        let selectedPackage: typeof mealPackages.$inferSelect | undefined;
        if (link.packageSelectionEnabled === 1) {
          if (!input.packageId) throw new TRPCError({ code: "BAD_REQUEST", message: "اختاري الباقة قبل إنشاء البطاقة." });
          if (!input.deliveryMode) throw new TRPCError({ code: "BAD_REQUEST", message: "اختاري طريقة الاستلام قبل إنشاء البطاقة." });
          [selectedPackage] = await tx.select().from(mealPackages).where(and(eq(mealPackages.id, input.packageId), eq(mealPackages.active, 1))).limit(1);
          if (!selectedPackage) throw new TRPCError({ code: "NOT_FOUND", message: "هذه الباقة لم تعد متاحة؛ حدّثي الصفحة واختاري باقة أخرى." });
        } else if (input.packageId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "هذا رابط تسجيل قديم ولا يقبل تغيير الباقة." });
        }
        const [claimed] = await tx.update(registrationLinks).set({ usedAt: new Date() }).where(and(eq(registrationLinks.id, link.id), isNull(registrationLinks.usedAt)));
        if (!claimed.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "تم استخدام رابط التسجيل مسبقاً" });
        const totalMeals = selectedPackage?.totalMeals ?? link.totalMeals;
        const packageStartedAt = selectedPackage ? new Date() : null;
        const packageExpiresAt = selectedPackage ? new Date(packageStartedAt!.getTime() + selectedPackage.durationDays * 24 * 60 * 60 * 1000) : null;
        const token = nanoid(40);
        const [inserted] = await tx.insert(customers).values({ token, membershipNumber: `DC-${nanoid(10).toUpperCase()}`, deliveryMode: input.deliveryMode ?? "manual", fullName: input.fullName, phone: input.phone, email: input.email || null, gender: input.gender, packageId: selectedPackage?.id ?? null, packageName: selectedPackage?.name ?? "باقة تسجيل قديمة", packageDays: selectedPackage?.durationDays ?? 0, packageStartedAt, packageExpiresAt, totalMeals, mealsRemaining: totalMeals, registrationLinkId: link.id, sourceBranchId: link.branchId, sourceCashierId: link.cashierId });
        return { id: inserted.insertId, token };
      });
      await syncCustomerWallet(customer.id);
      return { url: `/member/${customer.token}` };
    }),
  }),

  customers: router({
    redeem: operatorProcedure.input(z.object({ token: z.string().min(20).max(64) })).mutation(async ({ ctx, input }) => {
      const db = await dbOrFail();
      const [customer] = await db.select().from(customers).where(eq(customers.token, input.token)).limit(1);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على بطاقة بهذا الرمز" });
      if (ctx.actor.role === "cashier" && customer.sourceCashierId !== ctx.actor.cashierId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه البطاقة غير مرتبطة بحسابك. راجع الفرع المسجل للعميل." });
      }
      const branchId = ctx.actor.role === "manager" ? customer.sourceBranchId : ctx.actor.branchId;
      const cashierId = ctx.actor.role === "manager" ? null : ctx.actor.cashierId;
      const result = await db.transaction(async tx => {
        const [updated] = await tx.update(customers).set({ mealsRemaining: sql`${customers.mealsRemaining} - 1` }).where(and(eq(customers.id, customer.id), gt(customers.mealsRemaining, 0)));
        if (!updated.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "لا توجد وجبات متبقية لهذا العميل" });
        await tx.insert(redemptions).values({ customerId: customer.id, branchId, cashierId, method: "cashier", redeemedByUserId: ctx.user.id });
        const [fresh] = await tx.select().from(customers).where(eq(customers.id, customer.id)).limit(1);
        return { fullName: fresh.fullName, mealsRemaining: fresh.mealsRemaining, totalMeals: fresh.totalMeals };
      });
      const wallet = await syncCustomerWallet(customer.id);
      return { ...result, walletSync: wallet.status };
    }),
    member: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).query(async ({ ctx, input }) => {
      const db = await dbOrFail();
      const [row] = await db.select({ customer: customers, branchName: branches.name }).from(customers).innerJoin(branches, eq(customers.sourceBranchId, branches.id)).where(eq(customers.token, input.token)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "بطاقة العميل غير موجودة" });
      let walletOrigin: string;
      try {
        walletOrigin = resolveGoogleWalletRequestOrigin(ctx.req.get("origin"), ctx.req.get("referer"));
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "تعذر التحقق من موقع آمن لإنشاء رابط Google Wallet" });
      }
      let googleWalletSaveUrl: string | null = null;
      let googleWalletLinkErrorCode: string | null = null;
      try {
        googleWalletSaveUrl = await createGoogleWalletSaveUrl({ ...row.customer, branchName: row.branchName }, walletOrigin);
      } catch (error) {
        googleWalletLinkErrorCode = googleWalletErrorCodeFn(error);
      }
      return { fullName: row.customer.fullName, membershipNumber: row.customer.membershipNumber, deliveryMode: row.customer.deliveryMode, phone: row.customer.phone, email: row.customer.email, gender: row.customer.gender, packageName: row.customer.packageName, packageDays: row.customer.packageDays, packageStartedAt: row.customer.packageStartedAt, packageExpiresAt: row.customer.packageExpiresAt, totalMeals: row.customer.totalMeals, mealsRemaining: row.customer.mealsRemaining, branchName: row.branchName, createdAt: row.customer.createdAt, googleWalletStatus: row.customer.googleWalletStatus, googleWalletErrorCode: row.customer.googleWalletErrorCode, googleWalletLinkErrorCode, googleWalletSaveUrl };
    }),
    retryGoogleWallet: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).mutation(async ({ input }) => {
      const db = await dbOrFail();
      const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.token, input.token)).limit(1);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "بطاقة العميل غير موجودة" });
      return syncCustomerWallet(customer.id);
    }),
  }),

  deliveryStation: router({
    createLink: operatorProcedure.input(z.object({ cashierId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const cashierId = ctx.actor.role === "cashier" ? ctx.actor.cashierId : input.cashierId;
      if (!cashierId) throw new TRPCError({ code: "BAD_REQUEST", message: "اختاري الكاشير الذي سيُنسب إليه رابط التوصيل" });
      const db = await dbOrFail();
      return saveDeliveryStationLink(db, cashierId, ctx.user.id);
    }),
    rotateLink: operatorProcedure.input(z.object({ cashierId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const cashierId = ctx.actor.role === "cashier" ? ctx.actor.cashierId : input.cashierId;
      if (!cashierId) throw new TRPCError({ code: "BAD_REQUEST", message: "اختاري الكاشير الذي سيُنسب إليه رابط التوصيل" });
      const db = await dbOrFail();
      return saveDeliveryStationLink(db, cashierId, ctx.user.id, true);
    }),
    info: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).query(async ({ input }) => {
      const db = await dbOrFail();
      const [station] = await db.select({ active: deliveryStations.active, cashierActive: cashiers.active, branchName: branches.name, cashierName: cashiers.name }).from(deliveryStations).innerJoin(branches, eq(deliveryStations.branchId, branches.id)).innerJoin(cashiers, eq(deliveryStations.cashierId, cashiers.id)).where(eq(deliveryStations.token, input.token)).limit(1);
      if (!station || station.active !== 1 || station.cashierActive !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "رابط ماسح التوصيل غير صالح أو تم تغييره" });
      return { branchName: station.branchName, cashierName: station.cashierName };
    }),
    preview: publicProcedure.input(z.object({ stationToken: z.string().min(20).max(64), customerToken: z.string().min(20).max(64) })).query(async ({ input }) => {
      const db = await dbOrFail();
      const [station] = await db.select({ active: deliveryStations.active, cashierActive: cashiers.active }).from(deliveryStations).innerJoin(cashiers, eq(deliveryStations.cashierId, cashiers.id)).where(eq(deliveryStations.token, input.stationToken)).limit(1);
      if (!station || station.active !== 1 || station.cashierActive !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "رابط ماسح التوصيل غير صالح أو تم تغييره" });
      const [row] = await db.select({ customer: customers, sourceBranchName: branches.name }).from(customers).innerJoin(branches, eq(customers.sourceBranchId, branches.id)).where(eq(customers.token, input.customerToken)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على بطاقة بهذا الرمز" });
      return { fullName: row.customer.fullName, mealsRemaining: row.customer.mealsRemaining, totalMeals: row.customer.totalMeals, sourceBranchName: row.sourceBranchName };
    }),
    redeem: publicProcedure.input(z.object({ stationToken: z.string().min(20).max(64), customerToken: z.string().min(20).max(64) })).mutation(async ({ input }) => {
      const db = await dbOrFail();
      const result = await db.transaction(async tx => {
        const [stationRow] = await tx.select({ station: deliveryStations, cashierActive: cashiers.active }).from(deliveryStations).innerJoin(cashiers, eq(deliveryStations.cashierId, cashiers.id)).where(eq(deliveryStations.token, input.stationToken)).limit(1).for("update");
        if (!stationRow || stationRow.station.active !== 1 || stationRow.cashierActive !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "رابط ماسح التوصيل غير صالح أو تم تغييره" });
        const station = stationRow.station;
        const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.token, input.customerToken)).limit(1);
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على بطاقة بهذا الرمز" });
        const [updated] = await tx.update(customers).set({ mealsRemaining: sql`${customers.mealsRemaining} - 1` }).where(and(eq(customers.id, customer.id), gt(customers.mealsRemaining, 0)));
        if (!updated.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "لا توجد وجبات متبقية لهذا العميل" });
        await tx.insert(redemptions).values({ customerId: customer.id, branchId: station.branchId, cashierId: station.cashierId, method: "delivery", deliveryLinkId: null, redeemedByUserId: station.createdByUserId });
        await tx.update(deliveryStations).set({ lastUsedAt: new Date() }).where(and(eq(deliveryStations.id, station.id), eq(deliveryStations.token, input.stationToken), eq(deliveryStations.active, 1)));
        const [fresh] = await tx.select().from(customers).where(eq(customers.id, customer.id)).limit(1);
        return { customerId: customer.id, fullName: fresh.fullName, mealsRemaining: fresh.mealsRemaining, totalMeals: fresh.totalMeals };
      });
      const wallet = await syncCustomerWallet(result.customerId);
      return { fullName: result.fullName, mealsRemaining: result.mealsRemaining, totalMeals: result.totalMeals, walletSync: wallet.status };
    }),
  }),

  delivery: router({
    preview: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).query(async ({ input }) => {
      const db = await dbOrFail();
      const [row] = await db.select({ link: deliveryLinks, customer: customers }).from(deliveryLinks).innerJoin(customers, eq(deliveryLinks.customerId, customers.id)).where(eq(deliveryLinks.token, input.token)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "رابط التوصيل غير صالح" });
      const expired = row.link.status === "pending" && Date.now() - row.link.createdAt.getTime() > 24 * 60 * 60 * 1000;
      return { status: expired ? "expired" as const : row.link.status, fullName: row.customer.fullName, mealsRemaining: row.customer.mealsRemaining, createdAt: row.link.createdAt };
    }),
    complete: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).mutation(async ({ input }) => {
      const db = await dbOrFail();
      const [row] = await db.select({ link: deliveryLinks, customer: customers }).from(deliveryLinks).innerJoin(customers, eq(deliveryLinks.customerId, customers.id)).where(eq(deliveryLinks.token, input.token)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "رابط التوصيل غير صالح" });
      if (row.link.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "تم استخدام رابط التوصيل مسبقاً" });
      if (Date.now() - row.link.createdAt.getTime() > 24 * 60 * 60 * 1000) throw new TRPCError({ code: "TIMEOUT", message: "انتهت صلاحية رابط التوصيل" });
      const result = await db.transaction(async tx => {
        const [linkUpdate] = await tx.update(deliveryLinks).set({ status: "completed", redeemedAt: new Date() }).where(and(eq(deliveryLinks.id, row.link.id), eq(deliveryLinks.status, "pending")));
        if (!linkUpdate.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "تم استخدام رابط التوصيل مسبقاً" });
        const [customerUpdate] = await tx.update(customers).set({ mealsRemaining: sql`${customers.mealsRemaining} - 1` }).where(and(eq(customers.id, row.customer.id), gt(customers.mealsRemaining, 0)));
        if (!customerUpdate.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "لا توجد وجبات متبقية لهذا العميل" });
        await tx.insert(redemptions).values({ customerId: row.customer.id, branchId: row.link.branchId, cashierId: row.link.cashierId, method: "delivery", deliveryLinkId: row.link.id, redeemedByUserId: row.link.createdByUserId });
        const [fresh] = await tx.select().from(customers).where(eq(customers.id, row.customer.id)).limit(1);
        return { fullName: fresh.fullName, mealsRemaining: fresh.mealsRemaining, totalMeals: fresh.totalMeals };
      });
      const wallet = await syncCustomerWallet(row.customer.id);
      return { ...result, walletSync: wallet.status };
    }),
  }),
});

export type AppRouter = typeof appRouter;
