#!/usr/bin/env node
// Validate examples with the reviewed project's dependencies; never install any.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  project: { type: "string" }, output: { type: "string" },
} });
if (!values.project) throw new Error("Usage: node check-examples.mjs --project <repo> [--output <artifacts>]");
const project = resolve(values.project);
const skill = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireProject = createRequire(join(project, "package.json"));
const resolveManifest = (name, resolver = requireProject) => resolver.resolve(`${name}/package.json`);
const manifests = {
  effect: resolveManifest("effect"),
  "@effect/vitest": resolveManifest("@effect/vitest"),
  typescript: resolveManifest("typescript"),
  "@types/node": resolveManifest("@types/node"),
};
// Isolated linkers may expose Vitest only through @effect/vitest's peer graph.
manifests.vitest = resolveManifest("vitest", createRequire(manifests["@effect/vitest"]));
const packages = Object.fromEntries(Object.entries(manifests).map(([name, path]) => [name, {
  path, manifest: JSON.parse(readFileSync(path, "utf8")),
}]));
const scratch = mkdtempSync(join(tmpdir(), "effect-review-v4-examples-"));
const output = values.output ? resolve(values.output) : mkdtempSync(join(tmpdir(), "effect-review-v4-results-"));
mkdirSync(output, { recursive: true });
const metadata = { project, checkedAt: new Date().toISOString(), versions: Object.fromEntries(
  Object.entries(packages).map(([name, pkg]) => [name, { version: pkg.manifest.version, path: pkg.path }]),
), typecheck: "not run", tests: "not run" };

function run(label, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: scratch, encoding: "utf8", timeout: 120_000,
    env: { ...process.env, NO_COLOR: "1" }, maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(join(output, `${label}.log`), `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ?? ""}`);
  metadata[label] = result.status === 0 ? "passed" : "failed";
  if (result.status !== 0) throw new Error(`${label} failed; see ${join(output, `${label}.log`)}`);
}

try {
  for (const [name, pkg] of Object.entries(packages)) {
    const link = join(scratch, "node_modules", name);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(dirname(pkg.path), link, "dir");
  }
  cpSync(join(skill, "examples"), join(scratch, "examples"), { recursive: true });
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ private: true, type: "module" }));
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext", noEmit: true,
    strict: true, exactOptionalPropertyTypes: true, skipLibCheck: true,
    allowImportingTsExtensions: true, types: ["node"], lib: ["ESNext", "DOM"],
  }, include: ["examples/**/*.ts"] }, null, 2));
  writeFileSync(join(scratch, "vitest.config.mjs"), `export default { test: {
    include: ["examples/**/*.test.ts"], pool: "forks", maxWorkers: 1,
    fileParallelism: false, testTimeout: 5000, hookTimeout: 5000
  } };\n`);
  const tsc = packages.typescript.manifest.bin.tsc;
  run("typecheck", [join(dirname(packages.typescript.path), tsc), "--project", join(scratch, "tsconfig.json")]);
  const vitestBin = packages.vitest.manifest.bin;
  run("tests", [join(dirname(packages.vitest.path), typeof vitestBin === "string" ? vitestBin : vitestBin.vitest),
    "run", "--config", join(scratch, "vitest.config.mjs"), "--root", scratch,
    "--reporter=json", `--outputFile=${join(output, "tests.json")}`]);
  const results = JSON.parse(readFileSync(join(output, "tests.json"), "utf8"));
  metadata.testCount = results.numTotalTests;
  if (!results.numTotalTests || results.numFailedTests || !results.success) {
    metadata.tests = "failed";
    throw new Error("Expected a nonempty passing example test suite");
  }
  console.log(JSON.stringify({ ...metadata, output }, null, 2));
} finally {
  writeFileSync(join(output, "validation.json"), JSON.stringify(metadata, null, 2) + "\n");
  rmSync(scratch, { recursive: true, force: true });
}
