# Memory implementation verification

Verified locally on 17 November 2026. These are deterministic engineering checks,
not measurements of real model answer quality.

## Reproduce

```sh
npm run typecheck
npm test
npm run build
```

For database tests, create a disposable database on the Docker PostgreSQL instance,
set `DATABASE_URL` to it and run `npm run db:migrate`. Then run:

```sh
TEST_DATABASE_URL=postgresql://chat:chat@localhost:5433/YOUR_TEST_DATABASE npm test
```

The optional suites create uniquely named fixture threads and remove them afterward.
They never call Gemini or Serper. They require the memory migration and pgvector.

## Evidence

The full deterministic suite passed 48 tests, including the optional PostgreSQL
and agent-loop suites (no skipped tests in that run).

- `tests/memory.test.ts`: calendar-week date policy, omitted years, invalid/ambiguous
  dates, DST and local midnight; reciprocal rank fusion; Ollama dimension validation,
  coalescing and failed-cache eviction; provider serialization/cooldown and bounded
  search concurrency; historical baseline/current-evidence gates.
- `tests/memory-database.test.ts`: atomic/idempotent commits, exact-date completeness
  with pagination, owner isolation, source invalidation, memory off, unanswered
  historical questions, vector persistence/retrieval, fact supersession and cascades.
- `tests/memory-agent.test.ts`: all three design prompts traverse both Gemini and OpenAI adapters with canonical context,
  memory, a tool call, synthesis, review, provenance persistence and final delivery.
  Mock answers intentionally share a simple price fixture: this proves execution
  and persistence contracts, not real five-vendor coverage or factual correctness.
- A local call to Ollama's installed `qwen3-embedding:0.6b` returned a finite,
  nonzero 1,024-dimensional vector. No live Google model requests were used.
- Migrations succeeded on a fresh disposable database and the local application DB.
- TypeScript and production build passed. Repository-wide Biome checking reports
  existing autofocus and effect-dependency errors outside the memory implementation;
  checks on the implementation files pass.

## Three manual walkthroughs

1. Enable Memory and Web. Ask for a five-vendor CRM shortlist for 20 seats. In a new
   thread ask which shortlisted vendors changed pricing/releases since that date.
   Inspect the historical source links and per-claim evidence limitations.
2. Ask two questions on one day. In another thread ask what you asked on that ISO
   date and whether the answers remain correct. Date lookup includes both questions;
   more than 20 results advertises pagination rather than silently claiming completeness.
3. Discuss Postgres hosting. In a later thread ask about changes since the original
   date. Disable Web and repeat: historical recall remains available, but current
   validity must be unverified. Disable Memory: cross-thread recall is unavailable.

## Limits

No live claim-support accuracy, extraction precision/recall, retrieval recall@k,
provider cost, or production latency benchmark has been established. The reviewer
shares the generator's model and can share its mistakes. Source-span matching checks
provenance, not semantic entailment. Search uses provider excerpts rather than full
page reading. Existing pre-memory chats are not automatically indexed. Local jobs
resume when the first chat request starts the worker after a process restart.
