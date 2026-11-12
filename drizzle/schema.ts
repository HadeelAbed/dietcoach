import { double, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  location: varchar("location", { length: 255 }),
  latitude: double("latitude"),
  longitude: double("longitude"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const cashiers = mysqlTable("cashiers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  branchId: int("branchId").notNull(),
  active: int("active").default(1).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const registrationLinks = mysqlTable("registrationLinks", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  branchId: int("branchId").notNull(),
  cashierId: int("cashierId").notNull(),
  totalMeals: int("totalMeals").notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  usedAt: timestamp("usedAt"),
});

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  email: varchar("email", { length: 320 }),
  totalMeals: int("totalMeals").notNull(),
  mealsRemaining: int("mealsRemaining").notNull(),
  registrationLinkId: int("registrationLinkId").notNull(),
  sourceBranchId: int("sourceBranchId").notNull(),
  sourceCashierId: int("sourceCashierId").notNull(),
  googleWalletObjectId: varchar("googleWalletObjectId", { length: 255 }).unique(),
  googleWalletStatus: mysqlEnum("googleWalletStatus", ["pending", "ready", "error"]).default("pending").notNull(),
  googleWalletErrorCode: varchar("googleWalletErrorCode", { length: 80 }),
  googleWalletUpdatedAt: timestamp("googleWalletUpdatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const deliveryLinks = mysqlTable("deliveryLinks", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  customerId: int("customerId").notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  cashierId: int("cashierId"),
  branchId: int("branchId"),
  status: mysqlEnum("status", ["pending", "completed", "expired"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  redeemedAt: timestamp("redeemedAt"),
});

export const deliveryStations = mysqlTable("deliveryStations", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  cashierId: int("cashierId").notNull().unique(),
  branchId: int("branchId").notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
});

export const redemptions = mysqlTable("redemptions", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  branchId: int("branchId"),
  cashierId: int("cashierId"),
  method: mysqlEnum("method", ["cashier", "delivery"]).notNull(),
  deliveryLinkId: int("deliveryLinkId"),
  redeemedByUserId: int("redeemedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
