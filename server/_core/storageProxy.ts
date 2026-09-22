import type { Express } from "express";
import { FILES_ROUTE, storageRead } from "../storage";

export function registerStorageProxy(app: Express) {
  // Railway buckets are private: PDFs stored there are streamed back through
  // this route. Keys include a random suffix, so the URL itself is the secret,
  // matching how the earlier public Blob URLs behaved.
  app.get(`${FILES_ROUTE}/*`, async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key || key.includes("..")) {
      res.status(400).send("Bad file key");
      return;
    }
    try {
      const obj = await storageRead(key);
      if (!obj) {
        res.status(404).send("File not found");
        return;
      }
      res.setHeader("Content-Type", obj.contentType || "application/octet-stream");
      if (obj.contentLength) res.setHeader("Content-Length", String(obj.contentLength));
      res.setHeader("Content-Disposition", `inline; filename="${key.split("/").pop()}"`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      obj.body.on("error", () => res.destroy());
      obj.body.pipe(res);
    } catch (err) {
      console.error("[StorageProxy] read failed:", err);
      res.status(502).send("Could not read file from storage");
    }
  });

  // Legacy download path from the Manus Forge storage backend. Kept so old
  // /manus-storage/{key} links fail with a clear explanation rather than a
  // confusing 404 from the SPA fallback.
  app.get("/manus-storage/*", (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    console.warn(`[StorageProxy] legacy Forge key requested: ${key}`);
    res.status(410).send(
      "This file was stored by the Manus Forge backend, which is no longer " +
        "configured. Re-upload the PDF to store it again."
    );
  });
}
