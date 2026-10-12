import { describe, it, expect } from "vitest";
import { parseReviewOutput, extractJson } from "../lib/review/schema";

describe("AI output validation", () => {
  it("parses valid structured output", () => {
    const out = parseReviewOutput(JSON.stringify({
      summary: "Looks solid overall with one auth issue.",
      findings: [{
        severity: "high", title: "Missing auth check", file: "app.ts", line: 42,
        explanation: "This handler mutates state without verifying the session.",
        suggestion: "Add requireSession() before the mutation.",
        excerpt: "db.update(...)",
      }],
    }));
    expect(out.summary).toMatch(/auth/);
    expect(out.findings).toHaveLength(1);
  });

  it("parses fenced JSON", () => {
    const raw = '```json\n{"summary": "This changes the auth flow safely.", "findings": []}\n```';
    expect(parseReviewOutput(extractJson(raw)).findings).toEqual([]);
  });

  it("rejects garbage", () => {
    expect(() => parseReviewOutput("not json at all")).toThrow();
  });

  it("rejects an invalid severity", () => {
    expect(() => parseReviewOutput(JSON.stringify({
      summary: "A long enough summary here.",
      findings: [{ severity: "cosmetic-nit", title: "Nitpick", explanation: "x".repeat(20), suggestion: "y".repeat(10) }],
    }))).toThrow();
  });

  it("rejects more than 30 findings", () => {
    const findings = Array.from({ length: 31 }, (_, i) => ({
      severity: "low", title: `Finding ${i}`, explanation: "x".repeat(20), suggestion: "y".repeat(10),
    }));
    expect(() => parseReviewOutput(JSON.stringify({ summary: "A long enough summary.", findings }))).toThrow();
  });

  it("rejects an empty summary", () => {
    expect(() => parseReviewOutput(JSON.stringify({ summary: "short", findings: [] }))).toThrow();
  });
});
