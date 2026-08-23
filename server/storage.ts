// Object storage backed by Vercel Blob.
//
// Replaces the Manus Forge/S3 presigned-URL implementation, which required
// BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY from the Manus platform.
//
// Vercel Blob serves uploads from a public CDN URL containing an unguessable
// random suffix, so there is no separate signing step: the URL returned by
// put() is the download URL. Callers store that URL directly.
//
// Requires BLOB_READ_WRITE_TOKEN, which Vercel injects when a Blob store is
// connected to the project.
import { put } from "@vercel/blob";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function assertConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "Storage config missing: connect a Vercel Blob store so BLOB_READ_WRITE_TOKEN is set"
    );
  }
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  assertConfigured();
  const pathname = normalizeKey(relKey);

  // addRandomSuffix keeps the unguessable-URL property the Forge
  // implementation got from its manual hash suffix.
  // @vercel/blob accepts string | Buffer | Blob | stream, but not a bare
  // Uint8Array, so normalize before handing it over.
  const body =
    typeof data === "string" || Buffer.isBuffer(data) ? data : Buffer.from(data);

  const result = await put(pathname, body, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });

  // The public URL is both the identity and the download location, so callers
  // can persist it straight into the pdfKey column.
  return { key: result.url, url: result.url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  // Already an absolute Blob URL — nothing to resolve.
  if (/^https?:\/\//i.test(relKey)) return { key: relKey, url: relKey };
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  // Public Blob URLs need no signing.
  if (/^https?:\/\//i.test(relKey)) return relKey;
  throw new Error(
    `Cannot resolve legacy storage key "${relKey}": it was stored by the Manus Forge backend, which is no longer configured`
  );
}
