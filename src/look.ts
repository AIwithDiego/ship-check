// "Does it look machine-made": the static gates of Hallmark's sloplint (MIT,
// Together AI, vendored in vendor/hallmark), run on the page's HTML and CSS.
// Only the gates that are tells on any website are kept; Hallmark's house rules
// (its stamp, its token block, its spacing scale) are not ours to enforce.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const LINTER = fileURLToPath(new URL("../vendor/hallmark/sloplint.mjs", import.meta.url));
const TIMEOUT_MS = 8000;

const GATES: Record<string, { tell: string; weight: number; repeats?: boolean }> = {
  // cheap tells: what a page looks like when nobody designed it
  "3": { tell: "Three identical icon cards", weight: 14, repeats: true },
  "30a": { tell: "Emoji used as an icon", weight: 14, repeats: true },
  "54": { tell: "Small label above every heading", weight: 8, repeats: true },
  "47a": { tell: "Hand-drawn browser window", weight: 8 },
  // imitated looks: designed sites have them too, generated sites have them all at once
  "2a": { tell: "Purple gradient", weight: 4 },
  "2b": { tell: "Gradient text", weight: 4 },
  "29": { tell: "Glow or glass behind the text", weight: 4 },
  "38iii": { tell: "One coloured word in a heading", weight: 4 },
  "46a": { tell: "A number that looks invented", weight: 4 },
  // small habits
  "1": { tell: "Default font as the display face", weight: 3 },
  "4": { tell: "Card inside a card", weight: 3 },
  "38i": { tell: "One italic word in a heading", weight: 3 },
  "42": { tell: "The template nav or footer", weight: 3 },
  "63": { tell: "Template punctuation (A · B · C, Learn more →)", weight: 3 },
  "64": { tell: "Monospace as costume", weight: 3 },
  "67": { tell: "Tiny spaced-out capitals", weight: 3 },
  "74": { tell: "Framework default colours", weight: 3 },
};
/** Gate 70 is a working problem, not a look: a form that says thanks and sends nothing. */
export const FAKE_SEND_GATE = "70";

export interface LookFlag {
  gate: string;
  tell: string;
  evidence: string;
  fix: string;
}

export interface LookResult {
  score: number;
  flags: LookFlag[];
  fakeSends: string[];
  note?: string;
}

interface Finding {
  gate: string;
  evidence: string;
  fix: string;
}

function runLinter(dir: string): Promise<Finding[]> {
  return new Promise((resolve, reject) => {
    const w = new Worker(LINTER, { argv: [dir, "--json"], stdout: true, stderr: true });
    let out = "";
    w.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    w.stderr.resume();
    const timer = setTimeout(() => {
      void w.terminate();
      reject(new Error("look check timed out"));
    }, TIMEOUT_MS);
    w.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    w.on("exit", () => {
      clearTimeout(timer);
      try {
        resolve((JSON.parse(out) as { findings: Finding[] }).findings ?? []);
      } catch {
        reject(new Error("look check gave no result"));
      }
    });
  });
}

/** A stylesheet rule only counts when the page uses one of the classes it names. */
function inUse(evidence: string, html: string): boolean {
  const classes = [...evidence.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c));
  return classes.length === 0 || classes.some((c) => html.includes(c));
}

export async function checkLook(html: string, stylesheets: string[]): Promise<LookResult> {
  let dir = "";
  try {
    dir = mkdtempSync(join(tmpdir(), "shipcheck-"));
    writeFileSync(join(dir, "index.html"), html);
    stylesheets.forEach((css, i) => writeFileSync(join(dir, `style-${i}.css`), css));
    const findings = await runLinter(dir);
    const flags: LookFlag[] = [];
    const fakeSends: string[] = [];
    const perGate = new Map<string, number>();
    let points = 0;
    for (const f of findings) {
      if (f.gate === FAKE_SEND_GATE) {
        fakeSends.push(f.evidence);
        continue;
      }
      const g = GATES[f.gate];
      if (!g) continue;
      if (!inUse(f.evidence, html)) continue;
      const seen = perGate.get(f.gate) ?? 0;
      perGate.set(f.gate, seen + 1);
      if (seen >= 3) continue;
      points += seen === 0 ? g.weight : g.repeats ? g.weight / 4 : 0;
      flags.push({ gate: f.gate, tell: g.tell, evidence: f.evidence.slice(0, 200), fix: f.fix.slice(0, 200) });
    }
    return { score: Math.min(100, Math.round(points)), flags, fakeSends };
  } catch (err) {
    return { score: 0, flags: [], fakeSends: [], note: `The look check did not run: ${(err as Error).message}` };
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}
