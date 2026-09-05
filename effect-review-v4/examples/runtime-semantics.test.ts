import { expect, it } from "@effect/vitest"
import { Clock, Deferred, Effect, Exit, Fiber, Option, Result } from "effect"
import { TestClock } from "effect/testing"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { getText, StatusFailure } from "./errors-and-http.ts"

const endpoint = "https://example.invalid/finite-text"
const failure = () => new StatusFailure({ message: "Unavailable", endpoint, status: 503 })

it.effect("tapError observes without converting failure into success", () => Effect.gen(function* () {
  const error = failure()
  const observed: Array<StatusFailure> = []
  const exit = yield* Effect.fail(error).pipe(
    Effect.tapError((value) => Effect.sync(() => { observed.push(value) })),
    Effect.exit,
  )
  expect(Exit.hasFails(exit)).toBe(true)
  expect(Exit.hasDies(exit)).toBe(false)
  expect(Exit.findErrorOption(exit)).toEqual(Option.some(error))
  expect(observed).toEqual([error])
}))

it.effect("tapCause preserves defects and their category", () => Effect.gen(function* () {
  const error = failure()
  let observed = false
  const exit = yield* Effect.die(error).pipe(
    Effect.tapCause(() => Effect.sync(() => { observed = true })),
    Effect.exit,
  )
  expect(observed).toBe(true)
  expect(Exit.hasDies(exit)).toBe(true)
  expect(Exit.hasFails(exit)).toBe(false)
  expect(Exit.findErrorOption(exit)).toEqual(Option.none())
}))

it.effect("result captures expected failure but not defect or interruption", () => Effect.gen(function* () {
  const error = failure()
  const result = yield* Effect.result(Effect.fail(error))
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) expect(result.failure).toBe(error)

  const defect = yield* Effect.exit(Effect.result(Effect.die(error)))
  expect(Exit.hasDies(defect)).toBe(true)
  expect(Exit.hasFails(defect)).toBe(false)
  const interrupted = yield* Effect.exit(Effect.result(Effect.interrupt))
  expect(Exit.hasInterrupts(interrupted)).toBe(true)
  expect(Exit.findErrorOption(interrupted)).toEqual(Option.none())
}))

it.effect("ignore differs from explicit whole-cause suppression", () => Effect.gen(function* () {
  expect(Exit.isSuccess(yield* Effect.exit(Effect.ignore(Effect.fail(failure()))))).toBe(true)
  expect(Exit.hasDies(yield* Effect.exit(Effect.ignore(Effect.die(failure()))))).toBe(true)
  expect(Exit.hasInterrupts(yield* Effect.exit(Effect.ignore(Effect.interrupt)))).toBe(true)
  expect(Exit.isSuccess(yield* Effect.exit(Effect.ignoreCause(Effect.die(failure()))))).toBe(true)
}))

it.effect("scope releases once on success, typed failure, defect, and interruption", () => Effect.gen(function* () {
  const outcomes = [Effect.void, Effect.fail(failure()), Effect.die(failure()), Effect.interrupt]
  const categories: Array<string> = []
  for (const outcome of outcomes) {
    const events: Array<string> = []
    const exit = yield* Effect.exit(Effect.scoped(Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => { events.push("acquired"); return "resource" }),
        () => Effect.sync(() => { events.push("released") }),
      )
      return yield* outcome
    })))
    expect(events).toEqual(["acquired", "released"])
    categories.push(Exit.isSuccess(exit) ? "success"
      : Exit.hasFails(exit) ? "failure"
      : Exit.hasDies(exit) ? "defect" : "interruption")
  }
  expect(categories).toEqual(["success", "failure", "defect", "interruption"])
}))

it.effect("scoped child stops before its shared resource is released", () => Effect.gen(function* () {
  const events: Array<string> = []
  const started = yield* Deferred.make<void>()
  yield* Effect.scoped(Effect.gen(function* () {
    const resource = yield* Effect.acquireRelease(
      Effect.sync(() => ({ open: true })),
      (value) => Effect.sync(() => { value.open = false; events.push("released") }),
    )
    yield* Effect.forkScoped(Effect.gen(function* () {
      yield* Deferred.succeed(started, undefined)
      return yield* Effect.never
    }).pipe(Effect.ensuring(Effect.sync(() => { events.push(`child stopped: ${resource.open}`) }))))
    yield* Deferred.await(started)
  }))
  expect(events).toEqual(["child stopped: true", "released"])
}))

it.effect("interrupting the owner releases its acquired resource", () => Effect.gen(function* () {
  let releases = 0
  const acquired = yield* Deferred.make<void>()
  const owner = yield* Effect.forkChild(Effect.scoped(Effect.gen(function* () {
    yield* Effect.acquireRelease(Effect.succeed("resource"), () => Effect.sync(() => { releases++ }))
    yield* Deferred.succeed(acquired, undefined)
    yield* Effect.never
  })))
  yield* Deferred.await(acquired)
  yield* Fiber.interrupt(owner)
  expect(releases).toBe(1)
  expect(Exit.hasInterrupts(yield* Fiber.await(owner))).toBe(true)
}))

