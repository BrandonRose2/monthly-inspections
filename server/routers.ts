import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getMonthRecords, getSavedMonthKeys, upsertInspectionRecord } from "./db";
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
        const key = `inspections/${input.monthKey}/${safeProperty}/${Date.now()}_${input.fileName}`;
        const { url } = await storagePut(key, buffer, "application/pdf");
        return { key, url };
      }),
  }),
});

export type AppRouter = typeof appRouter;
