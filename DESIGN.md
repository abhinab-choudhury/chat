# Architecture Design — .Chat

A real-time AI chat app: **TanStack Start (React 19, SSR)** frontend, **Convex** as the
database + reactive sync engine, **Better Auth + Postgres (Drizzle)** for identity and
encrypted BYOK settings, and **AI SDK v5** server routes for streaming model calls.

## How it works

**Data & sync.** Convex is the single source of truth. Threads and messages live in
Convex tables (with `clientUuid` for idempotent client-generated writes); clients
subscribe via `useQuery`, which re-runs on server writes and pushes over WebSocket —
no refetching anywhere. Per-user disk caches (`convex-cached-query`, `local-chat-cache`)
give instant paints on reload; server state always wins on reconcile.

**Chat flow.** `POST /api/chat` is the one hot path. It authenticates, loads the
user's *decrypted-on-server* provider key (BYOK — keys never reach the browser),
resolves project prompt/model context, marks the thread live, then streams
`streamText` as compact NDJSON events (`t` text / `r` reasoning / `tool` / `e` end).
The stream is tee'd: one branch feeds the client, one is drained in the background so
generation and finalization (persist assistant message, unmark live) complete even if
the tab closes. With `REDIS_URL`, `resumable-stream` records the stream in Redis so a
reload can resume mid-response instead of losing it.

**Optimistic UI.** First message: create thread + persist user message + navigate in
parallel; a placeholder renders immediately while background title generation renames
the thread reactively. `sendMessage` uses Convex optimistic updates; the client
streams into a local store until the finalized assistant message lands.

**Tools & memory.** Web search is an AI SDK tool built from a pluggable adapter set
(Tavily, Brave, Serper, Firecrawl) with the provider/key from encrypted user settings;
tool calls/results flow through the stream into persisted `toolData`. Memory is
Supermemory (`withSupermemory`, per-user namespace), server-keyed and opt-in. Model
choice, reasoning effort, tool toggles, and per-thread MCP overrides live in a Zustand
`model-store`.

## Why built this way

- **Convex-first** because a sync engine is server store + subscriptions + transactions;
  Convex provides all three, so chat is real-time out of the box and we don't maintain
  a WebSocket layer or backplane.
- **One NDJSON endpoint** instead of the AI SDK's default protocol to keep the event
  format tiny, own the tool/reasoning event mapping, and guarantee server-side
  finalization independent of client lifecycle.
- **BYOK encrypted at rest** (AES server-side) with provider calls only from the
  server — better security posture and zero shared key costs.
- **Adapters over vendor lock-in**: search providers behind one interface; Supermemory
  as a swappable wrapper around the model, not hardcoded into it.
- **Thin routes, fat hook**: `useThreadChat` owns thread logic; route files stay
  presentational.

## Considered and rejected

- **Redis pub/sub fan-out as core sync** — redundant with Convex's own push; kept Redis
  only for resumable streams (transient transport, not a second source of truth).
- **PowerSync/Replicache offline layer** — full offline-first isn't needed yet; Convex
  + local caches + idempotent mutations cover the common blips. Revisit if offline
  writes become a requirement.
- **Storing plaintext keys / env-only keys** — plaintext leaks, env-only keys block
  true BYOK; chose encrypted per-user storage.
- **Server-side markdown/stream diffing** — premature; client reconciles by stable
  keys (`clientUuid`, stream id) today.

## With another week

The detailed, file-level plan lives in `docs/next-week-plan.md`. In priority order:

1. **Chat folders (projects)** — the data model is done (`projects` table, thread
   `projectId`), but only `getProject` exists: add CRUD + a move-thread mutation,
   a sidebar folders section, and the `/library` pages. Wire the project
   `customPrompt`/`defaultModel` that `/api/chat` currently fetches and discards.
2. **File uploads & management** — Convex storage-backed attachments (schema field,
   upload-URL + authenticated file URLs, `sendMessage` metadata), composer chips
   using the existing `Attachment` kit, server-side model context from persisted
   messages, and image/text rendering in messages.
3. **Micro-interactions & animations** — message enter/caret/typing/shimmer
   keyframes in `styles.css` (tw-animate-css is already there), respecting
   `prefers-reduced-motion`.
4. **Mobile responsiveness** — composer safe-area + wrapping controls, touch
   targets, mobile action affordances, and a fixed-viewport-height/scroll-anchoring
   bug pass.
5. **PostHog integration** — the provider and a reverse proxy already exist; wire
   the SDK through `/api/phr`, add client-side page views, identify signed-in
   users, and instrument chat/product events (see `docs/next-week-plan.md` §5).
6. Then the previously queued items: memorization layer (per-user Supermemory keys
   + memory UI) → Supermemory/MCP as first-class tools → configurable tool
   registry → provider registry for models → sync engine v2 (durable outbox +
   unified chat mutation + time-to-first-token telemetry).
