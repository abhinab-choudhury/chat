# .Chat — hiring-project architecture redesign

Status: proposed architecture, not implemented. Supersedes the platform recommendations in DESIGN.md; preserves that document as the original analysis. Based on the working tree inspected on 17 November 2026, including uncommitted changes.

## Approved implementation decisions (17 November 2026)

The user approved PostgreSQL + Drizzle with pgvector from the first milestone,
overriding the proposed SQLite/FTS5 platform below. Embeddings run locally through
Ollama (`qwen3-embedding:0.6b`, 1,024 dimensions); Gemini or OpenAI handles generation and
research review; OpenAI defaults to GPT-5.6 Luna with low reasoning effort. Hybrid retrieval uses PostgreSQL full-text search plus cosine
vector search and reciprocal rank fusion. Exact dates use a separate paginated
query. The existing anonymous browser scope and optional Redis replay remain.
Fact extraction shares the generation call; only local embedding enrichment is
queued. The memory worker starts on the first chat request and recovers pending
jobs after restart. Search currently uses provider excerpts; constrained page
reading, live quality benchmarking, and automatic historical backfill remain
deferred. The sections below retain the original proposal and rationale.

## 1. Goal and boundaries

Build a local, single-user, memory-aware research assistant using **TanStack Start full stack**. Remove Convex and authentication. The hiring demonstration should prove that the assistant can recover a specific historical conversation, identify what it previously claimed, research current evidence, and explain what changed or cannot be established.

The three prompts in DESIGN.md are the assumed acceptance criteria. The actual hiring brief was not supplied; architecture quality being the sole judging criterion is an assumption in that document, not a verified requirement.

Recommended stack:

- TanStack Start + React for the existing UI and server routes.
- AI SDK for model calls, structured output, bounded tool execution, and provider adaptation.
- SQLite + Drizzle for local persistence; FTS5 for lexical retrieval.
- One configured LLM provider and one configured search provider initially. Keep existing search adapters where useful, but do not require all their keys.
- Environment variables for provider secrets. No login, credential-settings database, Redis, hosted vector database, separate API service, or queue service.
- Node runtime with a persistent local database file. This proposal does not target ephemeral serverless storage or multiple application replicas.

SQLite is a recommendation to match the easy-setup goal, not a requirement supplied by the user. PostgreSQL remains reasonable if the actual brief requires it. Avoid building both database adapters for this submission.

No authentication means one shared local workspace. Browser tabs are not separate users. A public deployment would expose the workspace and provider budget; keep the hiring demo local or behind hosting-level access controls.

## 2. Assessment of the current implementation

| Finding | Evidence in the inspected code | Design implication |
|---|---|---|
| Proposed storage differs from actual storage | DESIGN.md proposes pgvector; convex/schema.ts stores conversations, runs, and lexical memories | Replace the platform coherently rather than adding Postgres memory alongside Convex |
| Two competing execution paths | dispatch.server.ts classifies into direct.server.ts or convex/agent/http.ts | One orchestrator with optional stages; no alternate path with different persistence rules |
| Direct responses trust browser history | direct.server.ts constructs model messages from body.messages | Client sends a new message and IDs; server reconstructs history |
| Direct memory is effectively unreadable by the agent path | projectDirect omits questionSourceId; state.context requires matching questionSource content | Every archive item needs valid references to both sides of the exchange |
| README's async-memory statement is stale | state.complete calls memory.project within commit | Preserve cheap atomic episode creation; make only expensive enrichment asynchronous |
| Identity is not established at the dispatch boundary | body.userId / cookie / dev-user selects settings | Removing auth should remove identity and per-user credentials entirely, rather than preserve pseudo-auth |
| Component and app histories overlap | state.complete saves both component messages and app messages | One canonical message store |
| Thread locking already exists | state.begin checks latest run per thread | Preserve per-thread concurrency, not the old document's per-user lock |
| Current retrieval is bounded lexical + newest records | state.context takes six search hits and six recent records | Exact date recall needs a separate indexed path, not larger top-k |

These are code observations, not results of a live exploit or end-to-end evaluation. This redesign does not modify those implementations yet.

## 3. Runtime structure

