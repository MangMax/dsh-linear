/**
 * Harness file reader for the one-shot attachment upload (plan §68.1 B).
 *
 * Reads a workspace file into memory for the host-side PUT. Content type is
 * inferred from the extension (small curated map — unknown types fall back
 * to application/octet-stream). Relative paths resolve against the harness
 * process cwd (the profile's working directory).
 *
 * Cross-platform by construction: this adapter is the ONLY place the plugin
 * touches the filesystem, and it uses plain Node APIs (`node:fs/promises`,
 * `node:path`) — no shell, no POSIX-only assumptions.
 */
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".html": "text/html",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return CONTENT_TYPES[path.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

/** The file byte channel the attachment service consumes (plan §68.1 B). */
export interface HarnessFileReaderLike {
  read(path: string): Promise<{
    bytes: Uint8Array;
    filename: string;
    contentType: string;
    size: number;
  }>;
}

export function createHarnessFileReader(cwd: string = process.cwd()): HarnessFileReaderLike {
  return {
    async read(path) {
      const absolute = resolve(cwd, path);
      const bytes = await readFile(absolute);
      return {
        bytes,
        filename: basename(absolute),
        contentType: contentTypeFor(absolute),
        size: bytes.byteLength,
      };
    },
  };
}
