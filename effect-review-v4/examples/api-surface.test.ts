import { assert, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Schema } from "effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { FetchHttpClient } from "effect/unstable/http"
import { Otlp } from "effect/unstable/observability"

// Constructing this layer does not run it or send telemetry. The annotation
// proves the complete graph has no missing HTTP or serialization dependency.
export const ExampleTelemetry: Layer.Layer<never> = Otlp.layerJson({
  baseUrl: "https://telemetry.example.invalid",
  resource: { serviceName: "example" },
}).pipe(Layer.provide(FetchHttpClient.layer))

export const filesAndPaths = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  return { fs, path }
})

const DefaultLabel = Context.Reference<string>("@example/DefaultLabel", {
  defaultValue: () => "anonymous",
})

it.effect("supports thunk try, optional conversion, and a safe Reference default", () =>
  Effect.gen(function* () {
    assert.strictEqual(yield* Effect.try(() => 42), 42)
    assert.deepStrictEqual(Option.fromNullishOr(undefined), Option.none())
    assert.deepStrictEqual(Option.fromNullishOr("value"), Option.some("value"))
    assert.strictEqual(yield* DefaultLabel, "anonymous")
    assert.strictEqual(typeof Schema.TaggedError, "function")
  }),
)

it.effect("supports whileLoop without replacing early-return generators", () =>
  Effect.gen(function* () {
    let count = 0
    yield* Effect.whileLoop({
      while: () => count < 3,
      body: () => Effect.succeed(count + 1),
      step: (next) => { count = next },
    })
    assert.strictEqual(count, 3)
  }),
)
