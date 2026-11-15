# Chat Sync Layer, Optimistic UI, and SSR Strategy

This document describes the performance/sync approach for the chat experience (TanStack Start + Convex), current optimizations, and the target architecture for a best-in-class sync layer with SSR.

## Goals

- **Instant perceived response** on send: no flash back to home, no waiting for AI title generation.
- **Optimistic UI**: render user intent immediately (pending thread/message/title/streaming state), then reconcile with authoritative data.
- **Reliable sync**: idempotent writes, resumable streams, and eventual consistency without duplicate or lost messages.
- **SSR for performance & security**: fast first paint/streaming HTML where safe, and server-side enforcement of access control (never leak private thread data).

## Current implementation (this repo)

### Optimistic/parallel chat start
- `src/components/chat/chat-home.tsx`
  - On submit, immediately switches to an **optimistic chat view** (user message + "Thinking…") to avoid a home-screen flash.
  - Creates the thread with a fast fallback title, persists the user message, and navigates to `/thread/$threadId`.
  - **Title generation runs in background**; when complete it renames the thread (Convex reactive queries update UI/sidebar).
  - Tracks title-generation state in the chat store so the sidebar can show progress.
- `src/store/chat-store.ts`
  - Holds optimistic sync hints: `pendingAutoSend`, `pendingInitialMessage`, `generatingTitleThreadIds`.
- `src/routes/_chat.thread.$threadId.tsx`
  - Renders `pendingInitialMessage` optimistically if it is not yet present in Convex query results.
  - Starts/continues the assistant response flow while persistence/query catches up.
- `src/components/app-sidebar.tsx`
  - Shows a **skeleton indicator** while a thread title is being generated.

### Existing reliability primitives
- Client-generated UUIDs for idempotent thread/message creation (`clientUuid`).
- Convex reactive queries as the reconciliation source of truth.
- Stream/resume plumbing (`streamId`, thread streaming state, resumable stream endpoint/context).

## Sync layer model (target)

A robust sync layer for chat should treat the client as an offline-capable replica with an outbox:

1. **Intent capture (optimistic)**
   - User action creates an operation with `clientUuid`/`opId`, applied to local UI immediately.
   - States: `pending -> synced | failed (retryable) | conflict`.
2. **Durable outbox (for best reliability/offline)**
   - Persist pending operations and optimistic entities in IndexedDB.
   - Replay in-order/per-entity on reconnect/app start with backoff and dedupe.
3. **Idempotent server mutations**
   - All create/append operations accept client IDs and are safe to retry.
   - Prefer a unified chat mutation/endpoint that atomically: ensures thread, inserts user message, appends stream id/state, and triggers assistant/title work.
4. **Reconciliation**
   - Server/reactive state wins; merge by stable keys (`clientUuid`, message id/stream id).
   - Keep optimistic placeholders until authoritative entity arrives or operation fails.
5. **Conflict handling**
   - Edits/regenerations: use causal metadata (version/updatedAt/baseMessageId) and explicit conflict UI when needed.
   - Streaming: reconcile partial stream text with final persisted assistant message.

`src/lib/sync-layer.ts` provides lightweight primitives/helpers aligned with this model (queue/status/reconciliation utilities) to build on.

## SSR strategy (TanStack Start + Convex)

### What to SSR (performance)
- **App shell and route structure** via TanStack Start SSR/streaming for fast TTFB/FCP.
- **Public, non-sensitive thread views** can be server-prefetched (e.g. via `ConvexHttpClient`) and rendered/hydrated for immediate content.
- **Private/authenticated threads**: SSR only after server-side auth + authorization; otherwise render a secure loading/placeholder shell and hydrate on client.

### Security requirements
- Never embed or prefetch private thread/message data without verifying the requesting user on the server.
- Enforce access control at the data layer (Convex queries/mutations must validate ownership/public visibility) — client checks are not sufficient.
- Avoid leaking thread existence/content via timing or error differences where possible; return uniform not-found/unauthorized responses for private resources.
- Keep secrets/server-only keys off the client; streaming endpoints must validate entitlements.

### Recommended implementation steps
1. Add route loaders for thread routes to coordinate auth and (when safe) prefetch data; use deferred/streaming rendering for slow parts.
2. Introduce server-side Convex fetching for eligible SSR paths and hydrate into the client cache.
3. Move toward a unified server chat action to reduce client round-trips and centralize auth, persistence, and stream lifecycle.
4. Persist and expose stream state for reconnect/resume so SSR/refresh never loses in-flight responses.
5. Add telemetry (time-to-first-token, navigation-to-stream-start, title latency) to guide further tuning.

## Notes
- The current changes prioritize eliminating blocking UX (title gen/navigation flash) and making state transitions optimistic.
- Full offline outbox + SSR-authenticated prefetch are incremental next steps on top of these primitives.
