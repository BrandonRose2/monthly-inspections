import type { Express } from "express";

// Legacy download path from the Manus Forge storage backend.
//
// New uploads go to Vercel Blob and are persisted as absolute public URLs, so
// the client links to them directly and never reaches this route. It stays
// registered so old /manus-storage/{key} links fail with a clear explanation
// rather than a confusing 404 from the SPA fallback.
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    console.warn(`[StorageProxy] legacy Forge key requested: ${key}`);
    res.status(410).send(
      "This file was stored by the Manus Forge backend, which is no longer " +
        "configured. Re-upload the PDF to store it in Vercel Blob."
    );
  });
}
