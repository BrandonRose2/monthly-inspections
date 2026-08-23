// server/vercel-entry.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

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
    const header = ctx.req.headers.authorization ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    const ok = presented.length === expected.length && presented.split("").reduce((acc, ch, i) => acc | ch.charCodeAt(0) ^ expected.charCodeAt(i), 0) === 0;
    if (!ok) {
      throw new TRPCError2({ code: "UNAUTHORIZED", message: "Invalid ingest token" });
    }
    return next({ ctx });
  })
);

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
import { and, eq } from "drizzle-orm";
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

// server/storage.ts
import { put } from "@vercel/blob";
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function assertConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "Storage config missing: connect a Vercel Blob store so BLOB_READ_WRITE_TOKEN is set"
    );
  }
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  assertConfigured();
  const pathname = normalizeKey(relKey);
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : Buffer.from(data);
  const result = await put(pathname, body, {
    access: "public",
    contentType,
    addRandomSuffix: true
  });
  return { key: result.url, url: result.url };
}

// server/routers.ts
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
  app2.get("/manus-storage/*", (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    console.warn(`[StorageProxy] legacy Forge key requested: ${key}`);
    res.status(410).send(
      "This file was stored by the Manus Forge backend, which is no longer configured. Re-upload the PDF to store it in Vercel Blob."
    );
  });
}

// server/vercel-entry.ts
var app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
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
