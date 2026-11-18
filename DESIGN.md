# .Chat design decisions

Current design rationale, checked against the implementation on 18 November 2026.
[ARCHITECTURE.md](ARCHITECTURE.md) is the reference for modules, endpoints, schemas and numeric limits. This document replaces the earlier theoretical proposal; unimplemented ideas are identified explicitly below.

## Purpose and evaluation scenarios

.Chat is a memory-aware conversational research assistant. Its distinguishing task is to recover a historical exchange, find current evidence, and distinguish what it previously said from what can be established now.

Three motivating scenarios are:

1. “On Monday we shortlisted five CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?”
2. “What did I ask you on 3 November? Is your answer still correct today?”
3. “Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?”

These scenarios guide implementation and fixtures. They are not proof of measured live answer quality, and no external hiring rubric is asserted here.

## Decisions and consequences

| Decision | Reason | Consequence |
| --- | --- | --- |
| TanStack Start on Node with one server-side agent pipeline | Keep UI, HTTP boundaries and backend code in one project | Long-running producer work depends on the process staying alive |
| PostgreSQL + Drizzle + pgvector | Keep source history, memory, transactional commits and hybrid search together | Requires a real database and extension setup; SQLite is not supported |
| Environment-owned credentials | Prevent browser settings from receiving provider secrets | All browser scopes share the deployment's provider budget |
| Anonymous browser scope | Avoid an account/login flow for this application | Cookie identity is not authentication; no trusted multi-tenant security guarantee |
| Server-reconstructed conversation | Preserve canonical history independently of browser cache | Client history remains in the request contract but is not generation authority |
| One draft/tool loop with conditional review | Permit research without a separate execution architecture for each request type | Research may require several model calls and a second review pass |
| Commit before final answer delivery | Display the persisted answer rather than an unsaved draft | Progress streams immediately, but answer text is buffered |
| Atomic answer and memory projection | Avoid delivering a completed memory-enabled answer before its episode exists | Memory transaction work is on the answer path; embeddings alone are deferred |
| Local embeddings | Separate retrieval enrichment from paid generation quotas | Missing Ollama reduces recall to lexical search and delays indexing |
| Optional Redis replay | Support reloads without making Redis the canonical history store | Replay helps reconnects, not process-crash recovery of computation |

## What memory means

Working context, episodic memory and user facts have separate responsibilities:

- **Working context** contains bounded recent messages from the current thread. It applies even when cross-thread memory is disabled. The budget is in characters, not measured tokens.
- **Episodes** preserve a completed exchange with source IDs, source text snapshots, question time and evidence metadata. They represent what happened then, not verified current world knowledge.
- **User facts** represent explicit assertions or preferences from the current user question. The draft supplies structured keys and supporting quotes. Persistence rejects quotes absent from the question and versions assertions through supersession.

A quoted substring is a provenance check, not a proof that the extracted meaning is correct. Scope-aware fact keys are model-produced, and substring validation does not enforce semantic equivalence. There is no separate fact-verifier model or calibrated confidence threshold.

Only eligible memory-enabled turns create episodes. Disabling memory does not delete existing records, remove current-thread context, or disable ordinary message persistence. A blocked review saves its explanatory answer without creating a memory projection for that turn.

Archive excludes a projection from recall and can be reversed. Forget excludes the projection and removes its associated facts/jobs in the API while keeping source chat history. Neither operation claims to erase backups or all copies in browser storage. Editing sources makes mismatching projections ineligible for relevant reads; there is no automatic comprehensive re-extraction or historical backfill service.

## Recall policy and coverage

Exact historical dates take a database query path rather than a semantic top-k path. A deterministic resolver interprets the supported grammar in the browser-supplied timezone and returns a labeled date range. Calendar boundaries account for timezone transitions. Ambiguous recognized dates are clarified instead of silently broadening the query.

Exact-date pagination is exhaustive only within the query's eligible records: unarchived/unforgotten source-valid episodes and qualifying incomplete memory-enabled runs. It cannot honestly claim to list every question ever typed. Memory-off exchanges and questions that never received a run are outside that index.

Topic retrieval fuses full-text and vector ranks rather than adding incomparable raw scores. It returns bounded candidates, coverage metadata and recent current facts. Initial recall is supplemented by on-demand `search_memory` and `read_episode` tools. Retrieval can still miss paraphrases, choose irrelevant facts, truncate context or lack embeddings. There is no reranker, HyDE, entity graph, multi-vector memory, hierarchical summary layer or learned retrieval weighting.

## Evidence and historical comparisons

A defensible comparison separates four things:

1. The prior answer's actual wording.
2. Evidence stored with that historical answer.
3. Evidence retrieved for the current request.
4. Whether those observations establish a change and, separately, its effective date.

The draft comparison ledger supports `still supported`, `changed`, `prior answer unsupported`, `conflicting evidence`, and `unable to verify`. Host checks reject unknown baseline IDs and current URLs absent from the request's evidence set. Supported comparison verdicts require a quote from the baseline answer and current evidence. A `changed` verdict additionally requires historical evidence to exist.

