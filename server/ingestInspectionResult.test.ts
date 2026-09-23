import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", async (orig) => ({
  ...(await orig<typeof import("./db")>()),
  setInspectionResult: vi.fn(async () => {}),
}));
vi.mock("./storage", () => ({
  FILES_ROUTE: "/files",
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://blob.example/${key}` })),
}));

import { appRouter } from "./routers";
import { setInspectionResult } from "./db";
import { storagePut } from "./storage";
import type { TrpcContext } from "./_core/context";

function ctx(authorization?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: authorization ? { authorization } : {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const base = {
  monthKey: "2026-09",
  region: "Region 2",
  property: "Breckenridge",
  checked: true,
  xed: false,
  note: "8 units scanned 9/17 by Grace Townhomes Manager.",
};

describe("inspections.ingestInspectionResult", () => {
  beforeEach(() => {
    process.env.INGEST_TOKEN = "test-token-123";
    vi.mocked(setInspectionResult).mockClear();
    vi.mocked(storagePut).mockClear();
  });
  afterEach(() => {
    delete process.env.INGEST_TOKEN;
  });

  it("rejects callers without the ingest token", async () => {
    const caller = appRouter.createCaller(ctx("Bearer wrong-token-12"));
    await expect(caller.inspections.ingestInspectionResult(base)).rejects.toThrow(/Invalid ingest token/);
    expect(setInspectionResult).not.toHaveBeenCalled();
  });

  it("records a result without a PDF and does not touch storage", async () => {
    const caller = appRouter.createCaller(ctx("Bearer test-token-123"));
    await caller.inspections.ingestInspectionResult({ ...base, checked: false, xed: true, note: "No activity." });
    expect(storagePut).not.toHaveBeenCalled();
    expect(setInspectionResult).toHaveBeenCalledWith(expect.objectContaining({ xed: true, note: "No activity.", pdf: null }));
  });

  it("stores the PDF and attaches it", async () => {
    const caller = appRouter.createCaller(ctx("Bearer test-token-123"));
    const pdf = Buffer.from("%PDF-1.3 fake");
    const out = await caller.inspections.ingestInspectionResult({
      ...base, fileName: "Breckenridge_2026-09.pdf", fileBase64: pdf.toString("base64"), fileSize: pdf.length,
    });
    expect(storagePut).toHaveBeenCalledOnce();
    expect(out.pdfUrl).toMatch(/^https:\/\/blob\.example\/inspections\/2026-09\/Breckenridge\//);
    expect(setInspectionResult).toHaveBeenCalledWith(expect.objectContaining({
      checked: true, pdf: expect.objectContaining({ name: "Breckenridge_2026-09.pdf" }),
    }));
  });

  it("refuses a non-PDF upload", async () => {
    const caller = appRouter.createCaller(ctx("Bearer test-token-123"));
    await expect(caller.inspections.ingestInspectionResult({
      ...base, fileName: "x.pdf", fileBase64: Buffer.from("hello").toString("base64"),
    })).rejects.toThrow(/not a PDF/);
  });

  it("attaches a PDF already uploaded through /api/ingest/pdf", async () => {
    const caller = appRouter.createCaller(ctx("Bearer test-token-123"));
    const url = "/files/inspections/2026-09/Crossroads/1_Crossroads_2026-09.pdf";
    await caller.inspections.ingestInspectionResult({ ...base, property: "Crossroads", fileName: "Crossroads_2026-09.pdf", pdfUrl: url, fileSize: 40_000_000 });
    expect(storagePut).not.toHaveBeenCalled();
    expect(setInspectionResult).toHaveBeenCalledWith(expect.objectContaining({
      pdf: expect.objectContaining({ key: url, size: 40_000_000, name: "Crossroads_2026-09.pdf" }),
    }));
  });

  it("refuses a pdfUrl that didn't come from the upload route", async () => {
    const caller = appRouter.createCaller(ctx("Bearer test-token-123"));
    await expect(caller.inspections.ingestInspectionResult({ ...base, fileName: "x.pdf", pdfUrl: "https://evil.example/x.pdf" })).rejects.toThrow(/pdfUrl/);
  });
});