```text
React chat + memory/evidence inspector
              |
TanStack server routes: validate input, stream events, return persisted state
              |
Run orchestrator: policy -> context -> bounded tools -> draft -> verify -> commit
       |                 |                    |
Memory service      Research service       Model adapter
       |                 |
SQLite repositories   Search adapter + constrained page reader
       |
Messages / episodes / user facts / claims / evidence / runs / jobs
```

Server routes remain thin. Agent behavior belongs in ordinary server-only modules that can run in tests without HTTP or React. Tools delegate to those same services rather than reimplementing queries.

Suggested organization:

```text
src/routes/api/chat.ts                  POST new turn, NDJSON response
src/routes/api/runs/$runId.ts           GET persisted run/result
src/routes/api/threads/...              history and thread operations
src/routes/api/memories/...             inspect, correct, delete
src/lib/agent/orchestrator.server.ts    single run state machine
src/lib/agent/policy.ts                 recall/research/compare requirements
src/lib/agent/tools.server.ts           validated tool definitions
src/lib/agent/review.server.ts          claim review + deterministic gates
src/lib/memory/...                      temporal resolver, retrieval, facts
src/lib/research/...                    search, evidence, normalization
src/database/...                       SQLite schema and repositories
scripts/evaluate.ts                    replay fixtures and report metrics
```

Use TanStack server routes for raw streaming HTTP and server functions where convenient for ordinary UI operations. The official [server route guide](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) describes this boundary; confirm exact APIs against the installed version during implementation.

## 4. One bounded agent loop

1. Validate the new message, thread ID, client-generated request ID, timezone, and toggles. Reject client-supplied system roles, historical messages, tool results, and timestamps as authoritative context.
2. In a short transaction, persist the question and create or return its run. Enforce one active run per thread using a database constraint. A repeated request ID returns its existing result/status, not another model invocation.
3. Load persisted current-thread context. Resolve dates using a frozen run clock and validated IANA timezone.
4. Establish required capabilities: recall, research, comparison, or ordinary conversation. Obvious temporal/recall phrases must force recall; a classifier cannot remove required capabilities. Ambiguous intent defaults to the fuller path.
5. Run the assistant with allowed tools. Start with at most six model/tool steps, twelve external calls, search concurrency three, and a configurable overall deadline. These are initial budgets to tune, not quality guarantees.
6. For comparison requests, require a structured historical baseline and a per-claim evidence ledger before synthesis. The model cannot bypass this by merely writing a plausible answer.
7. Produce a structured draft containing answer text, claims, memory references, and evidence IDs. Run deterministic reference checks and evidence review for research/comparison responses. Ordinary conversation uses the same context and commit path but can skip the reviewer.
8. Commit the final answer, provenance, run completion, cheap episode record, and enrichment job atomically. Emit final text only after commit in v1.
9. Process optional fact/embedding enrichment outside the answer path. Surface failure as pending/failed enrichment; never lose the historical exchange.

Stream status and tool summaries, not private reasoning. Use the existing NDJSON convention to minimize UI migration. No fake typing or paragraph-by-paragraph review in v1.

Tools:

| Tool | Contract |
|---|---|
| search_memory | Query, optional local date range/type; returns bounded candidates, IDs, source refs, coverage metadata |
| read_episode | Loads the source exchange and associated historical evidence; stale/deleted refs fail explicitly |
| search_web | Query + intent; returns normalized evidence records, including retrieval timestamp |
| read_source | Reads an allowed public result URL when snippets are insufficient; size/time limits apply |

Explicit remember/forget UI actions call validated memory services directly. Do not let arbitrary retrieved prose trigger writes or deletions. A user saying “remember this” still requires extracting the intended fact; it does not make the fact objectively true.

The system is agentic because it chooses evidence-gathering steps and can refine searches. The host code enforces budgets, state transitions, and minimum evidence requirements. Multiple autonomous agents are unnecessary.

## 5. Persistence and memory model

Logical tables; field names are illustrative rather than a migration:

