import express, { type Express } from "express";
import { storagePut } from "../storage";
import { isValidIngestToken } from "./trpc";

export const INGEST_PDF_ROUTE = "/api/ingest/pdf";

// Largest PDF the scraper may upload. A month of forms for a big property
// (Crossroads, Sept 2026: 551 pages) is tens of MB; sending it as raw bytes
// instead of base64 JSON avoids the 33% inflation and the JSON body limit.
export const MAX_INGEST_PDF_BYTES = 300 * 1024 * 1024;

/**
 * POST /api/ingest/pdf?monthKey=YYYY-MM&property=...&fileName=...
 * Body: the PDF (Content-Type: application/pdf). Auth: Bearer INGEST_TOKEN.
 * Returns { url, size }; the scraper then files the result with pdfUrl.
 */
export function registerIngestUpload(app: Express) {
  app.post(
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
    },
  );
}
