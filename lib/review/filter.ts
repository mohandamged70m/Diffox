/** File triage: binaries, generated files, lockfiles, and user-configured exclusions. */

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
  ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar",
  ".mp3", ".mp4", ".mov", ".avi", ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".dat", ".db", ".sqlite",
]);

const LOCKFILES = new Set([
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb",
  "Gemfile.lock", "poetry.lock", "Pipfile.lock", "uv.lock",
  "Cargo.lock", "go.sum", "composer.lock", "packages.lock.json",
]);

const GENERATED_DIRS = ["dist/", "build/", "out/", ".next/", "coverage/", "vendor/", "node_modules/"];
const GENERATED_SUFFIX = [".min.js", ".min.css", ".bundle.js", ".d.ts", ".snap"];

export interface SkipDecision {
  skip: boolean;
  reason: string | null;
}

export function classifyFile(path: string, excludedPaths: string[] = []): SkipDecision {
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() || lower;

  for (const ex of excludedPaths) {
    const e = ex.trim().toLowerCase();
    if (!e) continue;
    // Support exact paths, directory prefixes ("src/gen/"), and globs ("*.md", "*.generated.*").
    if (e.includes("*")) {
      const re = new RegExp("^" + e.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      if (re.test(lower) || re.test(base)) return { skip: true, reason: `excluded by rule "${ex}"` };
    } else if (lower === e || lower.startsWith(e.endsWith("/") ? e : e + "/") || base === e) {
      return { skip: true, reason: `excluded by rule "${ex}"` };
    }
  }

  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  if (BINARY_EXT.has(ext)) return { skip: true, reason: "binary file" };
  if (LOCKFILES.has(base)) return { skip: true, reason: "lockfile" };
  if (GENERATED_DIRS.some((d) => lower.startsWith(d))) return { skip: true, reason: "generated directory" };
  if (GENERATED_SUFFIX.some((s) => lower.endsWith(s))) return { skip: true, reason: "generated file" };
  return { skip: false, reason: null };
}

export function splitExcluded(input: string): string[] {
  return input.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 50);
}
