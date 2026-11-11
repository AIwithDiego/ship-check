import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import type { Context } from "hono";

// Static files, validated by content. Vercel stamps every deployed file with
// the same fixed date, so date-based revalidation (If-Modified-Since) answers
// 304 forever and returning browsers keep the old page. An ETag from the
// content is the only check that notices a new deployment.

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const cache = new Map<string, { body: Buffer; etag: string } | null>();

function load(path: string) {
  let hit = cache.get(path);
  if (hit === undefined) {
    try {
      const body = readFileSync(path);
      hit = { body, etag: `"${createHash("sha1").update(body).digest("base64url")}"` };
    } catch {
      hit = null;
    }
    cache.set(path, hit);
  }
  return hit;
}

export function sendFile(c: Context, path: string): Response | Promise<Response> {
  const file = load(path);
  if (!file) return c.notFound();
  const headers = { ETag: file.etag, "Cache-Control": "no-cache" };
  if (c.req.header("if-none-match") === file.etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(file.body), {
    headers: { ...headers, "Content-Type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream" },
  });
}

/** Serves files under `root` for a route like `/public/*`; anything outside the folder is a 404. */
export function sendFrom(root: string, prefix: string) {
  const base = resolve(root);
  return (c: Context): Response | Promise<Response> => {
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(c.req.url).pathname.slice(prefix.length));
    } catch {
      return c.notFound();
    }
    const path = resolve(base, rel);
    if (!path.startsWith(base + sep)) return c.notFound();
    return sendFile(c, path);
  };
}
