import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { inspectionRecords, InsertInspectionRecord, InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.

// ── Inspection Records ────────────────────────────────────────────────────────

export async function getMonthRecords(monthKey: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inspectionRecords).where(eq(inspectionRecords.monthKey, monthKey));
}

export async function upsertInspectionRecord(record: InsertInspectionRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(inspectionRecords)
    .where(
      and(
        eq(inspectionRecords.monthKey, record.monthKey),
        eq(inspectionRecords.region, record.region),
        eq(inspectionRecords.property, record.property)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(inspectionRecords)
      .set({
        checked: record.checked,
        xed: record.xed,
        note: record.note ?? null,
        pdfName: record.pdfName ?? null,
        pdfKey: record.pdfKey ?? null,
        pdfSize: record.pdfSize ?? null,
        pdfUploadedAt: record.pdfUploadedAt ?? null,
      })
      .where(eq(inspectionRecords.id, existing[0].id));
  } else {
    await db.insert(inspectionRecords).values(record);
  }
}

export async function deleteMonthRecords(monthKey: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(inspectionRecords).where(eq(inspectionRecords.monthKey, monthKey));
}

export async function getSavedMonthKeys(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ monthKey: inspectionRecords.monthKey })
    .from(inspectionRecords);
  return rows.map((r) => r.monthKey);
}

export async function deleteAllRecords(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(inspectionRecords);
}

export interface MonthSummary {
  monthKey: string;
  total: number;
  passed: number;   // checked = true
  failed: number;   // xed = true
  pdfs: number;     // pdfKey is not null
  neither: number;  // neither checked nor xed
}

export async function getHistorySummary(): Promise<MonthSummary[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(inspectionRecords);

  // Group by monthKey in JS (avoids complex SQL aggregation)
  const map = new Map<string, MonthSummary>();
  for (const row of rows) {
    if (!map.has(row.monthKey)) {
      map.set(row.monthKey, { monthKey: row.monthKey, total: 0, passed: 0, failed: 0, pdfs: 0, neither: 0 });
    }
    const s = map.get(row.monthKey)!;
    s.total++;
    if (row.checked) s.passed++;
    if (row.xed) s.failed++;
    if (row.pdfKey) s.pdfs++;
    if (!row.checked && !row.xed) s.neither++;
  }

  // Sort descending (newest first)
  return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export interface RepeatOffender {
  property: string;
  region: string;
  consecutiveMonths: number;   // length of the current streak
  totalFailedMonths: number;   // all-time months with xed=true
  months: string[];            // all monthKeys where xed=true, sorted ascending
  streak: string[];            // the current consecutive streak (most recent N months)
}

export async function getRepeatOffenders(minConsecutive = 2): Promise<RepeatOffender[]> {
  const db = await getDb();
  if (!db) return [];

  // Fetch only xed=true rows
  const rows = await db
    .select()
    .from(inspectionRecords)
    .where(eq(inspectionRecords.xed, true));

  // Group by property
  const byPropObj: Record<string, { region: string; months: string[] }> = {};
  for (const row of rows) {
    const key = `${row.region}::${row.property}`;
    if (!byPropObj[key]) byPropObj[key] = { region: row.region, months: [] };
    if (!byPropObj[key].months.includes(row.monthKey)) {
      byPropObj[key].months.push(row.monthKey);
    }
  }

  const offenders: RepeatOffender[] = [];

  for (const [key, { region, months }] of Object.entries(byPropObj)) {
    const property = key.split("::").slice(1).join("::");
    const sortedMonths: string[] = [...months].sort(); // ascending "YYYY-MM"

    // Find the longest consecutive streak ending at the most recent month
    // "Consecutive" means each month is exactly 1 calendar month after the previous
    const isConsecutive = (a: string, b: string) => {
      const [ay, am] = a.split("-").map(Number);
      const [by, bm] = b.split("-").map(Number);
      const aIdx = ay * 12 + am;
      const bIdx = by * 12 + bm;
      return bIdx - aIdx === 1;
    };

    // Walk backwards from the most recent month to find the current streak
    let streak: string[] = [sortedMonths[sortedMonths.length - 1] as string];
    for (let i = sortedMonths.length - 2; i >= 0; i--) {
      if (isConsecutive(sortedMonths[i], streak[0])) {
        streak.unshift(sortedMonths[i]);
      } else {
        break;
      }
    }

    if (streak.length >= minConsecutive) {
      offenders.push({
        property,
        region,
        consecutiveMonths: streak.length,
        totalFailedMonths: sortedMonths.length,
        months: sortedMonths,
        streak,
      });
    }
  }

  // Sort by streak length desc, then total desc
  offenders.sort((a, b) =>
    b.consecutiveMonths !== a.consecutiveMonths
      ? b.consecutiveMonths - a.consecutiveMonths
      : b.totalFailedMonths - a.totalFailedMonths
  );

  return offenders;
}
