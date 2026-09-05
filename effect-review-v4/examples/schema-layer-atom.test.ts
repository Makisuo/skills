import { describe, expect, it } from "@effect/vitest"
import { Cause, Clock, Context, Deferred, Effect, Exit, Fiber, Layer, Option, Ref, Schedule, Schema } from "effect"
import { TestClock } from "effect/testing"
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity"

// These fixtures target the installed Effect 4.0.0-rc.111 behavior. They are
// compatibility checks for the review guidance, not application integration tests.

const ExactOptional = Schema.Struct({ field: Schema.optionalKey(Schema.String) })
const UndefinedOptional = Schema.Struct({ field: Schema.optional(Schema.String) })
const NullableOptional = Schema.Struct({ field: Schema.optionalKey(Schema.NullOr(Schema.String)) })

class Item extends Schema.Class<Item>("review-examples/Item")({
  name: Schema.String.check(Schema.isMinLength(1)),
}) {}

class Document extends Schema.Class<Document>("review-examples/Document")({
  items: Schema.Array(Item),
}) {}

class Converted extends Schema.Class<Converted>("review-examples/Converted")({
  amount: Schema.NumberFromString,
  label: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed("untitled"))),
}) {}

class ExampleFailure extends Schema.TaggedError<ExampleFailure>()("review-examples/Failure", {
  message: Schema.String,
}) {}

describe("schema boundary contracts", () => {
  for (const sample of [
    { name: "absent", input: {}, exact: true, optional: true, nullable: true },
    { name: "undefined", input: { field: undefined }, exact: false, optional: true, nullable: false },
    { name: "null", input: { field: null }, exact: false, optional: false, nullable: true },
    { name: "valid", input: { field: "value" }, exact: true, optional: true, nullable: true },
    { name: "invalid", input: { field: 42 }, exact: false, optional: false, nullable: false },
  ]) {
    it.effect(`distinguishes ${sample.name} during decode and encode`, () => Effect.gen(function* () {
      for (const [schema, expected] of [
        [ExactOptional, sample.exact],
        [UndefinedOptional, sample.optional],
        [NullableOptional, sample.nullable],
      ] as const) {
        const decoded = yield* Effect.exit(Schema.decodeUnknownEffect(schema)(sample.input))
        const encoded = yield* Effect.exit(Schema.encodeUnknownEffect(schema)(sample.input))
        expect(Exit.isSuccess(decoded)).toBe(expected)
        expect(Exit.isSuccess(encoded)).toBe(expected)
        if (!expected) {
          expect(Exit.hasFails(decoded)).toBe(true)
          expect(Exit.hasDies(decoded)).toBe(false)
        }
      }
    }))
  }

  it.effect("omits undefined producer fields without widening the schema", () => Effect.gen(function* () {
    const maybeField: string | undefined = undefined
    const value = yield* ExactOptional.makeEffect({
      ...(maybeField === undefined ? {} : { field: maybeField }),
    })
    expect(Object.hasOwn(value, "field")).toBe(false)
    expect(yield* Schema.encodeEffect(ExactOptional)(value)).toEqual({})
    const explicit = yield* UndefinedOptional.makeEffect({ field: undefined })
    expect(Object.hasOwn(explicit, "field")).toBe(true)
  }))

  it.effect("requires top-level class identity while constructing nested class literals", () => Effect.gen(function* () {
    const plain = { items: [{ name: "item" }] }
    const rejected = yield* Effect.exit(Schema.encodeUnknownEffect(Document)(plain))
    expect(Exit.hasFails(rejected)).toBe(true)
    expect(Exit.hasDies(rejected)).toBe(false)

    const constructed = new Document(plain)
    expect(constructed.items[0]).toBeInstanceOf(Item)
    expect(yield* Schema.encodeEffect(Document)(constructed)).toEqual(plain)

    const decoded = yield* Schema.decodeUnknownEffect(Document)(plain)
    expect(decoded).toBeInstanceOf(Document)
    expect(decoded.items[0]).toBeInstanceOf(Item)
  }))

  it.effect("keeps typed constructor rejection distinct from a thrown constructor", () => Effect.gen(function* () {
    const constructed = yield* Effect.exit(Item.makeEffect({ name: "" }))
    expect(Exit.hasFails(constructed)).toBe(true)
    expect(Exit.hasDies(constructed)).toBe(false)
    const issue = Option.getOrThrow(Exit.findErrorOption(constructed))
    expect(Schema.isSchemaError(issue)).toBe(false)

    const thrown = yield* Effect.exit(Effect.sync(() => new Item({ name: "" })))
    expect(Exit.hasFails(thrown)).toBe(false)
    expect(Exit.hasDies(thrown)).toBe(true)

    const decoded = yield* Effect.exit(Schema.decodeUnknownEffect(Item)({ name: "" }))
    expect(Schema.isSchemaError(Option.getOrThrow(Exit.findErrorOption(decoded)))).toBe(true)
  }))

  it.effect("distinguishes typed construction defaults from encoded decoding", () => Effect.gen(function* () {
    const constructed = yield* Converted.makeEffect({ amount: 12 })
    expect(constructed.amount).toBe(12)
    expect(constructed.label).toBe("untitled")
    expect(yield* Schema.encodeEffect(Converted)(constructed)).toEqual({ amount: "12", label: "untitled" })

    const decoded = yield* Schema.decodeUnknownEffect(Converted)({ amount: "12", label: "provided" })
    expect(decoded.amount).toBe(12)
    expect(decoded.label).toBe("provided")
    const missingLabel = yield* Effect.exit(Schema.decodeUnknownEffect(Converted)({ amount: "12" }))
    expect(Exit.hasFails(missingLabel)).toBe(true)
  }))
})

