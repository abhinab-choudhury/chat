# Sync Engine Fundamentals (for this chat app)

> Companion to `research/offline-sync-layer.md` (offline-first deep dive). This doc
> answers the "how does the sync engine actually work" question and how to build
> one like T3 Chat on top of Convex (+ optional Redis), with only a Gemini key.

## 0. TL;DR (read this first)

- **A "sync engine" is not a library you install.** It is three things glued
  together: a **server store**, a **subscription protocol**, and a **client
  cache**. Convex gives you all three out of the box (queries + mutations +
  WebSocket sync). That is why T3 Chat can be "just Convex".
- **Redis pub/sub is an add-on for scale, not a requirement.** It solves
  *cross-instance fan-out*: when you run >1 server process, a mutation on
  process A must reach clients connected to process B. Redis `PUBLISH`/`SUBSCRIBE`
  is the cheapest way to broadcast that. Convex already does this internally
  (its sync worker pushes to every connected client), so you only need Redis if
  you bolt on your own WebSocket layer.
- **For development with only a Gemini key:** use Gemini for the AI reply and
  Convex for sync. OpenAI/Anthropic are optional env vars; the code already
  guards them. See §6.
- **Free-tier Gemini models you can actually call** (Standard service, free of
  charge): `gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.6-flash`,
  `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`. Detect at runtime via
  `models.list` (§6.2).

---

## 1. The three primitives of any sync engine

| Primitive | What it is | Convex equivalent | Redis equivalent |
|---|---|---|---|
| **Server store** | Authoritative data + transactional writes | Convex DB (document-relational) | Redis keys / sorted sets |
| **Subscription** | "Tell me when X changes" | `useQuery` over WebSocket | `SUBSCRIBE channel` |
| **Mutation** | "Change X, then notify subscribers" | `mutation` (transactional) | `PUBLISH channel payload` + `ZADD` |

Everything else (optimistic updates, offline queue, presence, typing
indicators) is built on top of these three.

The mental model T3 Chat uses:

```
client input ──► mutation (server, transactional) ──► DB write
                                         │
                                         ▼
                              subscription re-runs query
                                         │
                                         ▼
                              WebSocket pushes new result
                                         │
                                         ▼
                              React re-renders (no manual refetch)
```

No `fetch`, no `refetchInterval`, no "invalidate queries". The server tells
the client when data changed because it *knows* (it ran the transaction).

---

## 2. How Convex's sync engine works (the part you must understand)

Convex's sync engine = **database + deterministic query functions + mutation
transactions + WebSocket push**.

### 2.1 Queries are subscriptions, not fetches

```ts
const messages = useQuery(api.chat.getMessages, { threadId });
```

- The first call runs `getMessages` on the server and returns the result.
- Convex records the **read set**: every document/index the query touched.
- The client keeps the WebSocket open. When any document in the read set
  changes (because some mutation wrote it), Convex re-runs the query and pushes
  the new result.
- You never call `refetch`. The `useQuery` value just updates.

### 2.2 Mutations are transactions

```ts
export const sendMessage = mutation({ ... handler: async (ctx, args) => {
  await ctx.db.insert("messages", { ... });
} });
```

- Mutations run **serializably** on the server. No race conditions between
  concurrent writes to the same document.
- A mutation either fully commits or throws; partial writes are impossible.
- After commit, every query whose read set intersects the written documents
  re-runs. That is the "sync" part.

### 2.3 Optimistic updates (the "instant" feel)

Convex supports client-side optimistic updates: you update the local cache
immediately, then the server confirms or rejects. If rejected, Convex rolls
back automatically. This is what makes chat feel instant even though the
authoritative write happens on the server.

### 2.4 The WebSocket protocol

- Client opens `wss://<deployment>.convex.cloud/api/<version>/sync`.
- Messages are JSON envelopes with a `type` discriminator (subscribe,
  mutation, transition, etc.).
- On reconnect, the client sends its last observed timestamp; the server
  replays missed mutations. This is the "network blip" handling — Convex
  handles intermittent drops but NOT full offline (no durable local store).

### 2.5 What Convex does NOT do

- No offline-first durable store (no IndexedDB/SQLite on the client).
- No client-side SQL.
- No cross-device conflict resolution beyond "server wins".

If you need those, layer PowerSync/Replicache on top (see
`offline-sync-layer.md`). For T3 Chat-style UX (online, multi-tab, instant),
Convex alone is enough.

---

## 3. Redis pub/sub: what it is and when you need it

### 3.1 The problem it solves

Imagine you run 3 Node processes behind a load balancer. A user on process A
sends a message. Process A's in-memory WebSocket clients get the update. But
users connected to processes B and C do not — they have separate in-memory
state. You need a **backplane**.

