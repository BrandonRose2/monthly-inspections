import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { deleteAllRecords, deleteMonthRecords, getMonthRecords, getSavedMonthKeys, upsertInspectionRecord } from "./db";
import { storagePut } from "./storage";

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
        return { key, url };
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
});

export type AppRouter = typeof appRouter;
