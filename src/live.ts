// The room's screen: the last paid checks and the board of sites that asked to
// be on it. A check only shows its site when the caller gave a name for the
// board; otherwise the screen shows the scores and nothing else.
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { Summary } from "./report.js";
import { sendFile, sendFrom } from "./static.js";
import { hasStore, pipeline } from "./store.js";

export interface LiveCheck {
  at: string;
  amount: string;
  receipt_id: string;
  name: string | null;
  host: string | null;
  ship: boolean;
  works: Summary["works"];
  copy: Summary["copy"];
  look: Summary["look"];
  /** Only on checks that asked for the board by name: the worst three findings per round, for the room. */
  top?: { works: string[]; copy: string[]; look: string[] };
}

const MAX_CHECKS = 20;
const MAX_BOARD = 60;
const checks: LiveCheck[] = [];
const board = new Map<string, LiveCheck>();
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const FEED_KEY = "shipcheck:live";
const BOARD_KEY = "shipcheck:board";
const TTL_S = 60 * 60 * 24;

const BLOCKED = /fuck|shit|cunt|bitch|nigg|fag|rape|nazi|hitler|porn|dick|cock|pussy|whore|slut|puta|mierda|co[ñn]o|verga|culo|maric/i;

/** A name for the big screen: short, plain characters, nothing we would not project. Null when unusable. */
export function boardName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 24) return null;
  if (!/^[\p{L}\p{N} ._'&+\-()!,:#@/]+$/u.test(s)) return null;
  if (BLOCKED.test(s.replace(/[^\p{L}\p{N}]/gu, ""))) return null;
  return s;
}

export async function recordCheck(c: LiveCheck): Promise<void> {
  checks.unshift(c);
  if (checks.length > MAX_CHECKS) checks.length = MAX_CHECKS;
  if (c.name) board.set(c.name.toLowerCase(), c);
  if (!hasStore()) return;
  try {
    const cmds: (string | number)[][] = [
      ["LPUSH", FEED_KEY, JSON.stringify(c)],
      ["LTRIM", FEED_KEY, 0, MAX_CHECKS - 1],
      ["EXPIRE", FEED_KEY, TTL_S],
    ];
    if (c.name) cmds.push(["HSET", BOARD_KEY, c.name.toLowerCase(), JSON.stringify(c)], ["EXPIRE", BOARD_KEY, TTL_S]);
    await pipeline(cmds);
  } catch (err) {
    console.error("live store write failed:", err);
  }
}

/** Lower is better: every serious problem costs 25, then the two slop scores. */
export const points = (c: Pick<LiveCheck, "works" | "copy" | "look">) => c.works.serious * 25 + c.copy.score + c.look.score;

async function read(): Promise<{ checks: LiveCheck[]; board: LiveCheck[] }> {
  let feed = checks;
  let rows = [...board.values()];
  if (hasStore()) {
    try {
      const [f, b] = await pipeline([["LRANGE", FEED_KEY, 0, MAX_CHECKS - 1], ["HVALS", BOARD_KEY]]);
      if (Array.isArray(f?.result)) feed = (f.result as string[]).map((x) => JSON.parse(x) as LiveCheck);
      if (Array.isArray(b?.result)) rows = (b.result as string[]).map((x) => JSON.parse(x) as LiveCheck);
    } catch (err) {
      console.error("live store read failed:", err);
    }
  }
  rows.sort((a, b) => points(a) - points(b) || a.at.localeCompare(b.at));
  return { checks: feed, board: rows.slice(0, MAX_BOARD) };
}

export const live = new Hono();

live.get("/live", (c) => sendFile(c, `${publicDir}/live.html`));
live.get("/live/feed", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await read());
});
live.get("/public/*", sendFrom(publicDir, "/public/"));
