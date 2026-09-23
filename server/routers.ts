import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { applyNamingTemplate, DEFAULT_NAMING, monthLabelOf, monthRange, NamingSettings, NOT_ON_MYLONEWORKERS, REGIONS } from "@shared/properties";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { machineProcedure, publicProcedure, router } from "./_core/trpc";
import { appendRunLog, createRun, deleteRun, getRun, getRunLog, getSetting, listRuns, listSavedRuns, setSetting, updateRun } from "./db";
import { dispatchScrape, DispatchError } from "./github";
import { deleteAllRecords, deleteMonthRecords, getHistorySummary, getMonthRecords, getRepeatOffenders, getSavedMonthKeys, setInspectionResult, upsertInspectionRecord } from "./db";
import { FILES_ROUTE, storagePut } from "./storage";

const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Current month in the zone MyLoneWorkers displays. */
function currentMonthKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`;
}

function previousMonthKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** A queued/running run that hasn't reported in 90 minutes is shown as stalled. */
export const STALE_AFTER_MS = 90 * 60 * 1000;
export function withStaleStatus<T extends { status: string; updatedAt: Date | string }>(run: T, now = Date.now()): T {
  const active = run.status === "queued" || run.status === "running";
  return active && now - new Date(run.updatedAt).getTime() > STALE_AFTER_MS ? { ...run, status: "stalled" } : run;
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  inspections: router({
    getMonth: publicProcedure
      .input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => {
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

    upsertRecord: publicProcedure
      .input(
        z.object({
          monthKey: z.string().regex(/^\d{4}-\d{2}$/),
          region: z.string(),
          property: z.string(),
          checked: z.boolean(),
          xed: z.boolean(),
          note: z.string().optional(),
          pdfName: z.string().optional(),
          pdfKey: z.string().optional(),
          pdfSize: z.number().optional(),
          pdfUploadedAt: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await upsertInspectionRecord(input);
        return { success: true };
      }),

    resetMonth: publicProcedure
      .input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ input }) => {
        await deleteMonthRecords(input.monthKey);
        return { success: true };
      }),

    resetAllData: publicProcedure
      .mutation(async () => {
        await deleteAllRecords();
        return { success: true };
      }),

    // Automated ingest for the inspections scraper: stores the PDF and attaches
    // it to the property's record for that month in a single authenticated call.
    // Requires a bearer token (INGEST_TOKEN), unlike the UI's public procedures.
    ingestInspectionPdf: machineProcedure
      .input(
        z.object({
          monthKey: z.string().regex(/^\d{4}-\d{2}$/),
          region: z.string(),
          property: z.string(),
          fileName: z.string(),
          fileBase64: z.string(),
          fileSize: z.number(),
          checked: z.boolean().default(true),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
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
          pdfUploadedAt: new Date().toISOString(),
        });

        return { success: true, url };
      }),

    // Automated result from the inspections scraper: pass/fail, the reason, and
    // (when the property had unit scans) a generated PDF report. Keeps any
    // existing PDF when none is sent.
    ingestInspectionResult: machineProcedure
      .input(
        z.object({
          monthKey: z.string().regex(/^\d{4}-\d{2}$/),
          region: z.string(),
          property: z.string(),
          checked: z.boolean(),
          xed: z.boolean(),
          note: z.string().max(2000),
          fileName: z.string().optional(),
          fileBase64: z.string().optional(),
          fileSize: z.number().optional(),
          // A PDF already stored via POST /api/ingest/pdf (used for large reports).
          pdfUrl: z.string().max(512).optional(),
        })
      )
      .mutation(async ({ input }) => {
        let pdf: { name: string; key: string; size: number; uploadedAt: string } | null = null;
        if (input.pdfUrl && input.fileName) {
          if (!input.pdfUrl.startsWith(`${FILES_ROUTE}/inspections/`) && !/^https:\/\/[^/]+\/inspections\//.test(input.pdfUrl)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "pdfUrl must come from /api/ingest/pdf" });
          }
          pdf = { name: input.fileName, key: input.pdfUrl, size: input.fileSize ?? 0, uploadedAt: new Date().toISOString() };
        } else if (input.fileBase64 && input.fileName) {
          const buffer = Buffer.from(input.fileBase64, "base64");
          if (buffer.subarray(0, 4).toString() !== "%PDF") {
            throw new Error("fileBase64 is not a PDF");
          }
          const safeProperty = input.property.replace(/[^a-zA-Z0-9]/g, "_");
          const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const key = `inspections/${input.monthKey}/${safeProperty}/${Date.now()}_${safeFileName}`;
          const { url } = await storagePut(key, buffer, "application/pdf");
          pdf = { name: input.fileName, key: url, size: input.fileSize ?? buffer.length, uploadedAt: new Date().toISOString() };
        }

        await setInspectionResult({
          monthKey: input.monthKey,
          region: input.region,
          property: input.property,
          checked: input.checked,
          xed: input.xed,
          note: input.note,
          pdf,
        });

        return { success: true, pdfUrl: pdf?.key ?? null };
      }),

    uploadPdf: publicProcedure
      .input(
        z.object({
          monthKey: z.string(),
          region: z.string(),
          property: z.string(),
          fileName: z.string(),
          fileBase64: z.string(),
          fileSize: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const safeProperty = input.property.replace(/[^a-zA-Z0-9]/g, "_");
        const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `inspections/${input.monthKey}/${safeProperty}/${Date.now()}_${safeFileName}`;
        const { url } = await storagePut(key, buffer, "application/pdf");
        // Return the stored object's URL as the key: the client persists this
        // into pdfKey and uses it directly as the download link.
        return { key: url, url };
      }),

    // Import a full backup JSON — uploads PDFs to S3 and saves all records to DB
    importBackup: publicProcedure
      .input(
        z.object({
          months: z.record(
            z.string(), // monthKey "YYYY-MM"
            z.record(
              z.string(), // "Region X::Property Name"
              z.object({
                checked: z.boolean().optional(),
                xed: z.boolean().optional(),
                note: z.string().optional().nullable(),
                pdf: z.object({
                  name: z.string(),
                  dataUrl: z.string(),
                  size: z.number(),
                  uploadedAt: z.string(),
                }).optional().nullable(),
              })
            )
          ),
        })
      )
      .mutation(async ({ input }) => {
        let imported = 0;
        let pdfUploaded = 0;
        for (const [monthKey, entries] of Object.entries(input.months)) {
          for (const [compositeKey, status] of Object.entries(entries)) {
            const [region, ...propParts] = compositeKey.split("::");
            const property = propParts.join("::");
            if (!region || !property) continue;

            let pdfKey: string | undefined;
            let pdfName: string | undefined;
            let pdfSize: number | undefined;
            let pdfUploadedAt: string | undefined;

            // If there's a PDF with a dataUrl, upload it to S3
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
              // Already a storage URL (not base64)
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
              note: status.note ?? undefined,
              pdfName,
              pdfKey,
              pdfSize,
              pdfUploadedAt,
            });
            imported++;
          }
        }
        return { success: true, imported, pdfUploaded };
      }),
  }),

  settings: router({
    naming: publicProcedure.query(async () => ({ ...DEFAULT_NAMING, ...((await getSetting<Partial<NamingSettings>>("naming")) ?? {}) })),
    setNaming: publicProcedure
      .input(z.object({
        runTemplate: z.string().trim().min(1).max(200),
        summaryPdfTemplate: z.string().trim().min(1).max(200),
        comparePdfTemplate: z.string().trim().min(1).max(200),
      }))
      .mutation(async ({ input }) => {
        await setSetting("naming", input);
        return input;
      }),
  }),

  scraper: router({
    // Latest runs for the Scrape Activity panel.
    activity: publicProcedure.query(async () => (await listRuns(20)).map(r => withStaleStatus(r))),
    // Finished runs, for the Saved Runs list.
    savedRuns: publicProcedure.query(async () => listSavedRuns()),

    start: publicProcedure
      .input(z.object({
        startMonthKey: monthKeySchema,
        endMonthKey: monthKeySchema,
        properties: z.array(z.string()).max(60).optional(),
      }))
      .mutation(async ({ input }) => {
        const months = monthRange(input.startMonthKey, input.endMonthKey);
        if (!months.length) throw new TRPCError({ code: "BAD_REQUEST", message: "End month must be on or after the start month." });
        if (months.length > 36) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick 36 months or fewer." });
        if (input.endMonthKey > currentMonthKey()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The range can't include future months." });
        }

        const known = new Set(REGIONS.flatMap(r => r.properties));
        const properties = input.properties?.length ? Array.from(new Set(input.properties)) : null;
        for (const p of properties ?? []) {
          if (!known.has(p)) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown property: ${p}` });
          if (NOT_ON_MYLONEWORKERS.includes(p)) throw new TRPCError({ code: "BAD_REQUEST", message: `${p} is not connected to MyLoneWorkers.` });
        }

        const active = (await listRuns(10)).map(r => withStaleStatus(r)).find(r => r.status === "queued" || r.status === "running");
        if (active) throw new TRPCError({ code: "CONFLICT", message: `"${active.label}" is still ${active.status}. Wait for it to finish before starting another.` });

        const naming = { ...DEFAULT_NAMING, ...((await getSetting<Partial<NamingSettings>>("naming")) ?? {}) };
        const label = properties
          ? `Test scrape — ${properties.join(" & ")}`
          : applyNamingTemplate(naming.runTemplate, {
              month: monthLabelOf(input.endMonthKey),
              previous: monthLabelOf(previousMonthKey(input.startMonthKey)),
              start: monthLabelOf(input.startMonthKey),
              end: monthLabelOf(input.endMonthKey),
              count: months.length,
            });

        const run = await createRun({
          label: label.slice(0, 255),
          kind: properties ? "test" : "range",
          startMonthKey: input.startMonthKey,
          endMonthKey: input.endMonthKey,
          totalMonths: months.length,
          properties,
          status: "queued",
        });

        try {
          await dispatchScrape({ runId: run.id, startMonthKey: input.startMonthKey, endMonthKey: input.endMonthKey, only: properties ?? undefined });
        } catch (err) {
          const message = err instanceof DispatchError ? err.message : `Could not reach GitHub: ${(err as Error).message}`;
          await updateRun(run.id, { status: "failed", errorMessage: message, completedAt: new Date() });
          await appendRunLog(run.id, [`❌ ${message}`]);
          throw new TRPCError({ code: "PRECONDITION_FAILED", message });
        }
        await appendRunLog(run.id, [`🚀 Started "${run.label}"`, "⏳ Waiting for the Mac runner to pick up the job…"]);
        return (await updateRun(run.id, { progressMessage: "Waiting for the Mac runner to pick up the job…" })) ?? run;
      }),

    rename: publicProcedure
      .input(z.object({ id: z.number().int(), label: z.string().trim().min(1).max(255) }))
      .mutation(async ({ input }) => updateRun(input.id, { label: input.label })),

    remove: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteRun(input.id);
        return { success: true };
      }),

    // Called by the scraper when it starts. Portal-started runs pass their
    // runId; scheduled runs get a new row.
    begin: machineProcedure
      .input(z.object({
        runId: z.number().int().optional(),
        startMonthKey: monthKeySchema,
        endMonthKey: monthKeySchema,
        properties: z.array(z.string()).optional(),
        githubRunUrl: z.string().max(512).optional(),
      }))
      .mutation(async ({ input }) => {
        const totalMonths = monthRange(input.startMonthKey, input.endMonthKey).length;
        const existing = input.runId ? await getRun(input.runId) : undefined;
        const run = existing
          ? await updateRun(existing.id, { status: "running", githubRunUrl: input.githubRunUrl ?? null, progressMessage: "Signing in to MyLoneWorkers…", errorMessage: null })
          : await createRun({
              label: input.properties?.length
                ? `Test scrape — ${input.properties.join(" & ")}`
                : `Scheduled run — ${monthLabelOf(input.startMonthKey)}${totalMonths > 1 ? ` to ${monthLabelOf(input.endMonthKey)}` : ""}`,
              kind: input.properties?.length ? "test" : "scheduled",
              startMonthKey: input.startMonthKey,
              endMonthKey: input.endMonthKey,
              totalMonths,
              properties: input.properties,
              status: "running",
            }).then(r => (input.githubRunUrl ? updateRun(r.id, { githubRunUrl: input.githubRunUrl }) : r));
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
        return { id: run.id };
      }),

    progress: machineProcedure
      .input(z.object({
        id: z.number().int(),
        status: z.enum(["running", "completed", "completed_with_errors", "failed"]).optional(),
        completedMonths: z.number().int().min(0).optional(),
        currentMonthKey: monthKeySchema.nullable().optional(),
        currentProperty: z.string().max(128).nullable().optional(),
        progressMessage: z.string().max(2000).nullable().optional(),
        passed: z.number().int().min(0).optional(),
        failed: z.number().int().min(0).optional(),
        total: z.number().int().min(0).optional(),
        pdfs: z.number().int().min(0).optional(),
        errorMessage: z.string().max(4000).nullable().optional(),
        // Console lines for the live log view, appended in order.
        log: z.array(z.string().max(1000)).max(500).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, log, ...patch } = input;
        const done = patch.status && patch.status !== "running";
        const run = await updateRun(id, { ...patch, ...(done ? { completedAt: new Date() } : {}) });
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
        if (log?.length) await appendRunLog(id, log);
        return { success: true };
      }),

    // The live console for one run; poll with the last id you have.
    log: publicProcedure
      .input(z.object({ runId: z.number().int(), afterId: z.number().int().min(0).default(0) }))
      .query(async ({ input }) => {
        const [run, lines] = await Promise.all([getRun(input.runId), getRunLog(input.runId, input.afterId)]);
        return { run: run ? withStaleStatus(run) : null, lines };
      }),
  }),
});

export type AppRouter = typeof appRouter;
