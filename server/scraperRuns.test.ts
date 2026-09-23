import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ runs: [] as any[], settings: {} as Record<string, unknown>, nextId: 1 }));

vi.mock("./db", async (orig) => ({
  ...(await orig<typeof import("./db")>()),
  createRun: vi.fn(async (r: any) => {
    const row = { id: store.nextId++, completedMonths: 0, passed: 0, failed: 0, total: 0, pdfs: 0, errorMessage: null, githubRunUrl: null,
      currentMonthKey: null, currentProperty: null, progressMessage: null, startedAt: new Date(), updatedAt: new Date(), completedAt: null,
      ...r, properties: r.properties?.length ? JSON.stringify(r.properties) : null, status: r.status ?? "queued" };
    store.runs.unshift(row);
    return row;
  }),
  updateRun: vi.fn(async (id: number, patch: any) => {
    const row = store.runs.find(r => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch, { updatedAt: new Date() });
    return row;
  }),
  getRun: vi.fn(async (id: number) => store.runs.find(r => r.id === id)),
  listRuns: vi.fn(async () => store.runs),
  listSavedRuns: vi.fn(async () => store.runs.filter(r => r.status.startsWith("completed"))),
  deleteRun: vi.fn(async (id: number) => { store.runs = store.runs.filter(r => r.id !== id); }),
  getSetting: vi.fn(async (k: string) => (store.settings[k] as any) ?? null),
  setSetting: vi.fn(async (k: string, v: unknown) => { store.settings[k] = v; }),
}));

