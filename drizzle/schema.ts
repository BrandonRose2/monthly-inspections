import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Stores one row per property per month
export const inspectionRecords = mysqlTable("inspection_records", {
  id: int("id").autoincrement().primaryKey(),
  monthKey: varchar("monthKey", { length: 7 }).notNull(),   // "YYYY-MM"
  region: varchar("region", { length: 64 }).notNull(),
  property: varchar("property", { length: 128 }).notNull(),
  checked: boolean("checked").default(false).notNull(),
  xed: boolean("xed").default(false).notNull(),
  note: text("note"),
  pdfName: varchar("pdfName", { length: 255 }),
  pdfKey: varchar("pdfKey", { length: 512 }),               // S3 storage key
  pdfSize: int("pdfSize"),
  pdfUploadedAt: varchar("pdfUploadedAt", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InspectionRecord = typeof inspectionRecords.$inferSelect;
export type InsertInspectionRecord = typeof inspectionRecords.$inferInsert;
