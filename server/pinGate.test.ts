import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { registerPinGate, resetPinFailures } from "./_core/pinGate";

let base = "";
let server: ReturnType<express.Express["listen"]>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerPinGate(app);
  app.get("/api/trpc/x", (_req, res) => res.json({ ok: true }));
  app.get("/files/inspections/a.pdf", (_req, res) => res.send("%PDF"));
  await new Promise<void>(r => { server = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });
beforeEach(() => {
  process.env.PORTAL_PIN = "3060";
  process.env.INGEST_TOKEN = "test-token-123";
  resetPinFailures();
});

const enter = (pin: string) =>
  fetch(`${base}/api/pin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });

describe("portal PIN", () => {
  it("blocks the API and PDFs until the PIN is entered", async () => {
    expect((await fetch(`${base}/api/trpc/x`)).status).toBe(401);
    expect((await fetch(`${base}/files/inspections/a.pdf`)).status).toBe(401);
    expect(await (await fetch(`${base}/api/pin/status`)).json()).toEqual({ required: true, unlocked: false });
  });

  it("unlocks with the right PIN and remembers it in a cookie", async () => {
    const res = await enter("3060");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(cookie).not.toContain("3060");
    expect((await fetch(`${base}/api/trpc/x`, { headers: { cookie } })).status).toBe(200);
    expect(await (await fetch(`${base}/api/pin/status`, { headers: { cookie } })).json()).toEqual({ required: true, unlocked: true });
    // Changing the PIN signs everyone out.
    process.env.PORTAL_PIN = "1111";
    expect((await fetch(`${base}/api/trpc/x`, { headers: { cookie } })).status).toBe(401);
  });

  it("lets the scraper through with its ingest token", async () => {
    expect((await fetch(`${base}/api/trpc/x`, { headers: { authorization: "Bearer test-token-123" } })).status).toBe(200);
    expect((await fetch(`${base}/api/trpc/x`, { headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });

  it("locks an address out after five wrong PINs", async () => {
    for (let i = 0; i < 4; i++) expect((await enter("0000")).status).toBe(401);
    const fifth = await enter("0000");
    expect(await fifth.json()).toEqual({ error: "Too many wrong PINs. Try again in 15 minutes." });
    const locked = await enter("3060");
    expect(locked.status).toBe(429);
  });

  it("is off when PORTAL_PIN isn't set", async () => {
    delete process.env.PORTAL_PIN;
    expect((await fetch(`${base}/api/trpc/x`)).status).toBe(200);
    expect(await (await fetch(`${base}/api/pin/status`)).json()).toEqual({ required: false, unlocked: true });
  });
});