Redis pub/sub is the backplane:

```
Process A: PUBLISH chat:thread:123  '{"type":"new_message",...}'
Redis:     fans out to all subscribers
Process B: receives → forwards to its local WebSocket clients
Process C: receives → forwards to its local WebSocket clients
```

### 3.2 Semantics you must accept

- **At-most-once delivery.** If a subscriber is disconnected at publish time,
  the message is gone. Redis pub/sub is a *transport*, not a queue.
- **No persistence, no replay, no acks.** If you need those, use Redis
  Streams (consumer groups) instead.
- **Transient by design.** Use pub/sub for ephemeral signals: new message
  notifications, typing indicators, presence, cache invalidation. Use the DB
  (Convex/Redis sorted sets) for durable history.
- **Pattern subscriptions** (`PSUBSCRIBE chat:*`) let one subscriber catch
  many channels. Useful but beware: a single slow subscriber can lag.

### 3.3 The canonical chat architecture (ByteByteGo / Redis tutorial)

```
Stage 1 — Connection init
  1. Client opens WebSocket to app server
  2. Server opens a Redis connection for publishing writes
  3. Server subscribes on Redis for the rooms the user cares about
  4. Server loads history from Redis sorted set (ZREVRANGE) → client

Stage 2 — Message handling
  1. Client sends message over WebSocket
  2. Server ZADDs to sorted set (score = timestamp) for durable history
  3. Server PUBLISHes to channel "messages" for fan-out
  4. All subscribed servers receive → push to their local clients
```

Data structures used:
- Sorted set per room: `room:<id>:messages` (score = ms timestamp) → history.
- Set per room: `room:<id>:members` → presence.
- Hash per user: `user:<id>` → session metadata.
- Channel: `MESSAGES` (or sharded `chat:<threadId>`) → fan-out.

### 3.4 Do you need Redis with Convex?

