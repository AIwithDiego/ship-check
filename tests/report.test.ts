import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Probe } from "../src/checks.js";
import type { Fetched } from "../src/fetcher.js";
import { isPublicAddress, validateUrl } from "../src/fetcher.js";
import { boardName } from "../src/live.js";
import { analyse } from "../src/report.js";
import { checkCopy } from "../src/slop.js";

const pageOf = (file: string): Fetched => ({
  status: 200,
  headers: { "content-type": "text/html" },
  body: readFileSync(new URL(`../public/demo/${file}`, import.meta.url)),
  finalUrl: `https://example.com/demo/${file.replace(".html", "")}`,
  ms: 120,
  truncated: false,
});
const probe: Probe = async (url) => ({ status: /find-us|latte-art/.test(url) ? 404 : 200 });

describe("the demo pages", () => {
  it("fails the before page on all three rounds", async () => {
    const r = await analyse(pageOf("before.html"), [], probe);
    console.log(JSON.stringify(r, null, 1));
    expect(r.ship).toBe(false);
    expect(r.works.pass).toBe(false);
    expect(r.copy.score).toBeGreaterThan(60);
    expect(r.look.score).toBeGreaterThan(40);
    const what = r.works.problems.map((p) => p.what).join("\n");
    expect(what).toContain('"Book now" goes nowhere');
    expect(what).toContain("answers 404");
    expect(what).toContain("No viewport tag");
  });
  it("ships the after page", async () => {
    const r = await analyse(pageOf("after.html"), [], probe);
    console.log(JSON.stringify({ works: r.works.problems, copy: r.copy, look: r.look }, null, 1));
    expect(r.works.serious).toBe(0);
    expect(r.copy.score).toBeLessThan(30);
    expect(r.look.score).toBeLessThan(30);
    expect(r.ship).toBe(true);
  });
});

describe("copy", () => {
  it("is the same every time", () => {
    const blocks = ["This isn't just a tool. It's a revolution.", "No fluff. No jargon. Just results.", "x ".repeat(60)];
    expect(checkCopy(blocks)).toEqual(checkCopy(blocks));
  });
  it("reads Spanish with Spanish rules", () => {
    const r = checkCopy([
      "En el mundo actual, el café no es solo una bebida, es una experiencia única que transforma tu día y te lleva al siguiente nivel.",
      "Descubre un mundo de sabores con nuestras soluciones integrales para que la mañana de todos los que nos visitan sea de primer nivel y sin esfuerzo.",
    ]);
    expect(r.lang).toBe("es");
    expect(r.score).toBeGreaterThan(60);
  });
});

describe("addresses we refuse", () => {
  it.each(["http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://2130706433/", "http://192.168.1.1:80/", "ftp://example.com/", "https://user:pw@example.com/", "https://example.com:8443/", "http://[::ffff:10.0.0.1]/", "file:///etc/passwd", "http://printer.local/"])("%s", (u) => {
    expect(() => validateUrl(u)).toThrow();
  });
  it("lets public sites through", () => {
    expect(validateUrl("https://example.com/a?b=1").href).toBe("https://example.com/a?b=1");
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("100.64.1.1")).toBe(false);
    expect(isPublicAddress("fd00::1")).toBe(false);
  });
});

describe("names for the big screen", () => {
  it("keeps plain names and drops the rest", () => {
    expect(boardName("  Bean There ")).toBe("Bean There");
    expect(boardName("<script>")).toBeNull();
    expect(boardName("x")).toBeNull();
    expect(boardName("f.u.c.k")).toBeNull();
    expect(boardName("My App (v2)")).toBe("My App (v2)");
    expect(boardName("f(u)c!k")).toBeNull();
  });
});
