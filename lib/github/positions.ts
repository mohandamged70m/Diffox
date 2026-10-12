/**
 * Diff → inline-comment position mapping.
 * GitHub inline comments attach to (path, commit SHA, side + line) within the PR diff.
 * The model returns file + line; this module validates each against the actual
 * unified diff and drops anything that cannot be attached (caller puts those in
 * the summary instead of fabricating positions).
 */

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

export interface DiffSide {
  path: string;
  hunks: DiffHunk[];
  /** New-side line numbers that are added/changed (valid RIGHT-side comment targets). */
  addedLines: Set<number>;
  /** All new-side line numbers covered by the diff hunks. */
  coveredLines: Set<number>;
}

export function parseDiffSides(diff: string): DiffSide[] {
  const files: DiffSide[] = [];
  const lines = diff.split("\n");
  let current: DiffSide | null = null;
  let newLine = 0;
  let oldLine = 0;
  for (const line of lines) {
    const mPlus = line.match(/^\+\+\+\s+b\/(.+?)\s*$/);
    if (line.startsWith("+++ ") && mPlus) {
      const p = mPlus[1].trim();
      if (current && current.hunks.length === 0 && current.addedLines.size === 0) {
        current.path = p;
      } else if (!current || current.path !== p) {
        current = { path: p, hunks: [], addedLines: new Set(), coveredLines: new Set() };
        files.push(current);
      }
      continue;
    }
    if (!current && line.startsWith("diff --git")) {
      const m = line.match(/b\/(.+?)(?:\s|$)/);
      if (m) {
        current = { path: m[1].trim(), hunks: [], addedLines: new Set(), coveredLines: new Set() };
        files.push(current);
      }
      continue;
    }
    const h = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (h && current) {
      const hunk = {
        oldStart: Number(h[1]),
        oldLines: h[2] === undefined ? 1 : Number(h[2]),
        newStart: Number(h[3]),
        newLines: h[4] === undefined ? 1 : Number(h[4]),
      };
      current.hunks.push(hunk);
      newLine = hunk.newStart;
      oldLine = hunk.oldStart;
      continue;
    }
    if (current && newLine > 0) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        current.addedLines.add(newLine);
        current.coveredLines.add(newLine);
        newLine++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        oldLine++;
      } else {
        current.coveredLines.add(newLine);
        newLine++;
        oldLine++;
      }
    }
  }
  return files;
}

export type InlineValidity =
  | { valid: true; path: string; line: number; side: "RIGHT" }
  | { valid: false; reason: string };

/**
 * Validate a model-proposed (file, line) against the PR diff.
 * Only RIGHT-side (new code) lines are valid inline targets in this MVP.
 */
export function mapToInlinePosition(
  files: DiffSide[],
  file: string | null,
  line: number | null
): InlineValidity {
  if (!file) return { valid: false, reason: "missing file" };
  const match = files.find(
    (f) => f.path === file || f.path.endsWith("/" + file) || file.endsWith("/" + f.path)
  );
  if (!match) return { valid: false, reason: `file not in diff: ${file}` };
  if (line == null) return { valid: false, reason: "missing line" };
  if (match.addedLines.has(line)) return { valid: true, path: match.path, line, side: "RIGHT" };
  if (match.coveredLines.has(line)) {
    // Context line inside a hunk: GitHub accepts it, but prefer added lines.
    return { valid: true, path: match.path, line, side: "RIGHT" };
  }
  return { valid: false, reason: `line ${line} not in diff for ${match.path}` };
}

/** Deduplicate findings by (path, line, title) keeping the first occurrence. */
export function dedupeFindings<T extends { file: string | null; line: number | null; title: string }>(
  findings: T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const f of findings) {
    const key = `${(f.file || "").toLowerCase()}:${f.line ?? ""}:${f.title.trim().toLowerCase().slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
