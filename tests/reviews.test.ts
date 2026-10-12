import { describe, it, expect } from "vitest";
import { assertOwns } from "../lib/ownership";
import { classifyFile } from "../lib/review/filter";
import {
  reviewMarker, findPostedReviewId, summaryBody, buildDedupeKey, classifyHeadState,
} from "../lib/github/publish";

describe("cross-account access rejection", () => {
  it("passes for the owning account", () => {
    expect(() => assertOwns("acct-1", "acct-1")).not.toThrow();
  });

  it("throws 404 (not 403) for another account", () => {
    try {
      assertOwns("acct-1", "acct-2");
      expect.unreachable("must throw");
    } catch (e) {
      expect((e as Error).message).toBe("Not found.");
      expect((e as { status?: number }).status).toBe(404);
    }
  });
});

describe("file triage", () => {
  it("skips binaries, lockfiles, and generated files", () => {
    expect(classifyFile("logo.png").skip).toBe(true);
    expect(classifyFile("package-lock.json").skip).toBe(true);
    expect(classifyFile("dist/bundle.js").skip).toBe(true);
    expect(classifyFile("app.min.js").skip).toBe(true);
  });

  it("keeps normal source files", () => {
    expect(classifyFile("src/auth.ts").skip).toBe(false);
  });

  it("honors excluded paths, directory prefixes, and globs", () => {
    expect(classifyFile("docs/readme.md", ["docs/"]).skip).toBe(true);
    expect(classifyFile("CHANGELOG.md", ["*.md"]).skip).toBe(true);
    expect(classifyFile("src/auth.ts", ["docs/", "*.md"]).skip).toBe(false);
  });
});

describe("duplicate delivery and job handling", () => {
  it("builds deterministic dedupe keys, distinct per SHA and account", () => {
    const a = buildDedupeKey("acct-1", "o/r", 7, "sha1");
    expect(buildDedupeKey("acct-1", "o/r", 7, "sha1")).toBe(a);
    expect(buildDedupeKey("acct-1", "o/r", 7, "sha2")).not.toBe(a);
    expect(buildDedupeKey("acct-2", "o/r", 7, "sha1")).not.toBe(a);
  });
});

describe("stale commits and publishing retries", () => {
  it("classifies head state: ok, closed, draft, stale", () => {
    expect(classifyHeadState({ state: "open", draft: false, headSha: "abc" }, "abc")).toBe("ok");
    expect(classifyHeadState({ state: "closed", draft: false, headSha: "abc" }, "abc")).toBe("closed");
    expect(classifyHeadState({ state: "open", draft: true, headSha: "abc" }, "abc")).toBe("draft");
    expect(classifyHeadState({ state: "open", draft: false, headSha: "def" }, "abc")).toBe("stale");
  });

  it("reconciles an already-posted review by marker instead of double-posting", () => {
    const marker = reviewMarker("review-1");
    const list = [
      { id: 11, body: "other review" },
      { id: 22, body: `summary\n${marker}\nmore` },
    ];
    expect(findPostedReviewId(list, "review-1")).toBe(22);
    expect(findPostedReviewId(list, "review-9")).toBeNull();
  });

  it("summary body reports coverage honestly: marker, mode, SHA, skips, gaps", () => {
    const body = summaryBody({
      reviewId: "r-1", summary: "One real bug found.", mode: "incremental", headSha: "abcdef123456",
      reviewed: [{ filename: "a.ts" }],
      skipped: [{ path: "logo.png", reason: "binary file" }],
      unattached: [{ file: null, title: "General concern", explanation: "Needs tests.", suggestion: "Add tests.", severity: "medium" }],
      incomplete: true, incompleteReason: "Model flagged batch 2 incomplete.",
      simulated: false,
    });
    expect(body).toContain(reviewMarker("r-1"));
    expect(body).toContain("incremental");
    expect(body).toContain("abcdef1");
    expect(body).toContain("logo.png");
    expect(body).toContain("General concern");
    expect(body).toContain("Incomplete coverage");
    expect(body).not.toContain("SIMULATED");
  });

  it("labels simulated reviews and never describes partial work as clean", () => {
    const body = summaryBody({
      reviewId: "r-2", summary: "No findings.", mode: "full", headSha: "abc",
      reviewed: [], skipped: [], unattached: [],
      incomplete: true, incompleteReason: null, simulated: true,
    });
    expect(body).toContain("SIMULATED");
    expect(body).toContain("unknown, not clean");
  });
});
