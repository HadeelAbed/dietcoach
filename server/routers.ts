import { COOKIE_NAME } from "@shared/const";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { branches, cashiers, customers, deliveryLinks, redemptions, registrationLinks } from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createGoogleWalletSaveUrl, googleWalletErrorCode as googleWalletErrorCodeFn, upsertGoogleWalletObject } from "./googleWallet";

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
        customers: clientRows.map(item => ({ ...item, branchName: branchMap.get(item.sourceBranchId) ?? "—", cashierName: cashierMap.get(item.sourceCashierId) ?? "—" })),
        activity: activityRows.map(item => ({ ...item, customerName: customerMap.get(item.customerId) ?? "عميل", branchName: item.branchId == null ? "—" : branchMap.get(item.branchId) ?? "—", cashierName: item.cashierId == null ? "الإدارة" : cashierMap.get(item.cashierId) ?? "—", methodLabel: item.method === "delivery" ? "توصيل" : "الكاشير" })),
        stats: { customers: clientRows.length, mealsRemaining: clientRows.reduce((sum, item) => sum + item.mealsRemaining, 0), redemptionsToday, branches: allBranches.length, cashiers: allCashiers.length },
      };
    }),
  }),

  manager: router({
    createBranch: managerProcedure.input(z.object({ name: z.string().trim().min(2).max(140), location: z.string().trim().max(255).optional() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrFail();
      await db.insert(branches).values({ name: input.name, location: input.location || null, createdByUserId: ctx.user.id });
      return { ok: true };
    }),
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
    updateCustomer: managerProcedure.input(z.object({ customerId: z.number().int().positive(), fullName: z.string().trim().min(2).max(160), phone: z.string().trim().min(7).max(40), email: z.string().trim().email().max(320).optional().or(z.literal("")), totalMeals: z.number().int().min(1).max(200), mealsRemaining: z.number().int().min(0) }).refine(value => value.mealsRemaining <= value.totalMeals, { message: "عدد الوجبات المتبقية لا يمكن أن يتجاوز إجمالي الوجبات" }))
      .mutation(async ({ input }) => {
        const db = await dbOrFail();
        const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)).limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "العميل غير موجود" });
        await db.update(customers).set({ fullName: input.fullName, phone: input.phone, email: input.email || null, totalMeals: input.totalMeals, mealsRemaining: input.mealsRemaining }).where(eq(customers.id, input.customerId));
        const wallet = await syncCustomerWallet(input.customerId);
        return { ok: true, walletStatus: wallet.status, walletErrorCode: wallet.errorCode };
      }),
  }),

  registration: router({
    createLink: operatorProcedure.input(z.object({ totalMeals: z.number().int().min(1).max(200), cashierId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrFail();
      let cashierId = ctx.actor.cashierId;
      if (ctx.actor.role === "manager") cashierId = input.cashierId ?? null;
      if (!cashierId) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر كاشيراً لهذا الرابط" });
      const [cashier] = await db.select().from(cashiers).where(and(eq(cashiers.id, cashierId), eq(cashiers.active, 1))).limit(1);
      if (!cashier) throw new TRPCError({ code: "NOT_FOUND", message: "الكاشير غير موجود أو غير فعّال" });
      const token = nanoid(40);
      await db.insert(registrationLinks).values({ token, branchId: cashier.branchId, cashierId: cashier.id, totalMeals: input.totalMeals, createdByUserId: ctx.user.id });
      return { url: linkPath("register", token), token };
    }),
    info: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).query(async ({ input }) => {
      const db = await dbOrFail();
      const [row] = await db.select({ link: registrationLinks, branchName: branches.name, cashierName: cashiers.name }).from(registrationLinks).innerJoin(branches, eq(registrationLinks.branchId, branches.id)).innerJoin(cashiers, eq(registrationLinks.cashierId, cashiers.id)).where(eq(registrationLinks.token, input.token)).limit(1);
      if (!row || row.link.usedAt) throw new TRPCError({ code: "NOT_FOUND", message: "رابط التسجيل غير صالح أو تم استخدامه" });
      return { totalMeals: row.link.totalMeals, branchName: row.branchName, cashierName: row.cashierName };
    }),
    submit: publicProcedure.input(z.object({ token: z.string().min(20).max(64), fullName: z.string().trim().min(2).max(160), phone: z.string().trim().min(7).max(40), email: z.string().trim().email().max(320).optional().or(z.literal("")) })).mutation(async ({ input }) => {
      const db = await dbOrFail();
      const customer = await db.transaction(async tx => {
        const [link] = await tx.select().from(registrationLinks).where(eq(registrationLinks.token, input.token)).limit(1);
        if (!link || link.usedAt) throw new TRPCError({ code: "NOT_FOUND", message: "رابط التسجيل غير صالح أو تم استخدامه" });
        const [claimed] = await tx.update(registrationLinks).set({ usedAt: new Date() }).where(and(eq(registrationLinks.id, link.id), isNull(registrationLinks.usedAt)));
        if (!claimed.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "تم استخدام رابط التسجيل مسبقاً" });
        const token = nanoid(40);
        const [inserted] = await tx.insert(customers).values({ token, fullName: input.fullName, phone: input.phone, email: input.email || null, totalMeals: link.totalMeals, mealsRemaining: link.totalMeals, registrationLinkId: link.id, sourceBranchId: link.branchId, sourceCashierId: link.cashierId });
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
    member: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).query(async ({ input }) => {
      const db = await dbOrFail();
      const [row] = await db.select({ customer: customers, branchName: branches.name }).from(customers).innerJoin(branches, eq(customers.sourceBranchId, branches.id)).where(eq(customers.token, input.token)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "بطاقة العميل غير موجودة" });
      let googleWalletSaveUrl: string | null = null;
      let googleWalletStatus = row.customer.googleWalletStatus;
      let googleWalletErrorCode = row.customer.googleWalletErrorCode;
      if (googleWalletStatus === "ready" && row.customer.googleWalletObjectId) {
        try {
          googleWalletSaveUrl = await createGoogleWalletSaveUrl({ ...row.customer, branchName: row.branchName });
        } catch (error) {
          googleWalletStatus = "error";
          googleWalletErrorCode = googleWalletErrorCodeFn(error);
        }
      }
      return { fullName: row.customer.fullName, phone: row.customer.phone, email: row.customer.email, totalMeals: row.customer.totalMeals, mealsRemaining: row.customer.mealsRemaining, branchName: row.branchName, createdAt: row.customer.createdAt, googleWalletStatus, googleWalletErrorCode, googleWalletSaveUrl };
    }),
    retryGoogleWallet: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).mutation(async ({ input }) => {
      const db = await dbOrFail();
      const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.token, input.token)).limit(1);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "بطاقة العميل غير موجودة" });
      return syncCustomerWallet(customer.id);
    }),
    createDeliveryLink: operatorProcedure.input(z.object({ customerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrFail();
      const [customer] = await db.select().from(customers).where(eq(customers.id, input.customerId)).limit(1);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "العميل غير موجود" });
      if (ctx.actor.role === "cashier" && customer.sourceCashierId !== ctx.actor.cashierId) throw new TRPCError({ code: "FORBIDDEN", message: "يمكنك إنشاء روابط توصيل لعملائك فقط" });
      const token = nanoid(40);
      const cashierId = ctx.actor.role === "cashier" ? ctx.actor.cashierId : customer.sourceCashierId;
      const branchId = ctx.actor.role === "cashier" ? ctx.actor.branchId : customer.sourceBranchId;
      await db.insert(deliveryLinks).values({ token, customerId: customer.id, createdByUserId: ctx.user.id, cashierId, branchId });
      return { url: linkPath("delivery", token) };
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
