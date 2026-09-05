import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "inspect-project.mjs");
test("inventory preserves scope and includes index/config/TSX/spec/untracked while excluding vendored code", () => {
  const root = mkdtempSync(join(tmpdir(), "effect-review-inventory-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" });
  const put = (path, text = "export const x = 1\n") => {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text);
  };
  const inspectAt = (project, mode, ...args) => JSON.parse(execFileSync(process.execPath,
    [script, "--project", project, "--mode", mode, ...args], { encoding: "utf8", stdio: "pipe" }));
  const inspect = (mode, ...args) => inspectAt(root, mode, ...args);
  try {
    git("init", "--initial-branch=trunk");
    git("config", "user.name", "Skill fixture"); git("config", "user.email", "fixture@example.invalid");
    for (const path of ["src/index.ts", "src/view.tsx", "src/view.test.tsx", "src/service.spec.ts", "vite.config.ts", ".context/effect/src/Effect.ts", "src/routeTree.gen.ts"]) put(path);
    git("add", "."); git("commit", "-m", "fixture base");
    const repo = inspect("repo");
    assert.deepEqual(repo.candidates.map((f) => f.path), ["src/index.ts", "src/service.spec.ts", "src/view.test.tsx", "src/view.tsx", "vite.config.ts"]);
    assert.equal(repo.candidates.find((f) => f.path === "src/view.test.tsx").roleHint, "test");
    assert.equal(inspect("working").candidateCount, 0);
    git("switch", "-c", "feature"); put("src/index.ts", "export const x = 2\n");
    git("add", "src/index.ts"); git("commit", "-m", "changed index");
    assert.deepEqual(inspect("diff", "--base", "trunk").candidates.map((f) => f.path), ["src/index.ts"]);
    put("src/view.tsx", "export const y = 1\n"); git("add", "src/view.tsx");
    put("src/service.spec.ts", "export const z = 1\n"); put("src/untracked.ts");
    assert.deepEqual(inspect("working").candidates.map((f) => f.path), ["src/service.spec.ts", "src/untracked.ts", "src/view.tsx"]);
    assert.ok(inspect("repo").candidates.some((f) => f.path === "src/untracked.ts"));
    put(".gitignore", "ignored/\n"); put("ignored/source.ts");
    assert.ok(!inspect("repo").candidates.some((f) => f.path === "ignored/source.ts"));
    assert.ok(!inspectAt(join(root, "src"), "repo").candidates.some((f) => f.path === "vite.config.ts"));
    rmSync(join(root, "src/index.ts"));
    assert.equal(inspect("working").candidates.find((f) => f.path === "src/index.ts").exists, false);
    assert.throws(() => inspect("diff"), /requires the actual --base/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
