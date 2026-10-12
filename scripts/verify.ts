/** Lightweight repo checks: parser, schema, key-hygiene. Run: npm run verify */
import { parseDiff, verifyRef } from "../lib/diff/parse";
import { extractJson, parseReviewOutput } from "../lib/review/schema";
import { classifyError } from "../lib/providers/types";
import fs from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`ok - ${name}`); }
  catch (e) { fail++; console.error(`FAIL - ${name}: ${(e as Error).message}`); }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

check("diff parser finds files + hunks", () => {
  const diff = `diff --git a/app.ts b/app.ts\n+++ b/app.ts\n@@ -1,3 +1,4 @@\n a\n-b\n+b2\n+c\n d\n`;
  const files = parseDiff(diff);
  assert(files.length === 1 && files[0].path === "app.ts", "file");
  assert(files[0].hunks.length === 1, "hunk");
});

check("verifyRef rejects fabricated paths", () => {
  const files = parseDiff(`+++ b/real.ts\n@@ -1,2 +1,2 @@\n-a\n+b\n`);
  const bad = verifyRef(files, "evil.ts", 1);
  assert(bad.file === null && !bad.verified, "fabricated path must be nulled");
  const good = verifyRef(files, "real.ts", 1);
  assert(good.verified && good.file === "real.ts", "real ref");
});

check("schema parses fenced JSON, rejects garbage", () => {
  const raw = '```json\n{"summary": "This changes the auth flow safely.", "findings": []}\n```';
  const out = parseReviewOutput(extractJson(raw));
  assert(out.summary.length > 0, "summary");
  let threw = false;
  try { parseReviewOutput("not json"); } catch { threw = true; }
  assert(threw, "garbage must throw");
});

check("error classifier distinguishes auth/ratelimit/network", () => {
  assert(classifyError(Object.assign(new Error("x"), { status: 401 })).kind === "auth", "401");
  assert(classifyError(Object.assign(new Error("x"), { status: 429 })).kind === "ratelimit", "429");
  assert(classifyError(Object.assign(new Error("x"), { status: 404 })).kind === "model", "404");
});

check("no NEXT_PUBLIC key vars or key logging", () => {
  const root = process.cwd();
  const skip = new Set(["node_modules", ".next", "data"]);
  const hits: string[] = [];
  function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) {
        if (p.endsWith(`${path.sep}scripts${path.sep}verify.ts`)) continue;
        const t = fs.readFileSync(p, "utf8");
        if (/NEXT_PUBLIC.*KEY|localStorage.*(apiKey|key)/i.test(t)) hits.push(p);
        if (/console\.log.*apiKey/i.test(t)) hits.push(p + " (logs apiKey)");
      }
    }
  }
  walk(root);
  assert(hits.length === 0, "hygiene hits: " + hits.join(", "));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
