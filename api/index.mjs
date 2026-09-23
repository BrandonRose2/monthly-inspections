// server/vercel-entry.ts
import express2 from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";

// shared/properties.ts
var REGIONS = [
  { name: "Region 1", properties: ["Boca Ciega", "Coral Village", "Cumberland Apts", "Holiday Apts", "Jefferson Arms Apts", "Macedonia Garden Apts", "Opa Lock 135th St Apts", "Silver Springs", "Thomasville", "Walnut Hill"] },
  { name: "Region 2", properties: ["Breckenridge Village", "Crossroads", "Grace Townhomes", "Grove Park Terrace", "La Promesa", "Lexington", "River Pointe"] },
  { name: "Region 3", properties: ["Arbor Crest", "Bayou Pointe", "The Gates on Manhattan", "Howell Place", "Marrero 3", "North Pointe", "Pelican Bay", "Pirates Bend", "Ruby Diamond", "St. Charles", "Star Homes", "Thibodaux Colonial Estates", "Windsor / Yorkshire"] },
  { name: "Region 4", properties: ["Anaheim Apts", "Central Apts / Urban Rehab", "Columbia Village Apts", "Fairfax", "Forest View", "Granite Ridge", "Midtown Manor", "New Wilmington Arms", "Oak Hills", "Pacific Pointe Apts", "River Garden"] }
];
var TOTAL_PROPERTIES = REGIONS.reduce((n, r) => n + r.properties.length, 0);
var NOT_ON_MYLONEWORKERS = ["Fairfax", "Central Apts / Urban Rehab"];
var LEGACY_PROPERTY_NAMES = {
  "Jefferson": "Jefferson Arms Apts",
  "Macedonia": "Macedonia Garden Apts",
  "Opa Locka": "Opa Lock 135th St Apts",
  "Breckenridge": "Breckenridge Village",
  "Cumberland": "Cumberland Apts",
  "Grove Park": "Grove Park Terrace",
  "Holiday": "Holiday Apts",
  "Gates of Manhattan": "The Gates on Manhattan",
  "Marrero": "Marrero 3",
  "Star": "Star Homes",
  "Thibodaux": "Thibodaux Colonial Estates",
  "Anaheim Gardens": "Anaheim Apts",
  "Columbia": "Columbia Village Apts",
  "Midtown": "Midtown Manor",
  "Pacific": "Pacific Pointe Apts",
  "Urban": "Central Apts / Urban Rehab",
  "Wilmington": "New Wilmington Arms"
};
var REGIONAL_MANAGERS = {
  "Region 1": { regionalManager: "JR Rolon", regionalEmail: "jrrolon@apartmentcorp.com" },
  "Region 2": { regionalManager: "Leslie Rolon", regionalEmail: "leslie@apartmentcorp.com" },
  "Region 3": { regionalManager: "Ginger Positerry", regionalEmail: "ginger@apartmentcorp.com" },
  "Region 4": { regionalManager: "Blake Weddington", regionalEmail: "blake@apartmentcorp.com" }
};
var regionOfProperty = (property) => {
  const r = REGIONS.find((x) => x.properties.includes(property));
  if (!r) throw new Error(`Contact for unknown property: ${property}`);
  return r.name;
};
var c = (property, manager, email, ext) => {
  const region = regionOfProperty(property);
  return { property, manager, email, ext, region, ...REGIONAL_MANAGERS[region] };
};
var CONTACTS = [
  c("Arbor Crest", "Erica Finch", "arborcrest@apartmentcorp.com", "261"),
  c("Boca Ciega", "Katrina Weekly", "katrina@apartmentcorp.com", "216"),
  c("Coral Village", "Keyla Maranon", "coralvillage@apartmentcorp.com", "251"),
  c("Jefferson Arms Apts", "Brandy Amador", "jefferson@apartmentcorp.com", "236"),
  c("Macedonia Garden Apts", "Erika Scales", "macedonia@apartmentcorp.com", "222"),
  c("Opa Lock 135th St Apts", "Rosa Villarroel", "opa@apartmentcorp.com", "221"),
  c("River Pointe", "Stephanie Delong", "stephanie@apartmentcorp.com", "224"),
  c("Silver Springs", "Tarshia Pierce", "silversprings@apartmentcorp.com", "245"),
  c("Thomasville", "Adrienne McCall", "thomasville@apartmentcorp.com", "295"),
  c("Breckenridge Village", "", "lexingtonasst@apartmentcorp.com", "238"),
  c("Crossroads", "Jennifer Parks", "crossroads@apartmentcorp.com", "273"),
  c("Cumberland Apts", "Kiara Brown", "cumberland@apartmentcorp.com", "219"),
  c("Grace Townhomes", "Susan Lopez", "susan@apartmentcorp.com", "227"),
  c("Grove Park Terrace", "Nikki Moreno", "grovepark@apartmentcorp.com", "265"),
  c("Holiday Apts", "Arlene Vinson", "holiday@apartmentcorp.com", "235"),
  c("La Promesa", "Ashley Clay", "lapromesa@apartmentcorp.com", "269"),
  c("Lexington", "", "lexingtonasst@apartmentcorp.com", "239"),
  c("Walnut Hill", "Johann Armstead", "walnut@apartmentcorp.com", "267"),
  c("Bayou Pointe", "Ada Vu", "bayou@apartmentcorp.com", "298"),
  c("The Gates on Manhattan", "Lindgret Celestine", "lindgret@apartmentcorp.com", "284"),
  c("Howell Place", "Valencia Patterson", "howell@apartmentcorp.com", "259"),
  c("Marrero 3", "Ketorah Parks", "rubystarmanager@apartmentcorp.com", "283"),
  c("North Pointe", "Johann Armstead", "northpointe@apartmentcorp.com", "297"),
  c("Pelican Bay", "Dequanta Sutherland", "pelican@apartmentcorp.com", "257"),
  c("Pirates Bend", "Valencia Patterson", "pirates@apartmentcorp.com", "260"),
  c("Ruby Diamond", "Ketorah Parks", "rubystarmanager@apartmentcorp.com", "286"),
  c("St. Charles", "Deon Tolliver", "stcharles@apartmentcorp.com", "255"),
  c("Star Homes", "Ketorah Parks", "rubystarmanager@apartmentcorp.com", "286"),
  c("Thibodaux Colonial Estates", "Susie Rogers", "colonialleasing@apartmentcorp.com", "228/229"),
  c("Windsor / Yorkshire", "Kimberly Powell", "windsor@apartmentcorp.com", "291"),
  c("Anaheim Apts", "Priscilla Walters", "priscilla@apartmentcorp.com", "212"),
  c("Columbia Village Apts", "Tammy Davis", "tammy@apartmentcorp.com", "275"),
  c("Fairfax", "Shraga Kurs", "", ""),
  c("Forest View", "Tammy / Heather", "tammy@apartmentcorp.com", "277"),
  c("Granite Ridge", "James Abeyta", "james@apartmentcorp.com", "242"),
  c("Midtown Manor", "Steve Rand", "", ""),
  c("Oak Hills", "Heather Hein", "heatherh@apartmentcorp.com", "279"),
  c("Pacific Pointe Apts", "Hailey Huber", "pacificpointe@apartmentcorp.com", "243"),
  c("River Garden", "Heather Snyder", "rivergarden@apartmentcorp.com", "252"),
  c("Central Apts / Urban Rehab", "Amunique Cannon", "", ""),
  c("New Wilmington Arms", "Jose Gomez", "wilmington@apartmentcorp.com", "211")
];
var CONTACT_BY_PROPERTY = Object.fromEntries(CONTACTS.map((x) => [x.property, x]));
var REMINDER_CC = ["mam@22.bz", "Robert@ApartmentCorp.com", "Todd@menowitz.com", "Ethan@apartmentcorp.com"];
var REGIONAL_OVERRIDES = {
  "Region 1": { regionalManager: "JR Rolon", greeting: "JR & Leslie", to: "jrrolon@apartmentcorp.com", cc: ["leslie@apartmentcorp.com", ...REMINDER_CC] }
};
var DEFAULT_NAMING = {
  runTemplate: "Scraper Run \u2014 {start} to {end}",
  summaryPdfTemplate: "Inspection-Summary-{month}",
  comparePdfTemplate: "Comparison-{previous}-vs-{month}"
};
var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function monthLabelOf(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return Number.isFinite(y) && m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : monthKey;
}
function applyNamingTemplate(template, values, fallback = DEFAULT_NAMING.runTemplate) {
  const map = {
    "{month}": values.month,
    "{previous}": values.previous,
    "{start}": values.start,
    "{end}": values.end,
    "{count}": String(values.count)
  };
  return Object.entries(map).reduce((s, [k, v]) => s.split(k).join(v), template.trim() || fallback);
}
function monthRange(startKey, endKey) {
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  const out = [];
  for (let y = sy, m = sm; y * 12 + m <= ey * 12 + em; m === 12 ? (y++, m = 1) : m++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (out.length > 120) break;
  }
  return out;
}

