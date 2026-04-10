# TypeScript Patterns Checklist

## 1. No `as any`

Never use `as any` to silence the compiler. It hides real type errors and defeats the purpose of TypeScript.

```typescript
// GOOD — decode unknown data with Schema
const frame = Schema.decodeUnknownSync(BotGatewayServerFrame)(JSON.parse(payload))

// GOOD — use satisfies to validate shape instead of casting
Layer.provide(Layer.succeed(BotRpcClientConfigTag, {
  backendUrl: BACKEND_URL,
  botToken: BOT_TOKEN,
}))

// BAD — casting branded IDs to any in tests
const commandContext = {
  commandName: "echo",
  channelId: CHANNEL_ID as any,
  userId: USER_ID as any,
  orgId: ORG_ID as any,
}

// BAD — empty mock with zero type safety
Layer.provide(Layer.succeed(BotRpcClient, {} as any))
```

If a third-party library returns `any`, wrap it immediately with a typed function or `Schema.decodeUnknown` rather than letting `any` leak into your code.

## 2. Prefer `satisfies` Over `as`

Use `satisfies` to validate a value matches a type **without widening or lying**. Use `as` only at truly opaque FFI boundaries where no better option exists.

```typescript
// GOOD — satisfies on service implementations in Layer.effect
export const InMemoryGatewaySessionStoreLive = Layer.effect(
  GatewaySessionStoreTag,
  Effect.gen(function* () {
    const offsetsRef = yield* Ref.make(new Map<BotId, string>())
    return {
      load: (botId) => Ref.get(offsetsRef).pipe(Effect.map((offsets) => offsets.get(botId) ?? null)),
      save: (botId, offset) => Ref.update(offsetsRef, (offsets) => { ... }),
    } satisfies GatewaySessionStore
  }),
)

// GOOD — satisfies validates Schema shape at construction
sendFrame({
  op: "HEARTBEAT",
  sessionId: sessionId ?? undefined,
} satisfies Schema.Schema.Type<typeof BotGatewayHeartbeatFrame>)

// GOOD — satisfies on config objects
return {
  electricUrl,
  electricSourceId,
  databaseUrl,
  isDev,
  port,
} satisfies ProxyConfig

// GOOD — as const satisfies for typed records
const providers = {
  discord: discordAdapter,
  slack: slackAdapter,
} as const satisfies Record<string, ChatSyncProviderAdapter>

// BAD — as hides mismatches, typos go undetected
return Effect.succeed({
  getMessageActor: (messageId: string) => ...,
  client,
  botToken: config.botToken,
} as ActorsClientService)
```

`as const` is fine — it narrows rather than widens.

## 3. Don't Manually Annotate Inferred Types

Effect's type system infers Layer compositions, service types, and Effect return types precisely. Manual annotations are redundant, drift-prone, and often wrong.

```typescript
// GOOD — Layer.effect infers the Layer type from the tag
export const InMemoryBotStateStoreLive = Layer.effect(
  BotStateStoreTag,
  Effect.gen(function* () {
    const stateRef = yield* Ref.make(new Map<BotId, Map<string, string>>())
    return { ... } satisfies BotStateStore
  }),
)

// GOOD — Effect.fn infers return type
const encrypt = Effect.fn("IntegrationEncryption.encrypt")(function* (token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = yield* Effect.tryPromise({ ... })
  return {
    ciphertext: Buffer.from(ciphertext).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    keyVersion: currentKeyVersion,
  } satisfies EncryptedToken
})

// BAD — manual Layer type annotation
const MainLayer: Layer.Layer<ServiceA | ServiceB, DatabaseError, Database> = ServiceA.Default.pipe(
  Layer.provideMerge(ServiceB.Default),
  Layer.provide(Database.Default)
)

```

This applies to:
- **Layer compositions** — never annotate `Layer.Layer<...>` on composed layers
- **Service definitions** — let `Effect.Service` / `Effect.Tag` infer the shape
- **Stream types** — never annotate `: Stream.Stream<...>` when composing streams

Explicit `: Effect.Effect<A, E, R>` annotations are fine on plain arrow functions wrapping `Effect.gen`, on interface method signatures, and on public library API surfaces.
