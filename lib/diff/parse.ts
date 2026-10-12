export interface DiffFile {
  path: string;
  hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number }[];
  addedLines: Set<number>;
}

export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diff.split("\n");
  let current: DiffFile | null = null;
  let newLine = 0;
  for (const line of lines) {
    const mPlus = line.match(/^\+\+\+\s+b\/(.+?)\s*$/);
    if (line.startsWith("+++ ") && mPlus) {
      const p = mPlus[1].trim();
      // A diff --git header usually precedes +++; reuse that entry instead of duplicating.
      if (current && current.hunks.length === 0 && current.addedLines.size === 0) {
        current.path = p;
      } else if (!current || current.path !== p) {
        current = { path: p, hunks: [], addedLines: new Set() };
        files.push(current);
      }
      continue;
    }
    if (!current && line.startsWith("diff --git")) {
      const m = line.match(/b\/(.+?)(?:\s|$)/);
      if (m) {
        current = { path: m[1].trim(), hunks: [], addedLines: new Set() };
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
      continue;
    }
    if (current && newLine > 0) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        current.addedLines.add(newLine);
        newLine++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        // removed line: newLine unchanged
      } else {
        newLine++;
      }
    }
  }
  return files;
}

export function verifyRef(files: DiffFile[], file: string | null, line: number | null): { verified: boolean; file: string | null; line: number | null } {
  if (!file) return { verified: false, file: null, line: null };
  const match = files.find((f) => f.path === file || f.path.endsWith("/" + file) || file.endsWith("/" + f.path));
  if (!match) return { verified: false, file: null, line: null };
  if (line == null) return { verified: true, file: match.path, line: null };
  const inRange = match.hunks.some((h) => line >= h.newStart && line <= h.newStart + Math.max(h.newLines, 1) + 3);
  if (!inRange && match.hunks.length > 0) return { verified: false, file: match.path, line: null };
  return { verified: true, file: match.path, line };
}
