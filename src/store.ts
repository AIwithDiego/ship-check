// Shared store: Upstash Redis over REST, provisioned with Stripe Projects.
// Without the env vars (local dev, tests) callers fall back to memory.
const TIMEOUT_MS = 2500;

export interface StoreReply {
  result?: unknown;
  error?: string;
}

function config(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REST_URL;
  const token = process.env.UPSTASH_REST_TOKEN;
  if (!url || !token) return null;
  if (process.env.VITEST && !process.env.LIVE_STORE_IN_TESTS) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function hasStore(): boolean {
  return config() !== null;
}

export async function pipeline(cmds: (string | number)[][]): Promise<StoreReply[]> {
  const s = config();
  if (!s) throw new Error("no store");
  const res = await fetch(`${s.url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json" },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`store answered ${res.status}`);
  return (await res.json()) as StoreReply[];
}
