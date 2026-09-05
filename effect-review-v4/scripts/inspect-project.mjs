#!/usr/bin/env node
// Read-only candidate inventory, not a semantic code review.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  project: { type: "string" }, mode: { type: "string", default: "working" },
  base: { type: "string" }, exclude: { type: "string", multiple: true, default: [] },
} });
if (!values.project || !["repo", "working", "diff"].includes(values.mode)) {
  throw new Error("Usage: inspect-project.mjs --project <repo> --mode repo|working|diff [--base <ref>] [--exclude <directory>]");
}
if (values.mode === "diff" && !values.base) throw new Error("Diff mode requires the actual --base; no fallback commit is assumed");
const project = realpathSync(resolve(values.project));
const git = (...args) => execFileSync("git", ["--no-optional-locks", "-C", project, ...args], { encoding: "utf8" });
const root = git("rev-parse", "--show-toplevel").trim();
const scope = relative(root, project) || ".";
const gitRoot = (...args) => execFileSync("git", ["--no-optional-locks", "-C", root, ...args], { encoding: "utf8" });
const paths = (output) => output.split("\0").filter(Boolean);
let names;
let mergeBase;
if (values.mode === "repo") {
  names = paths(gitRoot("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", scope));
} else if (values.mode === "working") {
  names = [...new Set([
    ...paths(gitRoot("diff", "--name-only", "-z", "--", scope)),
    ...paths(gitRoot("diff", "--cached", "--name-only", "-z", "--", scope)),
    ...paths(gitRoot("ls-files", "--others", "--exclude-standard", "-z", "--", scope)),
  ])];
} else {
  mergeBase = gitRoot("merge-base", "--", values.base, "HEAD").trim();
  names = paths(gitRoot("diff", "--name-only", "-z", mergeBase, "HEAD", "--", scope));
}
const defaultExcluded = new Set([".git", ".context", "node_modules", "vendor", "dist", "build", "coverage"]);
function exclusion(path) {
  if (path.split("/").some((part) => defaultExcluded.has(part))) return "vendor/generated tree";
  if (/\.gen\.[cm]?[jt]sx?$/.test(path) || path.endsWith("routeTree.gen.ts")) return "generated source";
  if (values.exclude.some((prefix) => path === prefix || path.startsWith(prefix.replace(/\/$/, "") + "/"))) return "explicit exclusion";
  if (!/\.[cm]?[jt]sx?$/.test(path)) return "non-source (inspect separately if relevant)";
}
const candidates = [];
const excluded = [];
for (const path of [...new Set(names)].sort()) {
  const reason = exclusion(path);
  if (reason) excluded.push({ path, reason });
  else candidates.push({ path, exists: existsSync(join(root, path)), roleHint:
    /(?:\.(?:test|spec|type-test|test-d))\.[cm]?[jt]sx?$/.test(path) ? "test" : "source (classify by contents)",
  });
}
const resolver = createRequire(join(project, "package.json"));
const packages = {};
for (const name of ["effect", "@effect/vitest", "@effect/atom-react", "typescript"]) {
  try {
    const path = resolver.resolve(`${name}/package.json`);
    packages[name] = { version: JSON.parse(readFileSync(path, "utf8")).version, path };
  } catch { packages[name] = { unresolved: true }; }
}
const manifests = [];
for (let at = project; ; at = dirname(at)) {
  const path = join(at, "package.json");
  if (existsSync(path)) {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifests.push({ path, packageManager: manifest.packageManager,
      patchedDependencies: manifest.patchedDependencies ?? manifest.pnpm?.patchedDependencies,
      overrides: manifest.overrides ?? manifest.pnpm?.overrides, resolutions: manifest.resolutions,
    });
  }
  if (at === root || dirname(at) === at) break;
}
console.log(JSON.stringify({ root, project, mode: values.mode, base: values.base,
  mergeBase, packages, manifests, candidateCount: candidates.length, candidates, excluded,
  note: "Candidate discovery only; inspect lockfile, patches, nested instructions and relevant non-source files. No semantic coverage implied.",
}, null, 2));