// server/routers.ts
import { z as z2 } from "zod";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);
var machineProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    const expected = process.env.INGEST_TOKEN;
    if (!expected) {
      throw new TRPCError2({
        code: "INTERNAL_SERVER_ERROR",
        message: "INGEST_TOKEN is not configured on the server"
      });
    }
    const ok = isValidIngestToken(ctx.req.headers.authorization, expected);
    if (!ok) {
      throw new TRPCError2({ code: "UNAUTHORIZED", message: "Invalid ingest token" });
    }
    return next({ ctx });
  })
);
function isValidIngestToken(header, expected = process.env.INGEST_TOKEN ?? "") {
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : "";
  return expected.length > 0 && presented.length === expected.length && presented.split("").reduce((acc, ch, i) => acc | ch.charCodeAt(0) ^ expected.charCodeAt(i), 0) === 0;
}

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/db.ts
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

// drizzle/schema.ts
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from "drizzle-orm/pg-core";
var roleEnum = pgEnum("role", ["user", "admin"]);
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Postgres has no ON UPDATE clause; Drizzle applies this in the driver.
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => /* @__PURE__ */ new Date()),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var inspectionRecords = pgTable("inspection_records", {
  id: serial("id").primaryKey(),
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  // "YYYY-MM"
  region: varchar("region", { length: 64 }).notNull(),
  property: varchar("property", { length: 128 }).notNull(),
  checked: boolean("checked").default(false).notNull(),
  xed: boolean("xed").default(false).notNull(),
  note: text("note"),
  pdfName: varchar("pdfName", { length: 255 }),
  pdfKey: varchar("pdfKey", { length: 512 }),
  // object storage key
  pdfSize: integer("pdfSize"),
  pdfUploadedAt: varchar("pdfUploadedAt", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => /* @__PURE__ */ new Date())
});
var scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 255 }).notNull(),
  kind: varchar("kind", { length: 16 }).default("range").notNull(),
  // range | test | scheduled
  status: varchar("status", { length: 32 }).default("queued").notNull(),
  // queued | running | completed | completed_with_errors | failed
  startMonthKey: varchar("startMonthKey", { length: 7 }).notNull(),
  endMonthKey: varchar("endMonthKey", { length: 7 }).notNull(),
  properties: text("properties"),
  // JSON array for test runs; null = all
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => /* @__PURE__ */ new Date())
});
var appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => /* @__PURE__ */ new Date())
});
var scrapeRunLog = pgTable("scrape_run_log", {
  id: serial("id").primaryKey(),
  runId: integer("runId").notNull(),
  line: text("line").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getMonthRecords(monthKey) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inspectionRecords).where(eq(inspectionRecords.monthKey, monthKey));
}
async function upsertInspectionRecord(record) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(inspectionRecords).where(
    and(
      eq(inspectionRecords.monthKey, record.monthKey),
      eq(inspectionRecords.region, record.region),
      eq(inspectionRecords.property, record.property)
    )
  ).limit(1);
  if (existing.length > 0) {
    await db.update(inspectionRecords).set({
      checked: record.checked,
      xed: record.xed,
      note: record.note ?? null,
      pdfName: record.pdfName ?? null,
      pdfKey: record.pdfKey ?? null,
      pdfSize: record.pdfSize ?? null,
      pdfUploadedAt: record.pdfUploadedAt ?? null
    }).where(eq(inspectionRecords.id, existing[0].id));
  } else {
    await db.insert(inspectionRecords).values(record);
  }
}
async function setInspectionResult(record) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(inspectionRecords).where(
    and(
      eq(inspectionRecords.monthKey, record.monthKey),
      eq(inspectionRecords.region, record.region),
      eq(inspectionRecords.property, record.property)
    )
  ).limit(1);
  const status = { checked: record.checked, xed: record.xed, note: record.note };
  const pdf = record.pdf ? { pdfName: record.pdf.name, pdfKey: record.pdf.key, pdfSize: record.pdf.size, pdfUploadedAt: record.pdf.uploadedAt } : {};
  if (existing.length > 0) {
    await db.update(inspectionRecords).set({ ...status, ...pdf }).where(eq(inspectionRecords.id, existing[0].id));
  } else {
    await db.insert(inspectionRecords).values({
      monthKey: record.monthKey,
      region: record.region,
      property: record.property,
      ...status,
      ...pdf
    });
  }
}
async function deleteMonthRecords(monthKey) {
  const db = await getDb();
  if (!db) return;
  await db.delete(inspectionRecords).where(eq(inspectionRecords.monthKey, monthKey));
}
async function getSavedMonthKeys() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.selectDistinct({ monthKey: inspectionRecords.monthKey }).from(inspectionRecords);
  return rows.map((r) => r.monthKey);
}
async function deleteAllRecords() {
  const db = await getDb();
  if (!db) return;
  await db.delete(inspectionRecords);
}
async function getHistorySummary() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(inspectionRecords);
  const map = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (!map.has(row.monthKey)) {
      map.set(row.monthKey, { monthKey: row.monthKey, total: 0, passed: 0, failed: 0, pdfs: 0, neither: 0 });
    }
    const s = map.get(row.monthKey);
    s.total++;
    if (row.checked) s.passed++;
    if (row.xed) s.failed++;
    if (row.pdfKey) s.pdfs++;
    if (!row.checked && !row.xed) s.neither++;
  }
  return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}