it.effect("idempotent GET retries eligible status and closes every attempt", () => Effect.gen(function* () {
  const signals: Array<AbortSignal> = []
  const client = HttpClient.make((request, _url, signal) => Effect.sync(() => {
    signals.push(signal)
    return HttpClientResponse.fromWeb(request, new Response("body", { status: signals.length < 3 ? 503 : 200 }))
  }))
  const task = yield* Effect.forkChild(getText(endpoint).pipe(Effect.provideService(HttpClient.HttpClient, client)))
  yield* TestClock.adjust("300 millis")
  expect(yield* Fiber.join(task)).toBe("body")
  expect(signals).toHaveLength(3)
  expect(signals.every((signal) => signal.aborted)).toBe(true)
}))

it.effect("eligible HTTP failures still stop at the configured attempt limit", () => Effect.gen(function* () {
  let attempts = 0
  const client = HttpClient.make((request) => Effect.sync(() => {
    attempts++
    return HttpClientResponse.fromWeb(request, new Response(null, { status: 503 }))
  }))
  const task = yield* Effect.forkChild(getText(endpoint).pipe(Effect.provideService(HttpClient.HttpClient, client)))
  yield* TestClock.adjust("300 millis")
  const exit = yield* Fiber.await(task)
  expect(attempts).toBe(3)
  expect(Exit.hasFails(exit)).toBe(true)
  expect(Exit.hasDies(exit)).toBe(false)
  const error = Exit.findErrorOption(exit)
  expect(Option.isSome(error) && error.value._tag === "@example/http/StatusFailure").toBe(true)
}))

it.effect("terminal HTTP status is preserved without retry", () => Effect.gen(function* () {
  let attempts = 0
  const client = HttpClient.make((request) => Effect.sync(() => {
    attempts++
    return HttpClientResponse.fromWeb(request, new Response(null, { status: 404 }))
  }))
  const exit = yield* getText(endpoint).pipe(Effect.provideService(HttpClient.HttpClient, client), Effect.exit)
  expect(attempts).toBe(1)
  expect(Exit.hasFails(exit)).toBe(true)
  expect(Exit.hasDies(exit)).toBe(false)
  const error = Exit.findErrorOption(exit)
  expect(Option.isSome(error)).toBe(true)
  if (Option.isSome(error)) {
    expect(error.value._tag).toBe("@example/http/StatusFailure")
    if (error.value._tag === "@example/http/StatusFailure") expect(error.value.status).toBe(404)
  }
}))

it.effect("response body failure is terminal rather than retried as transport failure", () => Effect.gen(function* () {
  let attempts = 0
  const client = HttpClient.make((request) => Effect.sync(() => {
    attempts++
    return HttpClientResponse.fromWeb(request, new Response(new ReadableStream({
      start(controller) { controller.error(new Error("broken response body")) },
    })))
  }))
  const exit = yield* getText(endpoint).pipe(Effect.provideService(HttpClient.HttpClient, client), Effect.exit)
  expect(attempts).toBe(1)
  expect(Exit.hasFails(exit)).toBe(true)
  expect(Exit.hasDies(exit)).toBe(false)
  const error = Exit.findErrorOption(exit)
  expect(Option.isSome(error) && error.value._tag === "@example/http/ClientFailure").toBe(true)
  if (Option.isSome(error) && error.value._tag === "@example/http/ClientFailure") expect(error.value.phase).toBe("body")
}))

it.effect("total deadline includes retries and cancels actual fetch signals", () => Effect.gen(function* () {
  const signals: Array<AbortSignal> = []
  // A foreign Promise adapter used only as a fake transport. It observes the
  // exact signal supplied by FetchHttpClient; no real network or timers run.
  const transport: typeof globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    const signal = init?.signal
    if (signal === undefined || signal === null) {
      reject(new Error("expected FetchHttpClient cancellation signal"))
      return
    }
    signals.push(signal)
    signal.addEventListener("abort", () => reject(signal.reason), { once: true })
  })
  const start = yield* Clock.currentTimeMillis
  const task = yield* Effect.forkChild(getText(endpoint).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, transport),
  ))
  yield* TestClock.adjust("5 seconds")
  const exit = yield* Fiber.await(task)
  expect((yield* Clock.currentTimeMillis) - start).toBe(5_000)
  expect(signals).toHaveLength(3)
  expect(signals.every((signal) => signal.aborted)).toBe(true)
  expect(Exit.hasFails(exit)).toBe(true)
  expect(Exit.hasDies(exit)).toBe(false)
  const error = Exit.findErrorOption(exit)
  expect(Option.isSome(error)).toBe(true)
  if (Option.isSome(error)) {
    expect(error.value._tag).toBe("@example/http/DeadlineExceeded")
    if (error.value._tag === "@example/http/DeadlineExceeded") expect(error.value.phase).toBe("total")
  }
}))