const observeAcquisition = (fresh: boolean) => Effect.gen(function* () {
  let acquired = 0
  const released: number[] = []
  const Configuration = Context.Service<{ readonly label: string }>("review-examples/Configuration")
  const configuration = Layer.succeed(Configuration, { label: "configured" })
  type Resource = { readonly id: number; readonly label: string }

  class Shared extends Context.Service<Shared, Resource>()("review-examples/Shared") {
    static readonly layer = Layer.effect(this, Effect.acquireRelease(
      Effect.gen(function* () {
        const config = yield* Configuration
        return yield* Effect.sync(() => ({ id: ++acquired, label: config.label }))
      }),
      (resource) => Effect.sync(() => { released.push(resource.id) }),
    ))
  }

  const ConsumerA = Context.Service<Resource>("review-examples/ConsumerA")
  const ConsumerB = Context.Service<Resource>("review-examples/ConsumerB")
  // Both branches create their own provide wrapper. Only Layer.fresh deliberately
  // isolates the underlying Shared.layer acquisition from the common memo map.
  const a = Layer.effect(ConsumerA, Shared).pipe(Layer.provide(
    (fresh ? Layer.fresh(Shared.layer) : Shared.layer).pipe(Layer.provide(configuration)),
  ))
  const b = Layer.effect(ConsumerB, Shared).pipe(Layer.provide(
    (fresh ? Layer.fresh(Shared.layer) : Shared.layer).pipe(Layer.provide(configuration)),
  ))
  const ids = yield* Effect.scoped(Effect.gen(function* () {
    const context = yield* Layer.build(Layer.mergeAll(a, b))
    const first = Context.get(context, ConsumerA)
    const second = Context.get(context, ConsumerB)
    expect(first.label).toBe("configured")
    expect(second.label).toBe("configured")
    expect(released).toEqual([])
    return [first.id, second.id]
  }))
  return { acquired, released, ids }
})

describe("layer identity and release", () => {
  it.effect("shares a static underlying layer across different provide wrappers", () => Effect.gen(function* () {
    const observed = yield* observeAcquisition(false)
    expect(observed.acquired).toBe(1)
    expect(observed.ids).toEqual([1, 1])
    expect(observed.released).toEqual([1])
  }))

  it.effect("acquires and releases independent resources with Layer.fresh", () => Effect.gen(function* () {
    const observed = yield* observeAcquisition(true)
    expect(observed.acquired).toBe(2)
    expect(new Set(observed.ids).size).toBe(2)
    expect([...observed.released].sort()).toEqual([1, 2])
  }))
})