async function getRepeatOffenders(minConsecutive = 2) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(inspectionRecords).where(eq(inspectionRecords.xed, true));
  const byPropObj = {};
  for (const row of rows) {
    const key = `${row.region}::${row.property}`;
    if (!byPropObj[key]) byPropObj[key] = { region: row.region, months: [] };
    if (!byPropObj[key].months.includes(row.monthKey)) {
      byPropObj[key].months.push(row.monthKey);
    }
  }
  const offenders = [];
  for (const [key, { region, months }] of Object.entries(byPropObj)) {
    const property = key.split("::").slice(1).join("::");
    const sortedMonths = [...months].sort();
    const isConsecutive = (a, b) => {
      const [ay, am] = a.split("-").map(Number);
      const [by, bm] = b.split("-").map(Number);
      const aIdx = ay * 12 + am;
      const bIdx = by * 12 + bm;
      return bIdx - aIdx === 1;
    };
    let streak = [sortedMonths[sortedMonths.length - 1]];
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
        streak
      });
    }
  }
  offenders.sort(
    (a, b) => b.consecutiveMonths !== a.consecutiveMonths ? b.consecutiveMonths - a.consecutiveMonths : b.totalFailedMonths - a.totalFailedMonths
  );
  return offenders;
}
async function createRun(run) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(scrapeRuns).values({
    label: run.label,
    kind: run.kind,
    status: run.status ?? "queued",
    startMonthKey: run.startMonthKey,
    endMonthKey: run.endMonthKey,
    totalMonths: run.totalMonths,
    properties: run.properties?.length ? JSON.stringify(run.properties) : null
  }).returning();
  return row;
}
async function updateRun(id, patch) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.update(scrapeRuns).set(patch).where(eq(scrapeRuns.id, id)).returning();
  return row;
}
async function getRun(id) {
  const db = await getDb();
  if (!db) return void 0;
  const [row] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, id)).limit(1);
  return row;
}
async function listRuns(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scrapeRuns).orderBy(desc(scrapeRuns.startedAt)).limit(limit);
}
async function listSavedRuns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scrapeRuns).where(inArray(scrapeRuns.status, ["completed", "completed_with_errors"])).orderBy(desc(scrapeRuns.startedAt));
}
async function deleteRun(id) {
  const db = await getDb();
  if (!db) return;
  await db.delete(scrapeRunLog).where(eq(scrapeRunLog.runId, id));
  await db.delete(scrapeRuns).where(eq(scrapeRuns.id, id));
}
async function appendRunLog(runId, lines) {
  const db = await getDb();
  if (!db || !lines.length) return;
  await db.insert(scrapeRunLog).values(lines.map((line) => ({ runId, line })));
}
async function getRunLog(runId, afterId = 0, limit = 1e3) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: scrapeRunLog.id, line: scrapeRunLog.line }).from(scrapeRunLog).where(and(eq(scrapeRunLog.runId, runId), gt(scrapeRunLog.id, afterId))).orderBy(asc(scrapeRunLog.id)).limit(limit);
}
async function getSetting(key) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}
async function setSetting(key, value) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const json = JSON.stringify(value);
  await db.insert(appSettings).values({ key, value: json }).onConflictDoUpdate({ target: appSettings.key, set: { value: json, updatedAt: /* @__PURE__ */ new Date() } });
}

