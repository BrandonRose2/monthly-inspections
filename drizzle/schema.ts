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

// One row per scraper run, whether started from the portal, by the monthly
// schedule, or as a mapping test. Doubles as the "Saved Runs" list.
export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 255 }).notNull(),
  kind: varchar("kind", { length: 16 }).default("range").notNull(), // range | test | scheduled
  status: varchar("status", { length: 32 }).default("queued").notNull(), // queued | running | completed | completed_with_errors | failed
  startMonthKey: varchar("startMonthKey", { length: 7 }).notNull(),
  endMonthKey: varchar("endMonthKey", { length: 7 }).notNull(),
  properties: text("properties"), // JSON array for test runs; null = all
  totalMonths: integer("totalMonths").default(1).notNull(),
  completedMonths: integer("completedMonths").default(0).notNull(),
  currentMonthKey: varchar("currentMonthKey", { length: 7 }),
  currentProperty: varchar("currentProperty", { length: 128 }),
  progressMessage: text("progressMessage"),
  passed: integer("passed").default(0).notNull(),
  failed: integer("failed").default(0).notNull(),
  total: integer("total").default(0).notNull(),
  pdfs: integer("pdfs").default(0).notNull(),
  errorMessage: text("errorMessage"),
  githubRunUrl: varchar("githubRunUrl", { length: 512 }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type ScrapeRun = typeof scrapeRuns.$inferSelect;

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

// Live console lines for a run (the "Run Scraper" log view).
export const scrapeRunLog = pgTable("scrape_run_log", {
  id: serial("id").primaryKey(),
  runId: integer("runId").notNull(),
  line: text("line").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
