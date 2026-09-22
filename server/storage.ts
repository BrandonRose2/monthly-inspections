// Object storage for inspection PDFs.
//
// Two backends, picked from the environment:
//
//   Railway bucket (S3-compatible)  when BUCKET is set.
//     Railway buckets are private, so files are served back through this
//     server at /files/<key> (see _core/storageProxy.ts). Keys carry a random
//     suffix, so links stay unguessable just like the Blob URLs they replace.
//     Variables: BUCKET, BUCKET_ENDPOINT, BUCKET_REGION, BUCKET_ACCESS_KEY_ID,
//     BUCKET_SECRET_ACCESS_KEY, optional BUCKET_PATH_STYLE=true.
//
//   Vercel Blob  when BLOB_READ_WRITE_TOKEN is set (the earlier Vercel deploy).
//     Uploads get a public CDN URL, stored directly as the download link.
import { randomBytes } from "crypto";
import type { Readable } from "stream";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

export const FILES_ROUTE = "/files";

function bucketConfigured() {
  return !!process.env.BUCKET;
}

let _s3: import("@aws-sdk/client-s3").S3Client | null = null;
async function s3() {
  if (_s3) return _s3;
  const { S3Client } = await import("@aws-sdk/client-s3");
  const missing = ["BUCKET_ENDPOINT", "BUCKET_ACCESS_KEY_ID", "BUCKET_SECRET_ACCESS_KEY"].filter(
    k => !process.env[k]
  );
  if (missing.length) throw new Error(`Storage config missing: ${missing.join(", ")}`);
  _s3 = new S3Client({
    endpoint: process.env.BUCKET_ENDPOINT,
    region: process.env.BUCKET_REGION || "auto",
    forcePathStyle: process.env.BUCKET_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
    },
  });
  return _s3;
}

/** Add a random suffix before the extension: a/b/report.pdf -> a/b/report-<hex>.pdf */
function withSuffix(key: string) {
  const suffix = randomBytes(12).toString("hex");
  const dot = key.lastIndexOf(".");
  const slash = key.lastIndexOf("/");
  return dot > slash ? `${key.slice(0, dot)}-${suffix}${key.slice(dot)}` : `${key}-${suffix}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const pathname = normalizeKey(relKey);
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : Buffer.from(data);

  if (bucketConfigured()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const key = withSuffix(pathname);
    await (await s3()).send(
      new PutObjectCommand({ Bucket: process.env.BUCKET, Key: key, Body: body, ContentType: contentType })
    );
    const url = `${FILES_ROUTE}/${key}`;
    return { key: url, url };
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const result = await put(pathname, body, { access: "public", contentType, addRandomSuffix: true });
    return { key: result.url, url: result.url };
  }

  throw new Error(
    "Storage config missing: set BUCKET (Railway bucket) or BLOB_READ_WRITE_TOKEN (Vercel Blob)"
  );
}

/** Stream an object from the Railway bucket. Returns null when it does not exist. */
export async function storageRead(
  key: string
): Promise<{ body: Readable; contentType?: string; contentLength?: number } | null> {
  if (!bucketConfigured()) return null;
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const out = await (await s3()).send(
      new GetObjectCommand({ Bucket: process.env.BUCKET, Key: normalizeKey(key) })
    );
    return {
      body: out.Body as Readable,
      contentType: out.ContentType,
      contentLength: out.ContentLength,
    };
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  if (/^https?:\/\//i.test(relKey) || relKey.startsWith(`${FILES_ROUTE}/`)) {
    return { key: relKey, url: relKey };
  }
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  if (/^https?:\/\//i.test(relKey) || relKey.startsWith(`${FILES_ROUTE}/`)) return relKey;
  throw new Error(
    `Cannot resolve legacy storage key "${relKey}": it was stored by the Manus Forge backend, which is no longer configured`
  );
}