// server/github.ts
var GITHUB_DEFAULTS = {
  repository: "BrandonRose2/monthly-inspections",
  workflow: "scrape-inspections.yml",
  ref: "main"
};
var DispatchError = class extends Error {
};
async function dispatchScrape(inputs, fetchImpl = fetch) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new DispatchError(
      "The portal can't start the scraper yet: GITHUB_TOKEN is not set on Railway. Add a GitHub token with Actions read/write access to this repo."
    );
  }
  const repo = process.env.GITHUB_REPOSITORY || GITHUB_DEFAULTS.repository;
  const workflow = process.env.GITHUB_WORKFLOW_FILE || GITHUB_DEFAULTS.workflow;
  const ref = process.env.GITHUB_WORKFLOW_REF || GITHUB_DEFAULTS.ref;
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "monthly-inspections-portal"
    },
    body: JSON.stringify({
      ref,
      inputs: {
        run_id: String(inputs.runId),
        start_month: inputs.startMonthKey,
        end_month: inputs.endMonthKey,
        only: (inputs.only ?? []).join(","),
        dry_run: false
      }
    })
  });
  if (!res.ok) {
    const text2 = await res.text().catch(() => "");
    const hint = res.status === 401 ? " (the token is invalid or expired)" : res.status === 403 || res.status === 404 ? " (the token needs Actions read/write access to " + repo + ")" : res.status === 422 ? " (the workflow on GitHub is missing the run_id/start_month/end_month inputs \u2014 push the updated workflow file)" : "";
    throw new DispatchError(`GitHub refused to start the scraper: ${res.status}${hint}. ${text2.slice(0, 200)}`.trim());
  }
}

