import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import { Receipt } from "mppx";
import { BlockedError, validateUrl } from "./fetcher.js";
import { boardName, live, recordCheck } from "./live.js";
import { getMppx, priceUsd } from "./payments.js";
import { NOTE, NotAPage, PASS_BELOW, VERSION, runCheck, summarise, type Report } from "./report.js";
import { sendFile } from "./static.js";

const PORT = Number(process.env.PORT) || 4950;
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const cut = (s: string) => (s.length > 130 ? `${s.slice(0, 127)}...` : s);
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function page(file: string, base: string): string {
  return readFileSync(`${publicDir}/${file}`, "utf8").replaceAll("{{PRICE}}", esc(priceUsd())).replaceAll("{{BASE}}", esc(base));
}

function llmsTxt(base: string): string {
  return `# Ship Check

> The last check before a human sees a website. Send a URL, get three rounds: does it work, does the copy sound machine-written, does the design look machine-made. Rule-based, no model: same page, same answer.

Price: ${priceUsd()} USD per POST /check, paid over MPP (Machine Payments Protocol, HTTP 402). POST /score is free.

## How to use it

1. Deploy the page somewhere public. Addresses that are not on the public internet (localhost, private ranges) are refused.
2. POST ${base}/score with JSON { "url": "https://..." } (free): pass or fail per round and the counts, no detail.
3. POST ${base}/check with JSON { "url": "https://...", "name": "optional, 2 to 24 characters" } (paid).
   - A bad URL, or a page that cannot be reached, is refused with 400 or 422 before any payment.
   - Otherwise 402 with a WWW-Authenticate: Payment challenge. Pay over MPP and retry, e.g.
     npx mppx@0.17.1 ${base}/check -X POST -H 'content-type: application/json' -d '{"url":"https://..."}' -a me --network testnet
   - Paid: 200 with the report and a Payment-Receipt header.
4. Fix what it lists, deploy, check again. A round passes with no serious problem (works) or a score under ${PASS_BELOW} (copy, look).

## The report

{ "ship": true | false, "verdict": "...",
  "works": { "pass", "serious", "minor", "problems": [{ "kind", "serious", "what", "where", "fix" }] },
  "copy":  { "pass", "score" 0-100, "lang": "en" | "es", "flags": [{ "tell", "why", "line", "match" }] },
  "look":  { "pass", "score" 0-100, "flags": [{ "tell", "evidence", "fix" }] } }

- works: broken links, images and files, buttons and forms that go nowhere, missing basics.
- copy: tells of machine-written text, in English or Spanish. Each flag quotes the line. Rewrite the line; do not swap one stock word for another.
- look: tells of machine-made design, from Hallmark's sloplint gates.

## The board

Send "name" and the site joins the public board at ${base}/live. Without it, the live screen shows the scores and never the address.

## Limits

${NOTE}
The page is not stored. The live screen keeps the last 20 scores for 24 hours, and for checks that sent a name, the top three findings per round.
`;
}

function openapi(base: string): object {
  const cents = Math.round(Number(priceUsd()) * 100);
  const what = "Ship Check: one website, three rounds";
  const json = (schema: object) => ({ "application/json": { schema } });
  const req = (extra: object = {}) => ({
    required: true,
    content: json({ type: "object", required: ["url"], properties: { url: { type: "string", description: "Public http(s) address of the page" }, ...extra } }),
  });
  const error = { type: "object", properties: { error: { type: "string" } } };
  return {
    openapi: "3.1.0",
    info: { title: "Ship Check", version: VERSION, description: "The last check before a human sees a website: does it work, does it read machine-written, does it look machine-made." },
    "x-service-info": { categories: ["developer-tools", "testing", "web"], docs: { homepage: `${base}/`, apiReference: `${base}/openapi.json`, llms: `${base}/llms.txt` } },
    paths: {
      "/score": {
        post: {
          summary: "Pass or fail per round and the counts (free)",
          requestBody: req(),
          responses: { "200": { description: "Summary", content: json({ type: "object" }) }, "400": { description: "Bad URL", content: json(error) }, "422": { description: "Page could not be reached", content: json(error) } },
        },
      },
      "/check": {
        post: {
          summary: "The full report (paid)",
          "x-payment-info": {
            offers: [
              { amount: String(cents), currency: "usd", description: what, intent: "charge", method: "stripe" },
              { amount: String(cents * 10000), currency: "0x20c0000000000000000000000000000000000000", description: what, intent: "charge", method: "tempo" },
            ],
          },
          requestBody: req({ name: { type: "string", minLength: 2, maxLength: 24, description: "Optional. Puts the site on the public board under this name." } }),
          responses: {
            "200": { description: "Report, with a Payment-Receipt header", content: json({ type: "object" }) },
            "400": { description: "Bad URL or name (checked before payment)", content: json(error) },
            "402": { description: "Payment required: MPP challenge in the WWW-Authenticate: Payment header" },
            "422": { description: "Page could not be reached (checked before payment)", content: json(error) },
            "503": { description: "Payments not configured", content: json(error) },
          },
        },
      },
      "/live/feed": { get: { summary: "Last 20 paid checks and the board", responses: { "200": { description: "Feed", content: json({ type: "object" }) } } } },
      "/llms.txt": { get: { summary: "How an agent uses this API", responses: { "200": { description: "Plain text" } } } },
    },
  };
}

