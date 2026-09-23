// Creates the tables added after the first migration and renames records
// filed under the old short property names. Runs once at server start; every
// statement is idempotent, so restarts and concurrent instances are safe.
import { sql } from "drizzle-orm";
import { LEGACY_PROPERTY_NAMES } from "@shared/properties";
import { getDb } from "./db";

export const SCHEMA_STATEMENTS = [
  sql`CREATE TABLE IF NOT EXISTS "scrape_runs" (
    "id" serial PRIMARY KEY NOT NULL,
    "label" varchar(255) NOT NULL,
    "kind" varchar(16) DEFAULT 'range' NOT NULL,
    "status" varchar(32) DEFAULT 'queued' NOT NULL,
    "startMonthKey" varchar(7) NOT NULL,
    "endMonthKey" varchar(7) NOT NULL,
    "properties" text,
    "totalMonths" integer DEFAULT 1 NOT NULL,
    "completedMonths" integer DEFAULT 0 NOT NULL,
    "currentMonthKey" varchar(7),
    "currentProperty" varchar(128),
    "progressMessage" text,
    "passed" integer DEFAULT 0 NOT NULL,
    "failed" integer DEFAULT 0 NOT NULL,
    "total" integer DEFAULT 0 NOT NULL,
    "pdfs" integer DEFAULT 0 NOT NULL,
    "errorMessage" text,
    "githubRunUrl" varchar(512),
    "startedAt" timestamp DEFAULT now() NOT NULL,
    "completedAt" timestamp,
    "updatedAt" timestamp DEFAULT now() NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" varchar(64) PRIMARY KEY NOT NULL,
    "value" text NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
  )`,
];

/** Rename old -> new, skipping months that already have a record under the new name. */
export function renameStatements() {
  return Object.entries(LEGACY_PROPERTY_NAMES).map(
    ([from, to]) => sql`UPDATE "inspection_records" AS r SET "property" = ${to}
      WHERE r."property" = ${from}
        AND NOT EXISTS (
          SELECT 1 FROM "inspection_records" AS n
          WHERE n."monthKey" = r."monthKey" AND n."region" = r."region" AND n."property" = ${to}
        )`,
  );
}

export async function ensureSchema() {
  const db = await getDb();
  if (!db) return;
  try {
    for (const s of SCHEMA_STATEMENTS) await db.execute(s);
    for (const s of renameStatements()) await db.execute(s);
    console.log("[Database] schema ready");
  } catch (err) {
    console.error("[Database] schema setup failed:", err);
  }
}
