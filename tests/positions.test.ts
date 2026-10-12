import { describe, it, expect } from "vitest";
import { parseDiffSides, mapToInlinePosition, dedupeFindings } from "../lib/github/positions";

const DIFF = [
  "diff --git a/src/auth.ts b/src/auth.ts",
  "+++ b/src/auth.ts",
  "@@ -10,3 +10,5 @@",
  " context",
  "-old",
  "+new line one",
  "+new line two",
  " context",
].join("\n");

describe("diff-line mapping", () => {
  it("attaches added lines on the RIGHT side", () => {
    const sides = parseDiffSides(DIFF);
    const pos = mapToInlinePosition(sides, "src/auth.ts", 11);
    expect(pos).toEqual({ valid: true, path: "src/auth.ts", line: 11, side: "RIGHT" });
  });

  it("rejects fabricated file paths", () => {
    const sides = parseDiffSides(DIFF);
    const pos = mapToInlinePosition(sides, "src/evil.ts", 11);
    expect(pos.valid).toBe(false);
  });

  it("rejects lines outside the diff", () => {
    const sides = parseDiffSides(DIFF);
    const pos = mapToInlinePosition(sides, "src/auth.ts", 999);
    expect(pos.valid).toBe(false);
  });

  it("rejects missing file or line", () => {
    const sides = parseDiffSides(DIFF);
    expect(mapToInlinePosition(sides, null, 11).valid).toBe(false);
    expect(mapToInlinePosition(sides, "src/auth.ts", null).valid).toBe(false);
  });

  it("deduplicates findings by path + line + title", () => {
    const f = (title: string, line: number | null) => ({ file: "a.ts", line, title });
    const out = dedupeFindings([f("Same issue", 5), f("same ISSUE", 5), f("Other", 5), f("Same issue", 6)]);
    expect(out).toHaveLength(3);
  });
});
