#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { project: { type: "string" }, output: { type: "string" } } });
if (!values.project || !values.output) throw new Error("Usage: setup.mjs --project <repo> --output <new-directory>");
const output = resolve(values.output);
if (existsSync(output)) throw new Error("Output already exists; use a fresh directory to preserve evaluation inputs");
const resolver = createRequire(join(resolve(values.project), "package.json"));
const effectManifest = resolver.resolve("effect/package.json");
const effectVersion = JSON.parse(readFileSync(effectManifest, "utf8")).version;
const cases = {
  backend: {
    "src/customer.ts": `import { Context, Effect, Option, Schema } from "effect"
export class DatabaseUnavailable extends Schema.TaggedError<DatabaseUnavailable>()("@example/DatabaseUnavailable", {
  message: Schema.String, cause: Schema.Defect(),
}) {}
export class CustomerMissing extends Schema.TaggedError<CustomerMissing>()("@example/CustomerMissing", {
  message: Schema.String, customerId: Schema.String,
}) {}
export class CustomerDb extends Context.Service<CustomerDb, {
  read: (id: string) => Effect.Effect<Option.Option<string>, DatabaseUnavailable>
}>()("@example/CustomerDb") {}

export const readCustomer = Effect.fn("Customer.read")(function* (customerId: string) {
  const db = yield* CustomerDb
  return yield* db.read(customerId).pipe(
    Effect.catchTag("@example/DatabaseUnavailable", () => Effect.fail(new CustomerMissing({
      message: "Customer not found", customerId,
    }))),
  )
})

// Logging is intended to retain diagnostics while the HTTP boundary below
// remains responsible for sending non-success status on failure.
export const observedRead = Effect.fn("Customer.observedRead")(function* (customerId: string) {
  return yield* readCustomer(customerId)
}, Effect.catchCause((cause) => Effect.logError("Customer read failed", cause)))

export const customerResponse = (id: string) => observedRead(id).pipe(
  Effect.map((value) => ({ status: 200, value })),
  Effect.catch(() => Effect.succeed({ status: 503, value: undefined })),
)

export const parseCount = (raw: string) => Effect.try(() => JSON.parse(raw))
export const displayName = (input: { name?: string }) => input.name?.trim() ?? "Anonymous"
`,
  },
  atoms: {
    "src/queries.tsx": `import { Atom } from "effect/unstable/reactivity"

// One registry persists for the signed-in browser session, including org switches.
let activeOrg = "org-a"
export const selectOrg = (org: string) => { activeOrg = org }

const totalsFamily = Atom.family((limit: number) => {
  const orgId = activeOrg
  return Atom.make({ orgId, limit, label: "Totals" }).pipe(Atom.keepAlive)
})
export const totalsAtom = (limit: number) => totalsFamily(limit)

// Consumers pass newly allocated but immutable inputs with the same fields.
export const detailFamily = Atom.family((input: { orgId: string; itemId: string }) =>
  Atom.make(input))

export const shortTitle = (title: string | undefined) => title?.trim() ?? "Untitled"
`,
  },
  repository: {
    "src/index.ts": `import { Effect, Schema } from "effect"

export class ConnectionClosed extends Schema.TaggedError<ConnectionClosed>()("@example/ConnectionClosed", {
  message: Schema.String,
}) {}

export const acknowledge = Effect.fn("Job.acknowledge")(function* () {
  return yield* Effect.scoped(Effect.gen(function* () {
    let closed = false
    const connection = yield* Effect.acquireRelease(
      Effect.succeed({ write: Effect.suspend(() => closed
        ? Effect.fail(new ConnectionClosed({ message: "Connection already closed" }))
        : Effect.void) }),
      () => Effect.sync(() => { closed = true }),
    )
    // Deliberate early acknowledgement: close the request connection on return,
    // and let the detached task persist the accepted job after the short delay.
    yield* Effect.forkDetach(Effect.sleep("1 second").pipe(
      Effect.andThen(connection.write), Effect.ignore,
    ))
    return "accepted"
  }))
})
`,
    "src/helpers.ts": `import { Effect } from "effect"
import * as Path from "effect/Path"
export const resolvePath = Effect.gen(function* () { return (yield* Path.Path).resolve(".") })
export const firstPositive = (values: ReadonlyArray<number>) => Effect.gen(function* () {
  for (const value of values) if (value > 0) return value
  return 0
})
`,
    "src/helpers.spec.ts": `import { Effect } from "effect"
// Test support exported for this fixture's external runner.
export const fixture = Effect.try(() => 42)
`,
    ".context/upstream.ts": `// Historical dependency source, not application code.
import { Effect } from "effect"
export const historical = Effect.catchAll(Effect.void, () => Effect.void)
`,
  },
};

for (const [name, files] of Object.entries(cases)) {
  const root = join(output, name);
  const put = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  mkdirSync(root, { recursive: true });
  put("package.json", JSON.stringify({ name: `review-fixture-${name}`, private: true, type: "module", dependencies: { effect: effectVersion } }, null, 2));
  put("CLAUDE.md", `# Fixture conventions\nUse installed Effect ${effectVersion}; its source is under node_modules/effect/src. New expected application failures use Schema.TaggedError with useful context. Preserve distinct public errors until the response boundary. Treat .context as historical dependency source. This is a read-only review: do not edit files or run real network calls.\n`);
  put(".gitignore", "node_modules/\n");
  mkdirSync(join(root, "node_modules"), { recursive: true });
  symlinkSync(dirname(effectManifest), join(root, "node_modules", "effect"), "dir");
  git("init", "--initial-branch=main");
  git("config", "user.name", "Review fixture"); git("config", "user.email", "fixture@example.invalid");
  git("add", "."); git("commit", "-m", "Fixture base");
  git("switch", "-c", "feature");
  for (const [path, text] of Object.entries(files)) put(path, text);
  git("add", "."); git("commit", "-m", "Fixture review change");
}
console.log(JSON.stringify({ output, effectVersion, fixtures: Object.keys(cases) }, null, 2));
