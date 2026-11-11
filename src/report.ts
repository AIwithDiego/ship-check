// One check, three rounds: does it work, does it sound like a machine, does it
// look like one. Nothing about the page is kept after the answer is sent.
import { checkWorks, readPage, type Problem, type Probe } from "./checks.js";
import { safeFetch, type Fetched } from "./fetcher.js";
import { checkLook, type LookFlag } from "./look.js";
import { checkCopy, type CopyFlag } from "./slop.js";

export const VERSION = "2026-11-11.1";
export const PASS_BELOW = 30;
export const NOTE =
  "Ship Check reads the page's HTML, CSS and the things it links to. It does not run the page in a browser yet, so text and buttons drawn only by JavaScript are not seen. The copy and look rounds say what reads as machine-made and why; they never say who made it.";

export interface Report {
  url: string;
  checked_at: string;
  ship: boolean;
  verdict: string;
  works: { pass: boolean; serious: number; minor: number; links_checked: number; links_skipped: number; page: { status: number; ms: number; kb: number }; problems: Problem[] };
  copy: { pass: boolean; score: number; lang: string; words: number; flags: CopyFlag[]; note?: string };
  look: { pass: boolean; score: number; flags: LookFlag[]; note?: string; credit: string };
  version: string;
  note: string;
}

export interface Summary {
  url: string;
  ship: boolean;
  verdict: string;
  works: { pass: boolean; serious: number; minor: number };
  copy: { pass: boolean; score: number; flags: number };
  look: { pass: boolean; score: number; flags: number };
}

const MAX_CSS = 6;

async function loadCss(urls: string[]): Promise<string[]> {
  const got = await Promise.all(
    urls.slice(0, MAX_CSS).map(async (u) => {
      try {
        const r = await safeFetch(u, { maxBytes: 400_000, timeoutMs: 5000 });
        return r.status < 400 ? r.body.toString("utf8") : "";
      } catch {
        return "";
      }
    }),
  );
  return got.filter(Boolean);
}

export async function analyse(page: Fetched, css: string[], probe?: Probe): Promise<Report> {
  const html = page.body.toString("utf8");
  const parts = readPage(html, page.finalUrl);
  const [works, look] = await Promise.all([checkWorks(page, parts, probe), checkLook(html, css)]);
  const copy = checkCopy(parts.blocks, parts.htmlLang);
  // "Thanks" with no request behind it is only knowable when all the page's script is
  // in the page. With script files we cannot see, it is a thing to verify, not a failure.
  const outside = parts.root.querySelectorAll("script").some((x) => x.getAttribute("src"));
  for (const evidence of look.fakeSends) {
    if (outside) {
      works.problems.push({ kind: "form", serious: false, what: "Could not verify that a form sends its answers", where: evidence.slice(0, 160), fix: "Submit it yourself and check the answer arrives." });
      works.minor++;
    } else {
      works.problems.unshift({ kind: "form", serious: true, what: "A form says thanks without sending anything", where: evidence.slice(0, 160), fix: "Send the answers somewhere before showing success." });
      works.serious++;
    }
  }
  const w = works.serious === 0;
  const c = copy.score < PASS_BELOW;
  const l = look.score < PASS_BELOW;
  const ship = w && c && l;
  const lost = [!w && "it has things that do not work", !c && "the copy reads as machine-written", !l && "the design reads as machine-made"].filter(Boolean);
  return {
    url: page.finalUrl,
    checked_at: new Date().toISOString(),
    ship,
    verdict: ship ? "Ship it." : `Fix first: ${lost.join(", ")}.`,
    works: { pass: w, serious: works.serious, minor: works.minor, links_checked: works.links_checked, links_skipped: works.links_skipped, page: works.page, problems: works.problems },
    copy: { pass: c, ...copy },
    look: { pass: l, score: look.score, flags: look.flags, ...(look.note ? { note: look.note } : {}), credit: "Look gates from Hallmark's sloplint (MIT, Together AI)." },
    version: VERSION,
    note: NOTE,
  };
}

const cache = new Map<string, { at: number; report: Promise<Report> }>();
const CACHE_MS = 20_000;

/** Fetches the page and runs the three rounds. A score and the paid report seconds later share one run. */
export function runCheck(url: string): Promise<Report> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.report;
  const report = (async () => {
    const page = await safeFetch(url);
    if (page.status >= 400) {
      throw new NotAPage(
        page.status === 404 || page.status === 410
          ? `that address answers ${page.status}: there is no page there`
          : `the site answered ${page.status} to our visit. It may refuse automated visitors, so there is nothing fair to score`,
      );
    }
    const type = String(page.headers["content-type"] ?? "");
    if (page.status < 400 && type && !/html|xml/i.test(type)) throw new NotAPage(`that address serves ${type.split(";")[0]}, not a web page`);
    const parts = readPage(page.body.toString("utf8"), page.finalUrl);
    // An empty shell that JavaScript fills in: we would be scoring a blank page, and a blank page passes everything.
    const words = (parts.blocks.join(" ").match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
    if (words < 40 && parts.root.querySelectorAll("script").length > 0) {
      throw new NotAPage("this page is drawn by JavaScript after it loads, and Ship Check reads the HTML only for now, so there is nothing fair to score");
    }
    return analyse(page, await loadCss(parts.stylesheetUrls));
  })();
  cache.set(url, { at: Date.now(), report });
  report.catch(() => cache.delete(url));
  if (cache.size > 200) for (const [k, v] of cache) if (Date.now() - v.at > CACHE_MS) cache.delete(k);
  return report;
}

export class NotAPage extends Error {}

export function summarise(r: Report): Summary {
  return {
    url: r.url,
    ship: r.ship,
    verdict: r.ship ? "Ship it." : "Fix first.",
    works: { pass: r.works.pass, serious: r.works.serious, minor: r.works.minor },
    copy: { pass: r.copy.pass, score: r.copy.score, flags: r.copy.flags.length },
    look: { pass: r.look.pass, score: r.look.score, flags: r.look.flags.length },
  };
}
