// Outbound fetching for URLs strangers hand us. Every connection goes through
// guardedLookup, so the address that is checked is the address that is dialled
// (no gap for DNS rebinding), and every redirect hop is validated again.
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export class BlockedError extends Error {}

const blocked = new net.BlockList();
for (const [addr, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blocked.addSubnet(addr, bits, "ipv4");
for (const [addr, bits] of [
  ["::", 127], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(addr, bits, "ipv6");

export function isPublicAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPublicAddress(mapped[1]);
  const fam = net.isIP(ip);
  if (fam === 4) return !blocked.check(ip, "ipv4");
  if (fam === 6) return !blocked.check(ip, "ipv6");
  return false;
}

/** Shape checks that need no network. Throws BlockedError with a reason a caller can show. */
export function validateUrl(raw: string): URL {
  if (typeof raw !== "string" || raw.length > 2000) throw new BlockedError("url must be a string of at most 2000 characters");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedError("url is not a valid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedError("only http and https URLs are checked");
  if (u.username || u.password) throw new BlockedError("URLs with a username or password are not checked");
  if (u.port && u.port !== "80" && u.port !== "443") throw new BlockedError("only ports 80 and 443 are checked");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new BlockedError("that address is not on the public internet");
  }
  if (net.isIP(host) && !isPublicAddress(host)) throw new BlockedError("that address is not on the public internet");
  return u;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: dns.LookupOptions | LookupCb, cb?: LookupCb): void {
  const done = (typeof options === "function" ? options : cb) as LookupCb;
  const opts = typeof options === "function" ? {} : options;
  dns.lookup(hostname, { ...opts, all: true }, (err, addrs) => {
    if (err) return done(err);
    const list = addrs as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return done(Object.assign(new BlockedError("that address is not on the public internet"), { code: "EBLOCKED" }));
    }
    if (opts.all) return done(null, list);
    done(null, list[0].address, list[0].family);
  });
}

export interface Fetched {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  finalUrl: string;
  ms: number;
  truncated: boolean;
}

export interface FetchOpts {
  method?: "GET" | "HEAD";
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

const UA = "ShipCheck/0.1 (+https://github.com/AIwithDiego; website pre-launch check)";

function once(u: URL, method: string, maxBytes: number, timeoutMs: number): Promise<Omit<Fetched, "finalUrl" | "ms">> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      {
        method,
        lookup: guardedLookup as never,
        timeout: timeoutMs,
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-encoding": "identity" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const finish = () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks), truncated });
        res.on("data", (d: Buffer) => {
          if (truncated) return;
          size += d.length;
          if (size > maxBytes) {
            truncated = true;
            chunks.push(d.subarray(0, d.length - (size - maxBytes)));
            res.destroy();
            finish();
          } else chunks.push(d);
        });
        res.on("end", finish);
        res.on("error", (e) => (truncated ? undefined : reject(e)));
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("timed out")), timeoutMs + 500);
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
    req.end();
  });
}

export async function safeFetch(raw: string, opts: FetchOpts = {}): Promise<Fetched> {
  const { method = "GET", maxBytes = 2_000_000, timeoutMs = 8000, maxRedirects = 5 } = opts;
  const started = Date.now();
  let u = validateUrl(raw);
  for (let hop = 0; ; hop++) {
    const r = await once(u, method, method === "HEAD" ? 0 : maxBytes, timeoutMs);
    const loc = r.headers.location;
    if (r.status >= 300 && r.status < 400 && loc) {
      if (hop >= maxRedirects) throw new Error("too many redirects");
      u = validateUrl(new URL(loc, u).href);
      continue;
    }
    return { ...r, finalUrl: u.href, ms: Date.now() - started };
  }
}
