# .Chat

The existing TanStack Start + React + Convex chat app, now with short-term context, long-term conversation memory, asynchronous memory synchronization and an evidence-review stage.

## Run

```sh
npm install
cp .env.example .env.local
# Configure Convex, database and authentication settings.
docker compose up -d
npm run db:migrate
```

Generate a private `AGENT_BRIDGE_SECRET` and put the same value in `.env.local` and the chosen Convex development deployment. Never prefix it with `VITE_` or commit it. Convex provides the public HTTP origin used for `VITE_CONVEX_SITE_URL`.

```sh
npx convex env set AGENT_BRIDGE_SECRET
# Paste the secret via stdin when prompted.
npm run dev
```

Open [localhost:3000](http://localhost:3000), sign in, and set your Gemini key and one web-search provider key in the existing Settings screens. Tavily, Brave, Serper and Firecrawl remain supported. Keys stay in encrypted user settings. Memory no longer requires Supermemory or another API key. Mailpit runs at [localhost:8025](http://localhost:8025).

## What the UI does

Preparing appears immediately after submit. The response stream reports loading context, researching, checking claims and saving. In strict review mode, answer text is released after review and persistence; it is deliberately not raw token streaming. A failed check shows an error rather than storing the draft. Optional Redis retains stream replay across reloads; final messages remain in Convex either way.

Short-term context is the recent saved conversation. With Memory enabled, reviewed exchanges are copied asynchronously into an owner-scoped searchable archive and retrieved on later turns. Turning Memory off stops long-term retrieval and new archival; it does not erase existing records. The first implementation archives new accepted turns, not every pre-existing conversation. Edited, deleted or archived sources are excluded from retrieval. Full retention/deletion controls and stronger historical retrieval remain follow-up work.

## Code map

- `src/routes/api/chat.ts`: request boundary; delegates credentials and streaming to focused modules.
- `src/lib/agent/dispatch.server.ts`: authenticated, signed dispatch using existing BYOK settings.
- `src/lib/agent/transport.ts`: immediate progress, resume fallback and disconnect-safe delivery.
- `convex/agent/http.ts`: research, evidence review, commit and progress events.
- `convex/agent/state.ts`: server-side context, run concurrency, watchdog and atomic commit.
- `convex/agent/memory.ts`: durable idempotent memory projection.
- `src/lib/agent/`: shared policy, signing, progress and validation contracts.
- `src/lib/stream-reader.ts`: progress/text/tool events, explicit errors and truncated-stream detection.

See [DESIGN.md](DESIGN.md) for the reasoning and tradeoffs.

## Verification

```sh
npm run verify
# Or run individual checks:
npm run typecheck
npm run check
npm test
npm run test:convex
```

Tests use no model keys. Live model quality and end-to-end latency still require evaluation. The older public Convex message/thread APIs still require an authentication hardening pass before public multi-user deployment; the new agent state and memory functions are internal and reached through the authenticated bridge.
