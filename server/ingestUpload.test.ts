import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

vi.mock("./storage", () => ({
  FILES_ROUTE: "/files",
  storagePut: vi.fn(async (key: string) => ({ key, url: `/files/${key}` })),
}));

import { registerIngestUpload } from "./_core/ingestUpload";
import { storagePut } from "./storage";

let base = "";
let server: ReturnType<express.Express["listen"]>;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" })); // the portal's JSON limit must not apply here
  registerIngestUpload(app);
  await new Promise<void>(r => { server = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });
beforeEach(() => {
  process.env.INGEST_TOKEN = "test-token-123";
  vi.mocked(storagePut).mockClear();
});

const pdf = (size: number) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(size)]);
const post = (body: Buffer, { token = "test-token-123", qs = "monthKey=2026-09&property=Crossroads&fileName=Crossroads_2026-09.pdf" } = {}) =>
  fetch(`${base}/api/ingest/pdf?${qs}`, { method: "POST", headers: { "content-type": "application/pdf", authorization: `Bearer ${token}` }, body });

describe("POST /api/ingest/pdf", () => {
  it("stores a PDF larger than the JSON limit and returns its URL", async () => {
    const res = await post(pdf(60 * 1024 * 1024));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.url).toMatch(/^\/files\/inspections\/2026-09\/Crossroads\/\d+_Crossroads_2026-09\.pdf$/);
    expect(out.size).toBe(60 * 1024 * 1024 + 9);
    expect(vi.mocked(storagePut).mock.calls[0][2]).toBe("application/pdf");
  });

  it("rejects a wrong token before reading the body", async () => {
    const res = await post(pdf(10), { token: "nope" });
    expect(res.status).toBe(401);
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("rejects non-PDF bodies and missing fields", async () => {
    expect((await post(Buffer.from("hello"))).status).toBe(400);
    expect((await post(pdf(10), { qs: "monthKey=2026-09" })).status).toBe(400);
    expect(storagePut).not.toHaveBeenCalled();
  });
});
