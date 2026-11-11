// "Does it work": what can be known from the page's HTML and the things it
// points at, without a browser. Broken links, images and files, buttons that go
// nowhere, and the basics a phone or a search engine needs.
import { parse, type HTMLElement } from "node-html-parser";
import { BlockedError, safeFetch, type Fetched } from "./fetcher.js";

export interface Problem {
  kind: "page" | "link" | "button" | "image" | "file" | "form" | "basics";
  serious: boolean;
  what: string;
  where: string;
  fix: string;
}

export interface WorksResult {
  problems: Problem[];
  serious: number;
  minor: number;
  links_checked: number;
  links_skipped: number;
  page: { status: number; ms: number; kb: number };
}

export interface PageParts {
  root: HTMLElement;
  blocks: string[];
  htmlLang?: string;
  stylesheetUrls: string[];
  inlineCss: string[];
}

export type Probe = (url: string) => Promise<{ status: number } | { error: string }>;

const MAX_LINKS = 40;
const MAX_ASSETS = 25;
const CONCURRENCY = 8;
const BUDGET_MS = 18_000;

export const liveProbe: Probe = async (url) => {
  try {
    let r: Fetched = await safeFetch(url, { method: "HEAD", timeoutMs: 5000 });
    // Plenty of servers answer HEAD with 403/405/501 and GET with 200.
    if (r.status >= 400) r = await safeFetch(url, { method: "GET", timeoutMs: 6000, maxBytes: 2000 });
    return { status: r.status };
  } catch (err) {
    if (err instanceof BlockedError) return { error: "blocked" };
    return { error: (err as Error).message || "no answer" };
  }
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const label = (el: HTMLElement) => clean(el.text).slice(0, 60) || clean(el.getAttribute("aria-label") ?? "") || "(no text)";

function abs(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    u.hash = "";
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

const TEXT_BLOCKS = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dd,dt,td,th,summary";

export function readPage(html: string, baseUrl: string): PageParts {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: false, pre: true } });
  const inlineCss = root.querySelectorAll("style").map((s) => s.text);
  const stylesheetUrls = root
    .querySelectorAll("link")
    .filter((l) => /\bstylesheet\b/i.test(l.getAttribute("rel") ?? ""))
    .map((l) => abs(l.getAttribute("href") ?? "", baseUrl))
    .filter((u): u is string => Boolean(u));

  const textRoot = parse(html, { comment: false });
  textRoot.querySelectorAll("script,style,noscript,svg,template,code,pre").forEach((n) => n.remove());
  const seen = new Set<string>();
  const blocks: string[] = [];
  const push = (t: string) => {
    const s = clean(t);
    if (s.length > 1 && !seen.has(s)) {
      seen.add(s);
      blocks.push(s);
    }
  };
  push(textRoot.querySelector("title")?.text ?? "");
  push(textRoot.querySelector('meta[name="description"]')?.getAttribute("content") ?? "");
  for (const el of textRoot.querySelectorAll(TEXT_BLOCKS)) {
    if (el.querySelector(TEXT_BLOCKS)) continue; // the inner block carries the text
    push(el.text);
  }
  for (const el of textRoot.querySelectorAll("a,button")) {
    if (!el.closest(TEXT_BLOCKS)) push(el.text);
  }
  return { root, blocks, htmlLang: root.querySelector("html")?.getAttribute("lang") ?? undefined, stylesheetUrls, inlineCss };
}

/** Words a visitor could read in the body as it arrives, before any script runs. */
export function bodyWords(html: string): number {
  const root = parse(html, { comment: false });
  root.querySelectorAll("script,style,noscript,template,svg").forEach((n) => n.remove());
  return ((root.querySelector("body") ?? root).text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
}

async function pool<T, R>(items: T[], n: number, deadline: number, fn: (x: T) => Promise<R>): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length && Date.now() < deadline) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