describe("atom identity and retained results", () => {
  it("shares equal immutable object keys and separates tenant inputs", () => {
    const family = Atom.family((key: { readonly tenant: string; readonly filter: { readonly status: string } }) =>
      Atom.make(key))
    const first = family({ tenant: "one", filter: { status: "open" } })
    expect(family({ tenant: "one", filter: { status: "open" } })).toBe(first)
    expect(family({ tenant: "two", filter: { status: "open" } })).not.toBe(first)
    expect(family({ tenant: "one", filter: { status: "closed" } })).not.toBe(first)
  })

  it.effect("isolates values by registry and releases each registry's atom finalizer", () => Effect.gen(function* () {
    let finalized = 0
    const state = Atom.make(0).pipe(Atom.keepAlive)
    const listener = Atom.make((get) => {
      get.addFinalizer(() => { finalized += 1 })
      return "listening"
    }).pipe(Atom.keepAlive)

    yield* Effect.scoped(Effect.gen(function* () {
      const first = yield* Effect.acquireRelease(
        Effect.sync(() => AtomRegistry.make()),
        (registry) => Effect.sync(() => registry.dispose()),
      )
      const second = yield* Effect.acquireRelease(
        Effect.sync(() => AtomRegistry.make()),
        (registry) => Effect.sync(() => registry.dispose()),
      )
      first.set(state, 9)
      expect(first.get(state)).toBe(9)
      expect(second.get(state)).toBe(0)
      expect(first.get(listener)).toBe("listening")
      expect(second.get(listener)).toBe("listening")
      expect(finalized).toBe(0)
    }))
    expect(finalized).toBe(2)
  }))

  it("retains success while waiting and after refresh failure", () => {
    const previous = AsyncResult.success("last good value", { timestamp: 0 })
    const refreshing = AsyncResult.waiting(previous)
    expect(refreshing._tag).toBe("Success")
    expect(refreshing.waiting).toBe(true)
    expect(refreshing.value).toBe("last good value")

    const failed = AsyncResult.failure(Cause.fail("refresh unavailable"), {
      previousSuccess: Option.some(previous),
    })
    expect(failed._tag).toBe("Failure")
    expect(Option.getOrThrow(failed.previousSuccess).value).toBe("last good value")
    expect(failed.waiting).toBe(false)
  })
})

describe("failure assertions and deterministic time", () => {
  it.effect("does not confuse a tagged defect with a typed tagged failure", () => Effect.gen(function* () {
    const error = new ExampleFailure({ message: "expected rejection" })
    const failure = yield* Effect.exit(Effect.fail(error))
    expect(Exit.hasFails(failure)).toBe(true)
    expect(Exit.hasDies(failure)).toBe(false)
    expect(Exit.hasInterrupts(failure)).toBe(false)
    expect(Option.getOrThrow(Exit.findErrorOption(failure))._tag).toBe("review-examples/Failure")

    const defect = yield* Effect.exit(Effect.die(error))
    expect(Exit.hasFails(defect)).toBe(false)
    expect(Exit.hasDies(defect)).toBe(true)
    expect(Option.isNone(Exit.findErrorOption(defect))).toBe(true)

    const interrupted = yield* Effect.exit(Effect.interrupt)
    expect(Exit.hasInterrupts(interrupted)).toBe(true)
    expect(Exit.hasFails(interrupted)).toBe(false)
  }))

  it.effect("drives exponential retries with TestClock and stops after success", () => Effect.gen(function* () {
    const attempts = yield* Ref.make(0)
    const started = yield* Deferred.make<void>()
    const times: number[] = []
    const beginning = yield* Clock.currentTimeMillis
    const operation = Effect.gen(function* () {
      const attempt = yield* Ref.updateAndGet(attempts, (count) => count + 1)
      const now = yield* Clock.currentTimeMillis
      times.push(now - beginning)
      yield* Deferred.succeed(started, undefined)
      return attempt < 3
        ? yield* Effect.fail(new ExampleFailure({ message: "retryable" }))
        : "done"
    })
    const fiber = yield* Effect.forkChild(operation.pipe(Effect.retry({
      times: 2,
      schedule: Schedule.exponential("1 second"),
    })))
    yield* Deferred.await(started)
    yield* TestClock.adjust("3 seconds")
    expect(yield* Fiber.join(fiber)).toBe("done")
    expect(times).toEqual([0, 1_000, 3_000])
    expect(yield* Ref.get(attempts)).toBe(3)
    yield* TestClock.adjust("10 seconds")
    expect(yield* Ref.get(attempts)).toBe(3)
  }))
})
