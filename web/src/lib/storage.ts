/**
 * Storage for original uploaded files.
 *
 * The citation viewer needs the original PDF/image to show the cited page, so
 * every upload is kept here. This implementation writes to a local folder
 * (STORAGE_DIR). To move to S3/MinIO later, keep these three functions' names
 * and signatures and swap the bodies — nothing else in the app touches disk.
 */
import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "@/lib/env";

/** Absolute path of the storage folder (decided at runtime, not at build time). */
function storageRoot(): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), env.STORAGE_DIR);
}

/** Turn a storage key into an absolute path, refusing anything that escapes the storage folder. */
function resolveKey(key: string): string {
  const root = storageRoot();
  const fullPath = path.resolve(/* turbopackIgnore: true */ root, key);
  if (!fullPath.startsWith(root + path.sep)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return fullPath;
}

/** Build the key for a document's original file: "<workspace>/<document>.<ext>". */
export function buildStorageKey(workspaceId: string, documentId: string, fileName: string): string {
  const extension = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  return path.posix.join(workspaceId, `${documentId}${extension}`);
}

export async function saveFile(key: string, data: Uint8Array): Promise<void> {
  const fullPath = resolveKey(key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, data);
}

/** Open a stored file as a web stream (for sending it back in a Response). */
export async function openFile(key: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
  const fullPath = resolveKey(key);
  const { size } = await stat(fullPath);
  const nodeStream = createReadStream(fullPath);
  return { stream: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>, size };
}

export async function deleteFile(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true });
}
