import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: any[] = [];
vi.mock("@aws-sdk/client-s3", () => {
  class Cmd { constructor(public input: any) {} }
  class PutObjectCommand extends Cmd {}
  class GetObjectCommand extends Cmd {}
  class S3Client {
    constructor(public config: any) {}
    async send(cmd: any) {
      sent.push(cmd);
      if (cmd instanceof GetObjectCommand) {
        if (cmd.input.Key.includes("missing")) throw Object.assign(new Error("nope"), { name: "NoSuchKey" });
        const { Readable } = await import("stream");
        return { Body: Readable.from([Buffer.from("%PDF-1.3")]), ContentType: "application/pdf", ContentLength: 8 };
      }
      return {};
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand };
});

import { storagePut, storageRead } from "./storage";

describe("storage (Railway bucket)", () => {
  beforeEach(() => {
    Object.assign(process.env, {
      BUCKET: "inspection-pdfs-abc",
      BUCKET_ENDPOINT: "https://storage.example",
      BUCKET_ACCESS_KEY_ID: "id",
      BUCKET_SECRET_ACCESS_KEY: "secret",
    });
    sent.length = 0;
  });
  afterEach(() => {
    for (const k of ["BUCKET", "BUCKET_ENDPOINT", "BUCKET_ACCESS_KEY_ID", "BUCKET_SECRET_ACCESS_KEY"]) delete process.env[k];
  });

  it("uploads with an unguessable key and returns a /files URL", async () => {
    const { url } = await storagePut("inspections/2026-09/Lexington/Lexington_2026-09.pdf", Buffer.from("%PDF"), "application/pdf");
    expect(url).toMatch(/^\/files\/inspections\/2026-09\/Lexington\/Lexington_2026-09-[0-9a-f]{24}\.pdf$/);
    expect(sent[0].input).toMatchObject({ Bucket: "inspection-pdfs-abc", ContentType: "application/pdf" });
    expect(sent[0].input.Key).toBe(url.replace(/^\/files\//, ""));
  });

  it("reads objects back and reports missing ones as null", async () => {
    const found = await storageRead("inspections/x.pdf");
    expect(found?.contentType).toBe("application/pdf");
    expect(await storageRead("inspections/missing.pdf")).toBeNull();
  });

  it("explains when no storage is configured", async () => {
    delete process.env.BUCKET;
    await expect(storagePut("a.pdf", "x")).rejects.toThrow(/Storage config missing/);
  });
});