type Parsed = { url: string; name: string | null } | { error: string };

async function readBody(c: Context): Promise<Parsed> {
  let body: unknown;
  try {
    body = JSON.parse(await c.req.raw.clone().text());
  } catch {
    return { error: "malformed JSON" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "body must be a JSON object" };
  const { url, name } = body as { url?: unknown; name?: unknown };
  if (typeof url !== "string") return { error: 'send { "url": "https://..." }' };
  let clean: string;
  try {
    clean = validateUrl(url.trim()).href;
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (name === undefined || name === null || name === "") return { url: clean, name: null };
  const n = boardName(name);
  if (!n) return { error: "name must be 2 to 24 plain characters, and something we can put on a big screen" };
  return { url: clean, name: n };
}

async function check(url: string): Promise<Report | { error: string; status: 400 | 422 }> {
  try {
    return await runCheck(url);
  } catch (err) {
    if (err instanceof BlockedError) return { error: err.message, status: 400 };
    if (err instanceof NotAPage) return { error: err.message, status: 422 };
    return { error: `the page could not be reached (${(err as Error).message || "no answer"})`, status: 422 };
  }
}

export const app = new Hono();

app.get("/", (c) => c.html(page("home.html", new URL(c.req.url).origin)));
app.get("/health", (c) => c.json({ ok: true, version: VERSION }));
app.get("/llms.txt", (c) => c.text(llmsTxt(new URL(c.req.url).origin)));
app.get("/openapi.json", (c) => c.json(openapi(new URL(c.req.url).origin)));
app.get("/design", (c) => sendFile(c, `${publicDir}/design-system.html`));
app.get("/demo/before", (c) => sendFile(c, `${publicDir}/demo/before.html`));
app.get("/demo/after", (c) => sendFile(c, `${publicDir}/demo/after.html`));

app.post("/score", async (c) => {
  const body = await readBody(c);
  if ("error" in body) return c.json({ error: body.error }, 400);
  const r = await check(body.url);
  if ("error" in r) return c.json({ error: r.error }, r.status);
  return c.json({ ...summarise(r), full_report: `POST /check, ${priceUsd()} USD over MPP`, note: NOTE });
});

app.post("/check", async (c) => {
  const body = await readBody(c);
  if ("error" in body) return c.json({ error: body.error }, 400);
  // The page is fetched before the 402, so nobody pays for a page we cannot reach.
  const r = await check(body.url);
  if ("error" in r) return c.json({ error: r.error }, r.status);

  const mppxReady = getMppx();
  if (!mppxReady) return c.json({ error: "payments not configured" }, 503);
  const mppx = await mppxReady;
  const amount = priceUsd();
  const paid = await mppx.charge({ amount })(c.req.raw);
  if (paid.status === 402) return paid.challenge;

  const res = paid.withReceipt(Response.json(r));
  let receipt_id = "";
  try {
    receipt_id = Receipt.fromResponse(res).reference;
  } catch {}
  const s = summarise(r);
  await recordCheck({
    at: r.checked_at,
    amount,
    receipt_id,
    name: body.name,
    host: body.name ? new URL(r.url).host : null,
    ship: s.ship,
    works: s.works,
    copy: s.copy,
    look: s.look,
    ...(body.name
      ? {
          top: {
            works: r.works.problems.filter((p) => p.serious).slice(0, 3).map((p) => cut(p.what)),
            copy: r.copy.flags.slice(0, 3).map((f) => cut(`${f.tell}: "${f.line}"`)),
            look: [...new Map(r.look.flags.map((f) => [f.tell, f])).values()].slice(0, 3).map((f) => cut(f.tell)),
          },
        }
      : {}),
  });
  return res;
});

app.route("/", live);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, (info) => {
    console.log(`Ship Check on http://localhost:${info.port}`);
  });
}
