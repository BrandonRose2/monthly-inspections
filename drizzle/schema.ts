import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Postgres has no ON UPDATE clause; Drizzle applies this in the driver.
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Stores one row per property per month
export const inspectionRecords = pgTable("inspection_records", {
  id: serial("id").primaryKey(),
  monthKey: varchar("monthKey", { length: 7 }).notNull(), // "YYYY-MM"
  region: varchar("region", { length: 64 }).notNull(),
  property: varchar("property", { length: 128 }).notNull(),
  checked: boolean("checked").default(false).notNull(),
  xed: boolean("xed").default(false).notNull(),
  note: text("note"),
  pdfName: varchar("pdfName", { length: 255 }),
  pdfKey: varchar("pdfKey", { length: 512 }), // object storage key
  pdfSize: integer("pdfSize"),
  pdfUploadedAt: varchar("pdfUploadedAt", { length: 64 }),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type InspectionRecord = typeof inspectionRecords.$inferSelect;
export type InsertInspectionRecord = typeof inspectionRecords.$inferInsert;
