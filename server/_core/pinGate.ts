// A PIN in front of the whole portal. Set PORTAL_PIN on Railway; unset means
// no PIN (so a deploy without it keeps working).
//
// - POST /api/pin { pin } checks the PIN and sets a signed, httpOnly cookie
//   for 30 days. Changing PORTAL_PIN signs everyone out.
// - GET /api/pin/status tells the page whether to show the PIN screen.
// - /api/trpc and /files need the cookie. The scraper's calls carry the
//   INGEST_TOKEN bearer instead and are let through.
// - Five wrong PINs from one address lock it out for 15 minutes.
import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { parse as parseCookies } from "cookie";
import { isValidIngestToken } from "./trpc";

export const PIN_COOKIE = "mi_pin";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const failures = new Map<string, { count: number; until: number }>();

function pin() {
  return (process.env.PORTAL_PIN ?? "").trim();
}

function signature(p: string) {
  const secret = process.env.PIN_SECRET || process.env.INGEST_TOKEN || "monthly-inspections";
  return crypto.createHmac("sha256", secret).update(`portal-pin:${p}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function hasValidPinCookie(req: Request) {
  const p = pin();
  if (!p) return true;
  const value = parseCookies(req.headers.cookie ?? "")[PIN_COOKIE];
  return Boolean(value) && safeEqual(value!, signature(p));
}

function clientKey(req: Request) {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
}

export function requirePin(req: Request, res: Response, next: NextFunction) {
  if (!pin() || hasValidPinCookie(req) || isValidIngestToken(req.headers.authorization)) return next();
  res.status(401).json({ error: "PIN required" });
}

export function registerPinGate(app: Express) {
  app.get("/api/pin/status", (req, res) => {
    res.json({ required: Boolean(pin()), unlocked: hasValidPinCookie(req) });
  });

  app.post("/api/pin", (req, res) => {
    const p = pin();
    if (!p) return res.json({ unlocked: true });
    const key = clientKey(req);
    const now = Date.now();
    const f = failures.get(key);
    if (f && f.until > now) {
      return res.status(429).json({ error: `Too many wrong PINs. Try again in ${Math.ceil((f.until - now) / 60000)} minutes.` });
    }
    const given = String((req.body as { pin?: unknown })?.pin ?? "").trim();
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
      path: "/",
    });
    res.json({ unlocked: true });
  });

  app.post("/api/pin/lock", (_req, res) => {
    res.clearCookie(PIN_COOKIE, { path: "/" });
    res.json({ unlocked: false });
  });

  app.use("/api/trpc", requirePin);
  app.use("/files", requirePin);
}

/** For tests. */
export function resetPinFailures() {
  failures.clear();
}