import { appRouter, withStaleStatus } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctx(authorization?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: authorization ? { authorization } : {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const ui = () => appRouter.createCaller(ctx());
const machine = () => appRouter.createCaller(ctx("Bearer test-token-123"));
const fetchMock = vi.fn();

beforeEach(() => {
  store.runs = [];
  store.settings = {};
  store.nextId = 1;
  process.env.INGEST_TOKEN = "test-token-123";
  process.env.GITHUB_TOKEN = "gh-token";
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-22T18:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.GITHUB_TOKEN;
  delete process.env.INGEST_TOKEN;
});

describe("scraper.start", () => {
  it("creates a named run and dispatches the GitHub workflow with the range", async () => {
    const run = await ui().scraper.start({ startMonthKey: "2026-07", endMonthKey: "2026-09" });
    expect(run.label).toBe("Scraper Run — July 2026 to September 2026");
    expect(run.totalMonths).toBe(3);
    expect(run.status).toBe("queued");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/BrandonRose2/monthly-inspections/actions/workflows/scrape-inspections.yml/dispatches");
    expect(init.headers.authorization).toBe("Bearer gh-token");
    expect(JSON.parse(init.body)).toEqual({
      ref: "main",
      inputs: { run_id: String(run.id), start_month: "2026-07", end_month: "2026-09", only: "", dry_run: false },
    });
  });

  it("uses the saved naming template", async () => {
    await ui().settings.setNaming({ runTemplate: "{count} months ending {month}", summaryPdfTemplate: "S-{month}", comparePdfTemplate: "C-{previous}" });
    const run = await ui().scraper.start({ startMonthKey: "2026-08", endMonthKey: "2026-09" });
    expect(run.label).toBe("2 months ending September 2026");
  });

  it("labels a mapping test by its properties and passes them as ONLY", async () => {
    const run = await ui().scraper.start({ startMonthKey: "2026-09", endMonthKey: "2026-09", properties: ["Lexington", "Grace Townhomes"] });
    expect(run.label).toBe("Test scrape — Lexington & Grace Townhomes");
    expect(run.kind).toBe("test");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).inputs.only).toBe("Lexington,Grace Townhomes");
  });

  it("rejects unknown, unmapped and future selections", async () => {
    await expect(ui().scraper.start({ startMonthKey: "2026-09", endMonthKey: "2026-09", properties: ["Nowhere"] })).rejects.toThrow(/Unknown property/);
    await expect(ui().scraper.start({ startMonthKey: "2026-09", endMonthKey: "2026-09", properties: ["Fairfax"] })).rejects.toThrow(/not connected/);
    await expect(ui().scraper.start({ startMonthKey: "2026-09", endMonthKey: "2026-10" })).rejects.toThrow(/future/);
    await expect(ui().scraper.start({ startMonthKey: "2026-09", endMonthKey: "2026-08" })).rejects.toThrow(/on or after/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a second run while one is active, but not once it has stalled", async () => {
    await ui().scraper.start({ startMonthKey: "2026-09", endMonthKey: "2026-09" });
    await expect(ui().scraper.start({ startMonthKey: "2026-08", endMonthKey: "2026-08" })).rejects.toThrow(/still queued/);
    store.runs[0].updatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await expect(ui().scraper.start({ startMonthKey: "2026-08", endMonthKey: "2026-08" })).resolves.toMatchObject({ status: "queued" });
  });

  it("marks the run failed with a clear reason when GitHub isn't configured", async () => {
    delete process.env.GITHUB_TOKEN;
    await expect(ui().scraper.start({ startMonthKey: "2026-09", endMonthKey: "2026-09" })).rejects.toThrow(/GITHUB_TOKEN is not set/);
    expect(store.runs[0].status).toBe("failed");
    expect(store.runs[0].errorMessage).toMatch(/GITHUB_TOKEN/);
  });

  it("explains a GitHub permission error", async () => {
    fetchMock.mockResolvedValue(new Response("Resource not accessible", { status: 403 }));
    await expect(ui().scraper.start({ startMonthKey: "2026-09", endMonthKey: "2026-09" })).rejects.toThrow(/Actions read\/write access/);
  });
});

describe("scraper.begin / progress (machine calls)", () => {
  it("need the ingest token", async () => {
    await expect(ui().scraper.begin({ startMonthKey: "2026-09", endMonthKey: "2026-09" })).rejects.toThrow(/Invalid ingest token/);
    await expect(ui().scraper.progress({ id: 1, status: "failed" })).rejects.toThrow(/Invalid ingest token/);
  });

  it("move a portal run from queued to running to completed", async () => {
    const run = await ui().scraper.start({ startMonthKey: "2026-09", endMonthKey: "2026-09" });
    const { id } = await machine().scraper.begin({ runId: run.id, startMonthKey: "2026-09", endMonthKey: "2026-09", githubRunUrl: "https://github.com/x/actions/runs/1" });
    expect(id).toBe(run.id);
    expect(store.runs[0]).toMatchObject({ status: "running", githubRunUrl: "https://github.com/x/actions/runs/1" });

    await machine().scraper.progress({ id, currentMonthKey: "2026-09", currentProperty: "Lexington", passed: 3 });
    expect(store.runs[0]).toMatchObject({ currentProperty: "Lexington", passed: 3, completedAt: null });

    await machine().scraper.progress({ id, status: "completed", completedMonths: 1 });
    expect(store.runs[0].status).toBe("completed");
    expect(store.runs[0].completedAt).toBeInstanceOf(Date);
    expect((await ui().scraper.savedRuns()).map(r => r.id)).toEqual([id]);
  });

  it("create a run for a scheduled scrape", async () => {
    const { id } = await machine().scraper.begin({ startMonthKey: "2026-09", endMonthKey: "2026-09" });
    expect(store.runs.find(r => r.id === id)).toMatchObject({ kind: "scheduled", status: "running", label: "Scheduled run — September 2026" });
  });
});

describe("saved runs", () => {
  it("can be renamed and deleted", async () => {
    const { id } = await machine().scraper.begin({ startMonthKey: "2026-09", endMonthKey: "2026-09" });
    await ui().scraper.rename({ id, label: "September final" });
    expect(store.runs[0].label).toBe("September final");
    await ui().scraper.remove({ id });
    expect(store.runs).toHaveLength(0);
  });
});

describe("withStaleStatus", () => {
  it("flags only active runs that stopped reporting", () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(withStaleStatus({ status: "running", updatedAt: old }).status).toBe("stalled");
    expect(withStaleStatus({ status: "completed", updatedAt: old }).status).toBe("completed");
    expect(withStaleStatus({ status: "queued", updatedAt: new Date() }).status).toBe("queued");
  });
});

describe("settings.naming", () => {
  it("defaults, then saves", async () => {
    expect((await ui().settings.naming()).summaryPdfTemplate).toBe("Inspection-Summary-{month}");
    await ui().settings.setNaming({ runTemplate: "R", summaryPdfTemplate: "S", comparePdfTemplate: "C" });
    expect(await ui().settings.naming()).toEqual({ runTemplate: "R", summaryPdfTemplate: "S", comparePdfTemplate: "C" });
  });
});