export async function checkWorks(page: Fetched, parts: PageParts, probe: Probe = liveProbe): Promise<WorksResult> {
  const { root } = parts;
  const base = page.finalUrl;
  const problems: Problem[] = [];
  const add = (p: Problem) => problems.push(p);
  const hasScript = root.querySelectorAll("script").length > 0;

  if (page.status >= 400) {
    add({ kind: "page", serious: true, what: `The page itself answers ${page.status}`, where: base, fix: "Fix the address or the deployment before anything else." });
  }

  // Links and the buttons made from them.
  const targets = new Map<string, string>();
  for (const a of root.querySelectorAll("a")) {
    const href = a.getAttribute("href");
    const text = label(a);
    const wired = a.getAttribute("onclick") !== undefined;
    if (href === undefined) {
      if (!wired && !hasScript && text !== "(no text)") {
        add({ kind: "button", serious: true, what: `"${text}" is a link with no destination`, where: `<a>${text}</a>`, fix: "Give it an href, or remove it." });
      }
      continue;
    }
    const h = href.trim();
    if (h === "" || h === "#" || /^javascript:\s*(?:void\(0\)|;)?\s*;?$/i.test(h)) {
      if (!wired) {
        add({ kind: "button", serious: true, what: `"${text}" goes nowhere`, where: `href="${h}"`, fix: "Point it at the real page, or wire the action it promises." });
      }
      continue;
    }
    if (h.startsWith("#")) {
      const id = decodeURIComponent(h.slice(1));
      if (id && !root.querySelector(`[id="${id.replace(/"/g, '\\"')}"]`) && !root.querySelector(`a[name="${id.replace(/"/g, '\\"')}"]`)) {
        add({ kind: "link", serious: true, what: `"${text}" jumps to a section that is not on the page`, where: `href="${h}"`, fix: `Add id="${id}" to the section, or fix the link.` });
      }
      continue;
    }
    if (/^mailto:/i.test(h)) {
      if (!/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/i.test(h)) add({ kind: "link", serious: true, what: `"${text}" has a broken email address`, where: `href="${h}"`, fix: "Put a real address after mailto:." });
      continue;
    }
    if (/^tel:/i.test(h)) {
      if (h.replace(/\D/g, "").length < 6) add({ kind: "link", serious: true, what: `"${text}" has a broken phone number`, where: `href="${h}"`, fix: "Put the full number after tel:." });
      continue;
    }
    const u = abs(h, base);
    if (u && !targets.has(u)) targets.set(u, text);
  }

  for (const b of root.querySelectorAll("button")) {
    const type = (b.getAttribute("type") ?? "").toLowerCase();
    const wired = b.getAttribute("onclick") !== undefined || b.closest("form") || b.closest("a") || b.closest("label") || b.closest("summary") || b.getAttribute("popovertarget") !== undefined;
    if (!wired && !hasScript && type !== "submit") {
      add({ kind: "button", serious: true, what: `The "${label(b)}" button does nothing`, where: "<button> with no form, no link and no script on the page", fix: "Wire it to the action it promises, or make it a link." });
    }
  }

  for (const f of root.querySelectorAll("form")) {
    const action = f.getAttribute("action");
    if ((action === undefined || action.trim() === "" || action.trim() === "#") && !hasScript && f.getAttribute("onsubmit") === undefined) {
      add({ kind: "form", serious: true, what: "A form that sends its answers nowhere", where: "<form> with no action and no script on the page", fix: "Give the form an action, or handle the submit." });
    }
  }

  // Images, scripts and stylesheets.
  const assets = new Map<string, { kind: "image" | "file"; what: string }>();
  let noAlt = 0;
  for (const img of root.querySelectorAll("img")) {
    const src = (img.getAttribute("src") ?? "").trim();
    if (img.getAttribute("alt") === undefined) noAlt++;
    if (!src) {
      if (!img.getAttribute("srcset") && !img.getAttribute("data-src") && !hasScript) {
        add({ kind: "image", serious: true, what: "An image with no source", where: clean(img.outerHTML).slice(0, 90), fix: "Give it a src, or remove it." });
      }
      continue;
    }
    if (src.startsWith("data:")) continue;
    const u = abs(src, base);
    if (u && !assets.has(u)) assets.set(u, { kind: "image", what: "image" });
  }
  for (const s of root.querySelectorAll("script")) {
    const u = abs(s.getAttribute("src") ?? "", base);
    if (s.getAttribute("src") && u && !assets.has(u)) assets.set(u, { kind: "file", what: "script" });
  }
  for (const u of parts.stylesheetUrls) if (!assets.has(u)) assets.set(u, { kind: "file", what: "stylesheet" });

  if (base.startsWith("https:")) {
    const insecure = [...assets.keys()].filter((u) => u.startsWith("http:"));
    if (insecure.length) {
      add({ kind: "file", serious: true, what: `${insecure.length} file(s) loaded over plain http on an https page`, where: insecure[0], fix: "Browsers block these. Load them over https." });
    }
  }

  const deadline = Date.now() + BUDGET_MS;
  const linkList = [...targets.entries()].slice(0, MAX_LINKS);
  const assetList = [...assets.entries()].slice(0, MAX_ASSETS);
  const jobs = [
    ...assetList.map(([url, a]) => ({ url, kind: a.kind, text: a.what })),
    ...linkList.map(([url, text]) => ({ url, kind: "link" as const, text })),
  ];
  const results = await pool(jobs, CONCURRENCY, deadline, (j) => probe(j.url));
  let checked = 0;
  results.forEach((r, i) => {
    const j = jobs[i];
    if (!r) return;
    if (j.kind === "link") checked++;
    // Only a clear "not there" is called broken. No answer or a server error can be
    // the other side refusing our server, so it is reported as unverified.
    const gone = !("error" in r) && (r.status === 404 || r.status === 410);
    const unsure = "error" in r ? r.error !== "blocked" : r.status >= 500;
    const an = j.text === "image" ? "An" : "A";
    if (gone) {
      const status = (r as { status: number }).status;
      add({
        kind: j.kind,
        serious: true,
        what: j.kind === "link" ? `"${j.text}" leads to a page that answers ${status}` : `${an} ${j.text} answers ${status}`,
        where: j.url,
        fix: j.kind === "link" ? "Fix the address or publish the page." : "Fix the path or upload the file. This shows up as a console error.",
      });
    } else if (unsure) {
      add({
        kind: j.kind,
        serious: false,
        what: j.kind === "link" ? `Could not verify where "${j.text}" leads: no clear answer from that address` : `Could not verify ${an.toLowerCase()} ${j.text}: no clear answer`,
        where: j.url,
        fix: "Open it yourself. Some sites refuse automated visits.",
      });
    }
  });
  const linksSkipped = targets.size - checked;

  // Basics.
  const head = root.querySelector("head");
  if (!clean(root.querySelector("title")?.text ?? "")) add({ kind: "basics", serious: true, what: "No page title", where: "<head>", fix: "Add a <title>. It is the tab name and the search result headline." });
  if (!head?.querySelector('meta[name="viewport"]')) add({ kind: "basics", serious: true, what: "No viewport tag, so phones show the desktop page shrunk", where: "<head>", fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' });
  if (!head?.querySelector('meta[name="description"]')?.getAttribute("content")) add({ kind: "basics", serious: false, what: "No description for search results and link previews", where: "<head>", fix: 'Add <meta name="description" content="...">.' });
  if (!parts.htmlLang) add({ kind: "basics", serious: false, what: "The page does not say what language it is in", where: "<html>", fix: 'Add lang="en" (or the right language) to <html>.' });
  if (root.querySelectorAll("h1").length === 0) add({ kind: "basics", serious: false, what: "No main heading", where: "<body>", fix: "Add one <h1> that says what the page is." });
  if (noAlt) add({ kind: "basics", serious: false, what: `${noAlt} image(s) with no alt text`, where: "<img>", fix: 'Describe each image in alt, or use alt="" for decoration.' });

  const serious = problems.filter((p) => p.serious).length;
  return {
    problems: problems.sort((a, b) => Number(b.serious) - Number(a.serious)),
    serious,
    minor: problems.length - serious,
    links_checked: checked,
    links_skipped: linksSkipped,
    page: { status: page.status, ms: page.ms, kb: Math.round(page.body.length / 1024) },
  };
}