// server/storage.ts
import { randomBytes } from "crypto";
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
var FILES_ROUTE = "/files";
function bucketConfigured() {
  return !!process.env.BUCKET;
}
var _s3 = null;
async function s3() {
  if (_s3) return _s3;
  const { S3Client } = await import("@aws-sdk/client-s3");
  const missing = ["BUCKET_ENDPOINT", "BUCKET_ACCESS_KEY_ID", "BUCKET_SECRET_ACCESS_KEY"].filter(
    (k) => !process.env[k]
  );
  if (missing.length) throw new Error(`Storage config missing: ${missing.join(", ")}`);
  _s3 = new S3Client({
    endpoint: process.env.BUCKET_ENDPOINT,
    region: process.env.BUCKET_REGION || "auto",
    forcePathStyle: process.env.BUCKET_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.BUCKET_ACCESS_KEY_ID,
      secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY
    }
  });
  return _s3;
}
function withSuffix(key) {
  const suffix = randomBytes(12).toString("hex");
  const dot = key.lastIndexOf(".");
  const slash = key.lastIndexOf("/");
  return dot > slash ? `${key.slice(0, dot)}-${suffix}${key.slice(dot)}` : `${key}-${suffix}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const pathname = normalizeKey(relKey);
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (bucketConfigured()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const key = withSuffix(pathname);
    await (await s3()).send(
      new PutObjectCommand({ Bucket: process.env.BUCKET, Key: key, Body: body, ContentType: contentType })
    );
    const url = `${FILES_ROUTE}/${key}`;
    return { key: url, url };
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const result = await put(pathname, body, { access: "public", contentType, addRandomSuffix: true });
    return { key: result.url, url: result.url };
  }
  throw new Error(
    "Storage config missing: set BUCKET (Railway bucket) or BLOB_READ_WRITE_TOKEN (Vercel Blob)"
  );
}
async function storageRead(key) {
  if (!bucketConfigured()) return null;
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const out = await (await s3()).send(
      new GetObjectCommand({ Bucket: process.env.BUCKET, Key: normalizeKey(key) })
    );
    return {
      body: out.Body,
      contentType: out.ContentType,
      contentLength: out.ContentLength
    };
  } catch (err) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

// server/routers.ts
var monthKeySchema = z2.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
function currentMonthKey(now = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
}
function previousMonthKey(key) {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
var STALE_AFTER_MS = 90 * 60 * 1e3;
function withStaleStatus(run, now = Date.now()) {
  const active = run.status === "queued" || run.status === "running";
  return active && now - new Date(run.updatedAt).getTime() > STALE_AFTER_MS ? { ...run, status: "stalled" } : run;
}
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  inspections: router({
    getMonth: publicProcedure.input(z2.object({ monthKey: z2.string().regex(/^\d{4}-\d{2}$/) })).query(async ({ input }) => {
      return getMonthRecords(input.monthKey);
    }),
    getHistory: publicProcedure.query(async () => {
      return getHistorySummary();
    }),
    getRepeatOffenders: publicProcedure.query(async () => {
      return getRepeatOffenders(2);
    }),
    getSavedMonths: publicProcedure.query(async () => {
      return getSavedMonthKeys();
    }),
    upsertRecord: publicProcedure.input(
      z2.object({
        monthKey: z2.string().regex(/^\d{4}-\d{2}$/),
        region: z2.string(),
        property: z2.string(),
        checked: z2.boolean(),
        xed: z2.boolean(),
        note: z2.string().optional(),
        pdfName: z2.string().optional(),
        pdfKey: z2.string().optional(),
        pdfSize: z2.number().optional(),
        pdfUploadedAt: z2.string().optional()
      })
    ).mutation(async ({ input }) => {
      await upsertInspectionRecord(input);
      return { success: true };
    }),
    resetMonth: publicProcedure.input(z2.object({ monthKey: z2.string().regex(/^\d{4}-\d{2}$/) })).mutation(async ({ input }) => {
      await deleteMonthRecords(input.monthKey);
      return { success: true };
    }),
    resetAllData: publicProcedure.mutation(async () => {
      await deleteAllRecords();
      return { success: true };
    }),
    // Automated ingest for the inspections scraper: stores the PDF and attaches
    // it to the property's record for that month in a single authenticated call.
    // Requires a bearer token (INGEST_TOKEN), unlike the UI's public procedures.
    ingestInspectionPdf: machineProcedure.input(
      z2.object({
        monthKey: z2.string().regex(/^\d{4}-\d{2}$/),
        region: z2.string(),
        property: z2.string(),
        fileName: z2.string(),
        fileBase64: z2.string(),
        fileSize: z2.number(),
        checked: z2.boolean().default(true),
        note: z2.string().optional()
      })
    ).mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const safeProperty = input.property.replace(/[^a-zA-Z0-9]/g, "_");
      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `inspections/${input.monthKey}/${safeProperty}/${Date.now()}_${safeFileName}`;
      const { url } = await storagePut(key, buffer, "application/pdf");
      await upsertInspectionRecord({
        monthKey: input.monthKey,
        region: input.region,
        property: input.property,
        checked: input.checked,
        xed: false,
        note: input.note ?? null,
        pdfName: input.fileName,
        pdfKey: url,
        pdfSize: input.fileSize,
        pdfUploadedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return { success: true, url };
    }),
    // Automated result from the inspections scraper: pass/fail, the reason, and
    // (when the property had unit scans) a generated PDF report. Keeps any
    // existing PDF when none is sent.
    ingestInspectionResult: machineProcedure.input(
      z2.object({
        monthKey: z2.string().regex(/^\d{4}-\d{2}$/),
        region: z2.string(),
        property: z2.string(),
        checked: z2.boolean(),
        xed: z2.boolean(),
        note: z2.string().max(2e3),
        fileName: z2.string().optional(),
        fileBase64: z2.string().optional(),
        fileSize: z2.number().optional(),
        // A PDF already stored via POST /api/ingest/pdf (used for large reports).
        pdfUrl: z2.string().max(512).optional()
      })
    ).mutation(async ({ input }) => {
      let pdf = null;
      if (input.pdfUrl && input.fileName) {
        if (!input.pdfUrl.startsWith(`${FILES_ROUTE}/inspections/`) && !/^https:\/\/[^/]+\/inspections\//.test(input.pdfUrl)) {
          throw new TRPCError3({ code: "BAD_REQUEST", message: "pdfUrl must come from /api/ingest/pdf" });
        }
        pdf = { name: input.fileName, key: input.pdfUrl, size: input.fileSize ?? 0, uploadedAt: (/* @__PURE__ */ new Date()).toISOString() };
      } else if (input.fileBase64 && input.fileName) {
        const buffer = Buffer.from(input.fileBase64, "base64");
        if (buffer.subarray(0, 4).toString() !== "%PDF") {
          throw new Error("fileBase64 is not a PDF");
        }
        const safeProperty = input.property.replace(/[^a-zA-Z0-9]/g, "_");
        const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `inspections/${input.monthKey}/${safeProperty}/${Date.now()}_${safeFileName}`;
        const { url } = await storagePut(key, buffer, "application/pdf");
        pdf = { name: input.fileName, key: url, size: input.fileSize ?? buffer.length, uploadedAt: (/* @__PURE__ */ new Date()).toISOString() };
      }
      await setInspectionResult({
        monthKey: input.monthKey,
        region: input.region,
        property: input.property,
        checked: input.checked,
        xed: input.xed,
        note: input.note,
        pdf
      });
      return { success: true, pdfUrl: pdf?.key ?? null };
    }),
    uploadPdf: publicProcedure.input(
      z2.object({
        monthKey: z2.string(),
        region: z2.string(),
        property: z2.string(),
        fileName: z2.string(),
        fileBase64: z2.string(),
        fileSize: z2.number()
      })
    ).mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const safeProperty = input.property.replace(/[^a-zA-Z0-9]/g, "_");
      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `inspections/${input.monthKey}/${safeProperty}/${Date.now()}_${safeFileName}`;
      const { url } = await storagePut(key, buffer, "application/pdf");
      return { key: url, url };
    }),
    // Import a full backup JSON — uploads PDFs to S3 and saves all records to DB
    importBackup: publicProcedure.input(
      z2.object({
        months: z2.record(
          z2.string(),
          // monthKey "YYYY-MM"
          z2.record(
            z2.string(),
            // "Region X::Property Name"
            z2.object({
              checked: z2.boolean().optional(),
              xed: z2.boolean().optional(),
              note: z2.string().optional().nullable(),
              pdf: z2.object({
                name: z2.string(),
                dataUrl: z2.string(),
                size: z2.number(),
                uploadedAt: z2.string()
              }).optional().nullable()
            })
          )
        )
      })
    ).mutation(async ({ input }) => {
      let imported = 0;
      let pdfUploaded = 0;
      for (const [monthKey, entries] of Object.entries(input.months)) {
        for (const [compositeKey, status] of Object.entries(entries)) {
          const [region, ...propParts] = compositeKey.split("::");
          const property = propParts.join("::");
          if (!region || !property) continue;
          let pdfKey;
          let pdfName;
          let pdfSize;
          let pdfUploadedAt;
          if (status.pdf?.dataUrl?.startsWith("data:")) {
            try {
              const base64 = status.pdf.dataUrl.split(",")[1];
              if (base64) {
                const buffer = Buffer.from(base64, "base64");
                const safeProperty = property.replace(/[^a-zA-Z0-9]/g, "_");
                const safeFileName = status.pdf.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                const key = `inspections/${monthKey}/${safeProperty}/${Date.now()}_${safeFileName}`;
                const { url } = await storagePut(key, buffer, "application/pdf");
                pdfKey = url;
                pdfName = status.pdf.name;
                pdfSize = status.pdf.size;
                pdfUploadedAt = status.pdf.uploadedAt;
                pdfUploaded++;
              }
            } catch (e) {
              console.error(`Failed to upload PDF for ${property}:`, e);
            }
          } else if (status.pdf?.dataUrl) {
            pdfKey = status.pdf.dataUrl;
            pdfName = status.pdf.name;
            pdfSize = status.pdf.size;
            pdfUploadedAt = status.pdf.uploadedAt;
          }
          await upsertInspectionRecord({
            monthKey,
            region,
            property,
            checked: status.checked ?? false,
            xed: status.xed ?? false,
            note: status.note ?? void 0,
            pdfName,
            pdfKey,
            pdfSize,
            pdfUploadedAt
          });
          imported++;
        }
      }
      return { success: true, imported, pdfUploaded };
    })
  }),
  settings: router({
    naming: publicProcedure.query(async () => ({ ...DEFAULT_NAMING, ...await getSetting("naming") ?? {} })),
    setNaming: publicProcedure.input(z2.object({
      runTemplate: z2.string().trim().min(1).max(200),
      summaryPdfTemplate: z2.string().trim().min(1).max(200),
      comparePdfTemplate: z2.string().trim().min(1).max(200)
    })).mutation(async ({ input }) => {
      await setSetting("naming", input);
      return input;
    })
  }),
  scraper: router({
    // Latest runs for the Scrape Activity panel.
    activity: publicProcedure.query(async () => (await listRuns(20)).map((r) => withStaleStatus(r))),
    // Finished runs, for the Saved Runs list.
    savedRuns: publicProcedure.query(async () => listSavedRuns()),
    start: publicProcedure.input(z2.object({
      startMonthKey: monthKeySchema,
      endMonthKey: monthKeySchema,
      properties: z2.array(z2.string()).max(60).optional()
    })).mutation(async ({ input }) => {
      const months = monthRange(input.startMonthKey, input.endMonthKey);
      if (!months.length) throw new TRPCError3({ code: "BAD_REQUEST", message: "End month must be on or after the start month." });
      if (months.length > 36) throw new TRPCError3({ code: "BAD_REQUEST", message: "Pick 36 months or fewer." });
      if (input.endMonthKey > currentMonthKey()) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "The range can't include future months." });
      }
      const known = new Set(REGIONS.flatMap((r) => r.properties));
      const properties = input.properties?.length ? Array.from(new Set(input.properties)) : null;
      for (const p of properties ?? []) {
        if (!known.has(p)) throw new TRPCError3({ code: "BAD_REQUEST", message: `Unknown property: ${p}` });
        if (NOT_ON_MYLONEWORKERS.includes(p)) throw new TRPCError3({ code: "BAD_REQUEST", message: `${p} is not connected to MyLoneWorkers.` });
      }
      const active = (await listRuns(10)).map((r) => withStaleStatus(r)).find((r) => r.status === "queued" || r.status === "running");
      if (active) throw new TRPCError3({ code: "CONFLICT", message: `"${active.label}" is still ${active.status}. Wait for it to finish before starting another.` });
      const naming = { ...DEFAULT_NAMING, ...await getSetting("naming") ?? {} };
      const label = properties ? `Test scrape \u2014 ${properties.join(" & ")}` : applyNamingTemplate(naming.runTemplate, {
        month: monthLabelOf(input.endMonthKey),
        previous: monthLabelOf(previousMonthKey(input.startMonthKey)),
        start: monthLabelOf(input.startMonthKey),
        end: monthLabelOf(input.endMonthKey),
        count: months.length
      });
      const run = await createRun({
        label: label.slice(0, 255),
        kind: properties ? "test" : "range",
        startMonthKey: input.startMonthKey,
        endMonthKey: input.endMonthKey,
        totalMonths: months.length,
        properties,
        status: "queued"
      });
      try {
        await dispatchScrape({ runId: run.id, startMonthKey: input.startMonthKey, endMonthKey: input.endMonthKey, only: properties ?? void 0 });
      } catch (err) {
        const message = err instanceof DispatchError ? err.message : `Could not reach GitHub: ${err.message}`;
        await updateRun(run.id, { status: "failed", errorMessage: message, completedAt: /* @__PURE__ */ new Date() });
        await appendRunLog(run.id, [`\u274C ${message}`]);
        throw new TRPCError3({ code: "PRECONDITION_FAILED", message });
      }
      await appendRunLog(run.id, [`\u{1F680} Started "${run.label}"`, "\u23F3 Waiting for the Mac runner to pick up the job\u2026"]);
      return await updateRun(run.id, { progressMessage: "Waiting for the Mac runner to pick up the job\u2026" }) ?? run;
    }),
    rename: publicProcedure.input(z2.object({ id: z2.number().int(), label: z2.string().trim().min(1).max(255) })).mutation(async ({ input }) => updateRun(input.id, { label: input.label })),
    remove: publicProcedure.input(z2.object({ id: z2.number().int() })).mutation(async ({ input }) => {
      await deleteRun(input.id);
      return { success: true };
    }),
    // Called by the scraper when it starts. Portal-started runs pass their
    // runId; scheduled runs get a new row.
    begin: machineProcedure.input(z2.object({
      runId: z2.number().int().optional(),
      startMonthKey: monthKeySchema,
      endMonthKey: monthKeySchema,
      properties: z2.array(z2.string()).optional(),
      githubRunUrl: z2.string().max(512).optional()
    })).mutation(async ({ input }) => {
      const totalMonths = monthRange(input.startMonthKey, input.endMonthKey).length;
      const existing = input.runId ? await getRun(input.runId) : void 0;
      const run = existing ? await updateRun(existing.id, { status: "running", githubRunUrl: input.githubRunUrl ?? null, progressMessage: "Signing in to MyLoneWorkers\u2026", errorMessage: null }) : await createRun({
        label: input.properties?.length ? `Test scrape \u2014 ${input.properties.join(" & ")}` : `Scheduled run \u2014 ${monthLabelOf(input.startMonthKey)}${totalMonths > 1 ? ` to ${monthLabelOf(input.endMonthKey)}` : ""}`,
        kind: input.properties?.length ? "test" : "scheduled",
        startMonthKey: input.startMonthKey,
        endMonthKey: input.endMonthKey,
        totalMonths,
        properties: input.properties,
        status: "running"
      }).then((r) => input.githubRunUrl ? updateRun(r.id, { githubRunUrl: input.githubRunUrl }) : r);
      if (!run) throw new TRPCError3({ code: "NOT_FOUND", message: "Run not found" });
      return { id: run.id };
    }),
    progress: machineProcedure.input(z2.object({
      id: z2.number().int(),
      status: z2.enum(["running", "completed", "completed_with_errors", "failed"]).optional(),
      completedMonths: z2.number().int().min(0).optional(),
      currentMonthKey: monthKeySchema.nullable().optional(),
      currentProperty: z2.string().max(128).nullable().optional(),
      progressMessage: z2.string().max(2e3).nullable().optional(),
      passed: z2.number().int().min(0).optional(),
      failed: z2.number().int().min(0).optional(),
      total: z2.number().int().min(0).optional(),
      pdfs: z2.number().int().min(0).optional(),
      errorMessage: z2.string().max(4e3).nullable().optional(),
      // Console lines for the live log view, appended in order.
      log: z2.array(z2.string().max(1e3)).max(500).optional()
    })).mutation(async ({ input }) => {
      const { id, log, ...patch } = input;
      const done = patch.status && patch.status !== "running";
      const run = await updateRun(id, { ...patch, ...done ? { completedAt: /* @__PURE__ */ new Date() } : {} });
      if (!run) throw new TRPCError3({ code: "NOT_FOUND", message: "Run not found" });
      if (log?.length) await appendRunLog(id, log);
      return { success: true };
    }),
    // The live console for one run; poll with the last id you have.
    log: publicProcedure.input(z2.object({ runId: z2.number().int(), afterId: z2.number().int().min(0).default(0) })).query(async ({ input }) => {
      const [run, lines] = await Promise.all([getRun(input.runId), getRunLog(input.runId, input.afterId)]);
      return { run: run ? withStaleStatus(run) : null, lines };
    })
  })
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get(`${FILES_ROUTE}/*`, async (req, res) => {
    const key = req.params[0];
    if (!key || key.includes("..")) {
      res.status(400).send("Bad file key");
      return;
    }
    try {
      const obj = await storageRead(key);
      if (!obj) {
        res.status(404).send("File not found");
        return;
      }
      res.setHeader("Content-Type", obj.contentType || "application/octet-stream");
      if (obj.contentLength) res.setHeader("Content-Length", String(obj.contentLength));
      res.setHeader("Content-Disposition", `inline; filename="${key.split("/").pop()}"`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      obj.body.on("error", () => res.destroy());
      obj.body.pipe(res);
    } catch (err) {
      console.error("[StorageProxy] read failed:", err);
      res.status(502).send("Could not read file from storage");
    }
  });
  app2.get("/manus-storage/*", (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    console.warn(`[StorageProxy] legacy Forge key requested: ${key}`);
    res.status(410).send(
      "This file was stored by the Manus Forge backend, which is no longer configured. Re-upload the PDF to store it again."
    );
  });
}

// server/_core/ingestUpload.ts
import express from "express";
var INGEST_PDF_ROUTE = "/api/ingest/pdf";
var MAX_INGEST_PDF_BYTES = 300 * 1024 * 1024;
function registerIngestUpload(app2) {
  app2.post(
    INGEST_PDF_ROUTE,
    (req, res, next) => {
      if (!process.env.INGEST_TOKEN) return res.status(500).json({ error: "INGEST_TOKEN is not configured on the server" });
      if (!isValidIngestToken(req.headers.authorization)) return res.status(401).json({ error: "Invalid ingest token" });
      next();
    },
    express.raw({ type: "application/pdf", limit: MAX_INGEST_PDF_BYTES }),
    async (req, res) => {
      const monthKey = String(req.query.monthKey ?? "");
      const property = String(req.query.property ?? "");
      const fileName = String(req.query.fileName ?? "");
      if (!/^\d{4}-\d{2}$/.test(monthKey) || !property || !fileName) {
        return res.status(400).json({ error: "monthKey, property and fileName are required" });
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.subarray(0, 4).toString() !== "%PDF") {
        return res.status(400).json({ error: "Body must be a PDF sent as application/pdf" });
      }
      try {
        const safeProperty = property.replace(/[^a-zA-Z0-9]/g, "_");
        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `inspections/${monthKey}/${safeProperty}/${Date.now()}_${safeFileName}`;
        const { url } = await storagePut(key, body, "application/pdf");
        res.json({ url, size: body.length });
      } catch (err) {
        console.error("[IngestUpload] storage failed:", err);
        res.status(502).json({ error: "Could not store the PDF" });
      }
    }
  );
}

// server/_core/pinGate.ts
import crypto from "crypto";
import { parse as parseCookies } from "cookie";
var PIN_COOKIE = "mi_pin";
var MAX_AGE_MS = 30 * 24 * 60 * 60 * 1e3;
var MAX_FAILURES = 5;
var LOCKOUT_MS = 15 * 60 * 1e3;
var failures = /* @__PURE__ */ new Map();
function pin() {
  return (process.env.PORTAL_PIN ?? "").trim();
}
function signature(p) {
  const secret = process.env.PIN_SECRET || process.env.INGEST_TOKEN || "monthly-inspections";
  return crypto.createHmac("sha256", secret).update(`portal-pin:${p}`).digest("base64url");
}
function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function hasValidPinCookie(req) {
  const p = pin();
  if (!p) return true;
  const value = parseCookies(req.headers.cookie ?? "")[PIN_COOKIE];
  return Boolean(value) && safeEqual(value, signature(p));
}
function clientKey(req) {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
}
function requirePin(req, res, next) {
  if (!pin() || hasValidPinCookie(req) || isValidIngestToken(req.headers.authorization)) return next();
  res.status(401).json({ error: "PIN required" });
}
function registerPinGate(app2) {
  app2.get("/api/pin/status", (req, res) => {
    res.json({ required: Boolean(pin()), unlocked: hasValidPinCookie(req) });
  });
  app2.post("/api/pin", (req, res) => {
    const p = pin();
    if (!p) return res.json({ unlocked: true });
    const key = clientKey(req);
    const now = Date.now();
    const f = failures.get(key);
    if (f && f.until > now) {
      return res.status(429).json({ error: `Too many wrong PINs. Try again in ${Math.ceil((f.until - now) / 6e4)} minutes.` });
    }
    const given = String(req.body?.pin ?? "").trim();
    if (!safeEqual(given, p)) {
      const count = (f && f.until <= now && f.count >= MAX_FAILURES ? 0 : f?.count ?? 0) + 1;
      failures.set(key, { count, until: count >= MAX_FAILURES ? now + LOCKOUT_MS : 0 });
      return res.status(401).json({ error: count >= MAX_FAILURES ? "Too many wrong PINs. Try again in 15 minutes." : "Wrong PIN." });
    }
    failures.delete(key);
    res.cookie(PIN_COOKIE, signature(p), {
      httpOnly: true,
      sameSite: "lax",
      secure: req.secure || req.headers["x-forwarded-proto"] === "https",
      maxAge: MAX_AGE_MS,
      path: "/"
    });
    res.json({ unlocked: true });
  });
  app2.post("/api/pin/lock", (_req, res) => {
    res.clearCookie(PIN_COOKIE, { path: "/" });
    res.json({ unlocked: false });
  });
  app2.use("/api/trpc", requirePin);
  app2.use("/files", requirePin);
}

// server/schema-setup.ts
import { sql } from "drizzle-orm";
var SCHEMA_STATEMENTS = [
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
  sql`CREATE TABLE IF NOT EXISTS "scrape_run_log" (
    "id" serial PRIMARY KEY NOT NULL,
    "runId" integer NOT NULL,
    "line" text NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL
  )`,
  sql`CREATE INDEX IF NOT EXISTS "scrape_run_log_run_idx" ON "scrape_run_log" ("runId", "id")`,
  sql`CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" varchar(64) PRIMARY KEY NOT NULL,
    "value" text NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
  )`
];
function renameStatements() {
  return Object.entries(LEGACY_PROPERTY_NAMES).map(
    ([from, to]) => sql`UPDATE "inspection_records" AS r SET "property" = ${to}
      WHERE r."property" = ${from}
        AND NOT EXISTS (
          SELECT 1 FROM "inspection_records" AS n
          WHERE n."monthKey" = r."monthKey" AND n."region" = r."region" AND n."property" = ${to}
        )`
  );
}
function regionMoveStatements() {
  return REGIONS.flatMap(
    (r) => r.properties.map((property) => sql`UPDATE "inspection_records" AS rec SET "region" = ${r.name}
      WHERE rec."property" = ${property} AND rec."region" <> ${r.name}
        AND NOT EXISTS (
          SELECT 1 FROM "inspection_records" AS n
          WHERE n."monthKey" = rec."monthKey" AND n."region" = ${r.name} AND n."property" = ${property}
        )`)
  );
}
async function ensureSchema() {
  const db = await getDb();
  if (!db) return;
  try {
    for (const s of SCHEMA_STATEMENTS) await db.execute(s);
    for (const s of renameStatements()) await db.execute(s);
    for (const s of regionMoveStatements()) await db.execute(s);
    console.log("[Database] schema ready");
  } catch (err) {
    console.error("[Database] schema setup failed:", err);
  }
}

// server/vercel-entry.ts
void ensureSchema();
var app = express2();
app.use(express2.json({ limit: "50mb" }));
app.use(express2.urlencoded({ limit: "50mb", extended: true }));
registerPinGate(app);
registerStorageProxy(app);
registerIngestUpload(app);
registerOAuthRoutes(app);
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext
  })
);
var vercel_entry_default = app;
export {
  vercel_entry_default as default
};