These are minimum provenance constraints. They do not mechanically prove a price changed, validate every timestamp, or normalize billing terms. Currency, region, plan, seats, annual/monthly billing, tax and promotional conditions still need model review. A newly retrieved undated page is an observation now, not proof of when the vendor changed it. Lack of search results is not evidence of no change.

Search currently uses Serper excerpts with automatic page scraping disabled in the active agent wrapper. URLs and excerpt lengths are normalized and bounded; query execution is deduplicated per request. There is no active `read_source` tool, constrained page crawler, publication-date extractor or independent source-quality scoring service.

## Generation and review

All turns use the same structured draft pipeline. The model decides which available tools to call within host budgets. Comparison recognition uses a regex heuristic; current-information keywords and attempted searches also trigger review. This is not a general semantic intent classifier, so paraphrased requests can evade the heuristic.

Ordinary conversation can complete in one model call. Tool continuations can expand draft generation to five steps, followed by one additional review call when required. Provider-level retries can add network attempts beyond those logical calls. The review uses the same selected model, so correlated errors remain possible.

Review assesses supplied evidence and emits supported/qualified/blocked output. Citation URL checks reject unrecognized web links for reviewed answers. Valid URLs alone do not establish claim support. A blocked result becomes an explicit inability-to-verify response instead of publishing the draft as a verified answer.

The product streams status and search summaries while computing. Final text is emitted after the commit, not token by token as the model writes. “Streaming” therefore describes transport/progress and replay, not continuous unreviewed text generation. The client can render incremental text if supplied, but that is not the current producer's delivery strategy.

## Controls and visible behavior

| Memory | Web search | Available behavior |
| --- | --- | --- |
| Off | Off | Current-thread conversation; no cross-thread recall or new memory projection |
| On | Off | Current-thread context, historical recall, and eligible memory writes; no fresh web evidence |
| Off | On | Current-thread context and configured live search; no cross-thread recall or new memory projection |
| On | On | Historical recall, live research, comparisons and eligible memory writes |

Search also requires its provider key and the UI's master tool setting. Missing search capability is disclosed in the prompt. Memory availability in public settings does not prove Ollama or vector indexing is healthy.

The library displays the latest 100 episodes, facts, source links, archive/forget controls and indexing status. It is not a general memory correction editor, “why used” inspector, export interface or retention dashboard.

The sidebar orders history by activity, preserves unchanged snapshot references and memoizes rows. Polling reconciles authoritative changes without moving the active thread simply because it was refreshed. Renaming or new messages can legitimately change activity order. The browser cache accelerates rendering; it does not replace PostgreSQL ownership checks or persisted history.

## Failure behavior and observability

A successful HTTP opening is distinct from successful generation. The API logs `response.opened` for NDJSON responses; the agent logs completion only after committing, and logs failures caught inside the stream. Request IDs connect API, generation and provider events.

A provider **429** indicates a rate-limit/quota response; a **503** indicates provider unavailability. They have distinct UI messages. The process-local provider gate serializes calls, spaces requests, bounds its queue, honors retry delays and applies cooldowns. It is not an account-wide rate limiter, and cannot by itself prevent token-budget or billing-quota failures. Changing providers or models is explicit; there is no silent fallback.

Shared logs show status, timings, steps, token usage, allowlisted rate-limit fields and selected provider reason codes. They omit raw provider bodies, prompts, answers and credentials. Local formatting is readable and production formatting is JSON. Legacy Redis/search console paths remain outside the unified logger. Unit tests deliberately simulate failures and may print warning/error logs even when passing.

A disconnected client leaves the tee's background consumer running. Redis can replay buffered output after reload while the producer is alive. A crashed process cannot resume model computation; abandoned-run cleanup is triggered by later application activity rather than a separate continuously running watchdog. The embedding queue is durable and bounded, but it is not a general workflow engine.

## Verification and remaining work

Automated coverage includes temporal/DST behavior, source-linked memory lifecycle, comparison provenance, provider routing and cooldowns, safe diagnostics, stream behavior, stable history snapshots and Strict Mode auto-send. Database suites require a migrated `TEST_DATABASE_URL`; provider/search/embedding responses in those suites are mocked. Passing fixtures do not establish live retrieval accuracy, factual correctness or latency percentiles.

The current implementation does not claim:

- Authenticated accounts, PostgreSQL row-level security, column encryption or abuse quotas per account.
- Multi-replica provider budgeting or durable restartable generation.
- Automatic memory backfill, re-embedding migrations, compaction, TTL decay or delete-all/export workflows.
- Guaranteed end-to-end deadlines from every constant in `limits.ts`.
- Live quality benchmark results, calibrated extraction confidence or a measured p95 latency target.
- A tested backup/restore procedure or disaster-recovery service.

The next useful measurements are logical and physical model calls per turn, input/output tokens, provider error classifications, recall hit rate on dated/topic fixtures, comparison support accuracy, and time to progress versus time to committed answer. Those measurements should guide any additional model pass, reranker, lower token budget or distributed rate-control system. Adding more layers without evidence would increase cost and failure modes.