**No, for the Convex-native path.** Convex's sync worker is the backplane:
it pushes mutations to every connected client across all processes. You only
add Redis when you:
- Run your own WebSocket layer (Socket.IO, custom) instead of Convex's.
- Need a cache to reduce Convex reads (T3 Chat does this: "viewport caching,
  50 messages at a time, ~80% fewer reads when switching threads").
- Need pub/sub for non-Convex services (AI streaming, presence, typing).

T3 Chat (clone) pattern: Convex = source of truth + reactive sync; Redis
(Upstash) = optional read cache + cross-tab dedup. Falls back gracefully if
Redis is unavailable. That is the pattern to copy.

### 3.5 Redis pub/sub vs Redis Streams (decision rule)

| Need | Use |
|---|---|
| Ephemeral fan-out, presence, typing, cache invalidation | pub/sub |
| Durable history, replay, at-least-once, consumer groups | Streams (or your DB) |
| Single source of truth for chat history | Convex (or Postgres), NOT Redis |

---

## 4. How T3 Chat (and this repo's clone) actually syncs

From `tricodex/c3chat` (Convex + optional Redis):

- **Messages**: Convex table `messages` with `threadId`, `role`, `content`,
  `clientUuid`. Real-time via `useQuery(api.chat.getMessages)`.
- **Sync engine v2** (`scalable-sync-engine-v2.tsx`):
  - Smart sync detection: only push significant changes (streaming messages
    sync only if content grew >100 chars; a finished stream always syncs).
  - Debounce: 300ms stable, 1000ms while streaming.
  - Dedup by `clientUuid` (fixes React key warnings).
- **Redis cache** (optional): viewport of 50 messages; reduces Convex reads
  ~80% on thread switch; falls back if unavailable.
- **Multi-tab**: Convex handles cross-tab sync automatically via WebSocket.
- **API keys**: encrypted server-side (AES-256-GCM) in Postgres and scoped to
  the signed-in user; plaintext keys never reach the browser.

The lesson: **start with Convex-native sync. Add Redis only after measuring
read costs.** Premature Redis = two sources of truth to keep consistent.

---

## 5. Applying this to OUR repo (what we just built)

Files changed:
- `convex/schema.ts` — added `threads`, `messages` tables with indexes.
- `convex/chat.ts` — `listThreads`, `getThread`, `createThread`, `renameThread`,
  `archiveThread`, `getMessages`, `sendMessage` (idempotent via `clientUuid`),
  `appendMessage` (streaming).
- `src/lib/convex.ts` — `ConvexReactClient` from `VITE_CONVEX_URL`.
- `src/routes/__root.tsx` — wraps app in `ConvexProvider`.
- `src/routes/_chat.thread.$threadId.tsx` — subscribes with `useQuery`, sends
  with `useMutation`, AI reply via server function.
- `src/components/chat/chat-home.tsx` — creates a thread on first submit and
  navigates to it.
- `src/lib/ai.functions.ts` — server function calling Gemini with the
  signed-in user's encrypted provider key.

Data flow (the sync engine in action):
```
ChatHome submit
  → createThread mutation (Convex transaction) → threads row
  → navigate to /thread/$threadId
Thread page
  → useQuery(getMessages) opens WebSocket subscription
  → user types → sendMessage mutation (user msg) → Convex commits
  → Convex re-runs getMessages → WebSocket pushes → React re-renders
  → generateReply server fn calls Gemini
  → sendMessage mutation (assistant msg) → same propagation
```

Every step after the mutation is automatic. That is the sync engine.

---

## 6. Gemini-only development (no OpenAI/Anthropic keys)

### 6.1 You can develop with only Gemini

- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are not required. The codebase already
  conditionally registers social/OAuth providers and treats AI keys as optional.
- Gemini configuration: enter a provider key during onboarding or in
  Settings → AI Provider. It is encrypted server-side and never sent back to the
  browser, so no `GEMINI_API_KEY` environment variable is needed.
- Pick a free-tier model: `gemini-3.5-flash-lite` is the cheapest/fastest and
  has a free tier. `gemini-3.8-flash` for better quality.

### 6.2 Detecting which models a user's key can use

Gemini's `models.list` endpoint returns the models accessible to that key, with
`supportedGenerationMethods`. A free-tier key simply cannot see/bill paid-only
models (paid models return 403/404). So:

```ts
GET https://generativelanguage.googleapis.com/v1beta/models?key=KEY
```

Filter `supportedGenerationMethods` includes `"generateContent"`. Then intersect
with a curated allow-list of free text models:

```ts
const FREE_TEXT_MODELS = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];
```

Implementation in `src/lib/gemini.ts`:
- `listGeminiModels(apiKey)` — raw list.
- `detectFreeGeminiModels(apiKey)` — intersection.
- `testGeminiKey(apiKey, model)` — smoke test via `generateContent`.

Show the user: "Your key can use: X, Y, Z. Free tier: yes/no." If
`detectFreeGeminiModels` returns empty, the key is likely paid-only or invalid.

### 6.3 Rate limits on the free tier (rough)

Free tier is generous but bounded: ~15 RPM / 1M TPM / 1500 RPD for Flash-Lite
(varies by model and region; check the pricing page). For dev, add a small
retry/backoff and cache responses. Don't run load tests on a free key.

---

## 7. Learning path (do these in order)

1. Run the Convex tutorial chat app (`npx create convex` → chat template) to
   feel queries/mutations/subscriptions.
2. Read `stack.convex.dev/how-convex-works` (the sync engine deep dive).
3. Implement our `convex/chat.ts` (done) and run `bunx convex dev` + `bun dev`.
4. Open two browser tabs, send a message in one, watch it appear in the other
   (proves sync).
5. Add Redis only after you measure read costs (Upstash free tier is enough).
6. Add offline writes only if needed (PowerSync) — see `offline-sync-layer.md`.

## 8. Common pitfalls

- **Forgetting that `useQuery` is reactive.** Don't call `refetch`; just
  mutate and let the subscription update.
- **Mutating inside a query.** Queries must be pure reads. Writes go in
  mutations.
- **Client-allocated IDs.** Convex `_id` is server-allocated. Use `clientUuid`
  for idempotency (we do) and map in mutations.
- **Leaking auth.** Every mutation must call `requireUser` and check ownership.
  Sync Streams must filter by `auth.user_id()`.
- **Stale local state after logout.** Clear caches/queues on sign-out.
- **Treating Redis pub/sub as durable.** It is not. History lives in Convex.

## 9. References

- Convex sync platform — https://www.convex.dev/sync
- How Convex works — https://stack.convex.dev/how-convex-works
- Convex chat tutorial — https://docs.convex.dev/tutorial
- Redis pub/sub — https://redis.io/docs/latest/develop/pubsub
- Redis chat app tutorial — https://redis.io/tutorials/howtos/chatapp
- ByteByteGo Redis chat — https://bytebytego.com/guides/build-a-simple-chat-application/
- c3chat (Convex + Redis clone) — https://github.com/tricodex/c3chat
- PowerSync + Convex — https://powersync.com/blog/convex-powersync-design-notes
- Gemini pricing (free tier) — https://ai.google.dev/gemini-api/docs/pricing
- Gemini models list — https://ai.google.dev/gemini-api/docs/models