| Table | Essential content |
|---|---|
| threads | id, title, createdAt, archivedAt |
| messages | id, threadId, role, content, revision, createdAt, runId |
| runs | id, requestId UNIQUE, threadId, questionId, state, optionsSnapshot, startedAt, deadlineAt, answerId, errorCode |
| episodes | id, questionId, answerId nullable, questionAt, sourceRevisions, status, summary optional |
| facts | id, subject, predicate, value JSON, scope, assertedAt, validFrom/validTo nullable, supersedesId, status |
| fact_sources | factId, messageId, revision, supporting quote/span |
| claims | id, answerId, subject, predicate, value/unit/conditions, historical support status |
| evidence | id, runId, URL, title, retrievedAt, publishedAt nullable, effectiveAt nullable, excerpt, contentHash |
| claim_evidence | claimId, evidenceId, relation: supports/contradicts/insufficient |
| jobs | id, kind, sourceId, sourceRevision, extractorVersion, state, attempts, nextAttemptAt, dedupKey UNIQUE |
| embeddings (later) | recordId, recordType, model, dimensions, sourceRevision, vector |

Store timestamps in UTC. Index messages by (threadId, createdAt), episodes by questionAt, facts by (scope, subject, predicate, status), and jobs by (state, nextAttemptAt). Maintain an FTS5 index over searchable episode text in the same transaction as its source projection. [FTS5](https://sqlite.org/fts5.html) supplies lexical search; verify it is enabled in the chosen SQLite driver.

Memory has three roles:

- Working context: persisted recent messages with a token budget. Summaries supplement them; they do not replace the source.
- Episodic memory: what was asked/answered, on what date, with source links. Create this without LLM extraction. A failed answer still leaves the user's question discoverable, with no approved answer.
- Semantic memory: selected user assertions and preferences with structured keys and provenance. Assistant claims about current world facts remain claims linked to dated evidence, not durable user facts.

Do not combine superseded_by pointers with a second overlapping version system. Use append-only fact versions with a single supersession model. Merge only inside a defined scope: “20 people in this sales team” is not “the user's entire company has 20 people.” Structured extraction must preserve negation and validity dates; ambiguous conflicts remain unresolved rather than silently overwritten.

A model's confidence score is not calibrated probability. Prefer supporting source spans and extraction evaluation. Explicit instructions indicate user intent, not confidence 1.0 in factual truth.

Source edits/deletes invalidate dependent facts and embeddings by revision. Read-time validation prevents stale projections being used while cleanup runs. Forgetting must also prevent automatic re-extraction from retained messages, via a suppression record or source-memory exclusion. Deletion is distinct from archival and disabling retrieval.

## 6. Retrieval and temporal semantics

**Exact historical recall takes a database path before semantic search.** “What did I ask on 3 November?” lists matching questions by question timestamp across threads, paginated if necessary. A vector top-k is not an exhaustive answer to that question.

Resolve local date ranges into UTC half-open intervals [start, end), including timezone/DST boundaries. Freeze now at run creation. Define supported date grammar and policies in tests. For “last Tuesday,” use the previous calendar week's Tuesday and display the resolved date; for an omitted year, use the most recent past occurrence and display it. Different conventions are possible: ask when ambiguity materially changes the answer. Never silently broaden an empty strict date range.

For topic recall, combine lexical candidates with structured entity/date lookup. Introduce semantic retrieval only if paraphrase fixtures demonstrate missed recall. For the small demo corpus, exact cosine scoring over a bounded set of stored embeddings avoids a vector extension; declare the corpus cap and migrate to an indexed vector store if profiling requires it. Do not hide an unbounded scan behind this choice.

When semantic retrieval is added, fuse lexical and vector ranks using reciprocal rank fusion rather than adding unrelated raw scores. Date/exact-entity constraints remain policy constraints. Rerank only if evaluation shows a useful gain. No mandatory HyDE, graph, multi-vector records, or monthly summaries.

Return coverage metadata: searched dates, candidate count, source IDs, pagination/truncation, and pending indexing. If the episode index is pending, fall back to canonical messages for exact-date recall. “No indexed result” must not become “you never asked.”

## 7. Proving a change requires two observations

For each selected historical claim, keep distinct:

- What the assistant said then.
- What evidence supported it then, if any.
- What current evidence supports now.
- Whether a difference is established, and whether its timing is known.

Pricing comparisons normalize currency, region, plan, billing period, seat count, tax treatment, and introductory discounts. Otherwise $20/month billed annually versus $25/month billed monthly can become a false change.

Verdicts: **still supported**, **changed**, **prior answer unsupported**, **conflicting evidence**, **unable to verify**. State “no change found in the sources checked” when appropriate; never equate search silence with proof of no change. A newly fetched undated pricing page establishes an observation today, not when a price changed. Missing historical evidence means an answer can differ without proving that the vendor changed its price.

Search once per relevant entity/claim group with bounded concurrency; allow one refinement round when coverage is weak. Do not cap every request at four queries when the acceptance example has five vendors and both pricing and release questions. Budgets constrain completeness; report uncovered entities.

Prefer official pricing/release pages for these tasks. One authoritative source can outweigh two copied secondary articles. Store excerpts and timestamps, not just URLs. Query caching is optional; if added, include provider, query, locale, filters, and retrieval time, and bypass stale cached evidence for explicit fresh-check requests.

## 8. Verification, failures, and lifecycle

Citation validity and claim support are separate checks. Deterministically verify evidence IDs, source ownership by run, valid memory revisions, required baseline presence, and comparison coverage. Then have the reviewer evaluate support against actual excerpts. A URL being in a search result does not prove the associated claim.

Reviewer outcomes may qualify individual claims without failing the entire answer. Missing evidence should yield a useful partial answer or explicit uncertainty. Reserve run failure for infrastructure errors or invalid output that cannot be repaired within one bounded attempt. A different reviewer model is optional; model diversity does not guarantee truth.

Treat web pages and archived text as untrusted data. Do not interpolate memory as policy instructions. Secrets are unavailable to model tools. Constrain page reads to public HTTP(S) destinations, reject private/link-local addresses and unsafe redirects, and cap response size. Prompt wording alone is insufficient; see [OWASP's prompt injection guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

Run states: queued -> running -> reviewing -> complete, with failed/cancelled terminal alternatives. Enforce transitions and terminal-state checks in persistence. Repeated commit returns the same answer ID. After process restart, reconcile expired active runs; do not pretend a route's in-memory task survives a crash.

For v1, a disconnected foreground request is best-effort until its deadline. The UI can reload persisted run status and any committed result. Durable restartable generation and stream replay are deferred. Use persistent jobs only for idempotent enrichment, drained on server startup and after commits with bounded retries. Jobs use source revision + extractor version deduplication and conditional writes so deleted/edited sources cannot be resurrected.

## 9. Original decision audit

This reviews the main design and each numbered improvement in DESIGN.md. “Defer” means optional after measurement, not required architecture.

| Original decision | Revised decision and reason |
|---|---|
| Three memory layers | Keep roles; separate user assertions from world claims |
| Postgres + pgvector and HNSW tuning | Prefer SQLite locally; no ANN tuning before measured need |
| Single combined memories table | Separate episodes, facts, and evidence because their validity differs |
| Tenant scoping/RLS/provider settings | Remove tenancy/auth for local demo; env keys, explicit shared workspace |
| Async extraction of every memory | Atomic episode creation, async optional enrichment |
| Weighted raw retrieval scores | Exact-date path first; rank fusion when hybrid search is justified |
| TTL/importance decay | Defer; old episodes must remain discoverable by explicit date |
| Per-user run lock | Per-thread database constraint |
| Mandatory reviewer on every turn | Review research/comparison; shared commit path for all turns |
| Search-only external tool | Keep search plus constrained page reading for adequate evidence |
| Progress before reviewed final answer | Keep; measure actual latency separately |
| Full inspector/export/settings UI | Compact provenance and correction/delete first; export next |
| Reject all hosted memory as unauditable | Too absolute; reject here because custom temporal provenance is the learning objective |
| Claim p95 <15s | Treat as hypothesis, benchmark with real providers |
| 1. Two-pass extraction | Source-span validation first; extra verifier only if error rate warrants |
| 2. Structured triples | Keep with scope and temporal validity |
| 3. Negation/corrections | Keep; unresolved contradictions are explicit |
| 4. Hierarchical summaries | Defer; never discard original historical questions |
| 5. Remember/forget tools | Keep explicit user operations; remove confidence=1 assumption |
| 6. Confidence calibration | Evaluate extraction errors; do not use raw confidence as truth |
| 7. Learned scoring weights | Defer; simple baselines and rank fusion first |
| 8. On-demand memory search | Keep, with bounded read_episode follow-up |
| 9. Rewrites/HyDE | Defer until held-out retrieval misses justify cost |
| 10. Multiple embeddings per memory | Defer; additional index complexity |
| 11. Memory graph | Defer; not needed for the three target prompts |
| 12. Embedding model versions | Keep if embeddings are introduced |
| 13. Compaction | Defer; retain exact source history |
| 14. Per-thread lock | Keep; already present in the current agent path |
| 15. Search quality gate/page fetch | Keep evidence adequacy checks and constrained fetch |
| 16. Source dates | Keep retrieval/publication/effective dates separate; unknown stays unknown |
| 17. Refinement round | Keep one bounded round on insufficient coverage |
| 18. Tiered caching | Defer; freshness and correct cache identity first |
| 19. Abstention | Keep per claim; do not turn uncertainty into a generic error |
| 20. Fuzzy date parsing | Explicit grammar first; ambiguity is surfaced |
| 21. Timezone | Keep; validate and snapshot per run |
| 22. Enforced re-verification | Keep as a host-enforced branch with a claim ledger |
| 23. Different-model/ensemble reviewer | Optional single alternative; no ensemble for v1 |
| 24. Require two sources | Replace with relevance/authority and documented conflict handling |
| 25. Sentence-gated streaming | Defer; complicates consistency and review promises |
| 26. Adversarial CI fixtures | Keep; cheap and relevant |
| 27. Grouped memory UI | Compact source-linked list first |
| 28. Toggle matrix | Keep explicit behavior below |
| 29. Provenance | Keep supporting spans; no private reasoning logs |
| 30. Evaluation harness | Move to the first milestone |
| 31. Column-level content encryption | Defer; encrypted searchable content needs a separate threat model; env secrets never enter memory |
| 32. Redacted debug mode | Structured counts/timings by default; explicit local fixture capture only |
| 33. Memory quotas | Keep size/call limits; no tenant quota infrastructure in single-user demo |
| 34. Backup/rebuild | Keep rebuild for projections; facts edited by users require backup, not just regeneration |

Toggle behavior:

| Memory | Web | Behavior |
|---|---|---|
| On | On | Historical recall and fresh verification available |
| On | Off | Recall with provenance; current validity explicitly unverified |
| Off | On | Current research with current-thread context; no cross-thread recall or fact enrichment |
| Off | Off | Current-thread conversation only; no claims of cross-session recall or fresh verification |

Canonical chat history is saved in all four modes. Memory off excludes cross-thread episode retrieval and new memory projections/enrichment; it does not delete previous records. Any later backfill requires an explicit user action rather than silently indexing conversations written with memory off.

## 10. Implementation order and hiring evidence

1. **Define evaluation fixtures first.** Freeze clock/timezone. Seed historical questions, old evidence, vendor lists, and user corrections. Save expected source IDs and claim verdicts.
2. **Replace infrastructure.** SQLite migrations, server repositories/routes, environment configuration, remove Convex/auth/Redis from the required startup path. Preserve the UI. One canonical history, one orchestrator.
3. **Reliable recall.** Atomic episodes, exact-date queries, read_episode, lexical topic search, provenance and delete invalidation.
4. **Reliable comparisons.** Evidence persistence, normalized pricing facts, enforced baseline/current ledger, reviewer and uncertainty behavior.
5. **Demonstrate and tune.** Compact memory/source inspector, event trace, failure recovery; add embeddings only if the lexical baseline misses relevant held-out cases.

Minimum fixture set: the three original prompts plus multiple questions on the same day, no matching episode, year ambiguity, timezone midnight, DST boundary, renamed vendor, explicit correction, edited/deleted source, pending enrichment, missing old citations, conflicting pricing plans, search timeout, injected source instructions, concurrent submit, duplicate request, and crash before/after commit.

Report retrieval recall@k for topic search, exact-date listing completeness, factual extraction precision/recall, citation-reference validity, human-labeled claim support, correct change verdicts, tool-call count, cost, and latency by stage. Do not report reviewer approval rate as factual accuracy.

Start with 20–30 fixtures and a held-out subset. Deterministic CI uses fake model/search adapters; a separate opt-in live run measures real quality and latency. Compare lexical baseline versus embeddings and review on versus off. Include failures and sample size in the results; no invented performance claims.

Deliver a setup command path, seeded demo, architecture rationale, evaluation report, and three reproducible walkthroughs. This demonstrates agent design through bounded autonomy, temporal memory, provenance, and measured tradeoffs, while TanStack supplies the full-stack application boundary.
