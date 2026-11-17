# .Chat — theoretical analysis: memory-augmented chat agent with web search

> Status: design analysis for the challenge. No implementation code in this document.
> Stack target: TanStack Start + React frontend, PostgreSQL + pgvector backend, LLM provider, web-search providers (Tavily/Brave/Serper/Firecrawl).

## 0. What "best" means here

The challenge is judged on **architecture**, not feature count or polish. The test prompts are deliberately *temporal and cross-session*:

1. "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"
2. "What did I ask you on 3 November? Is your answer still correct today?"
3. "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"

These three prompts force four capabilities that a naive "chat + search" agent fails:

- **Cross-session recall** of a specific prior conversation (not just the last few turns).
- **Date-aware retrieval** ("on Monday", "3 November", "last Tuesday").
- **Fact extraction** from a prior turn (the 5 CRM names, team size, providers discussed).
- **Re-verification**: re-run the question against *current* web evidence and report what changed.

So the design center is: *a fast, correct, well-cited chat agent whose memory layer makes prior turns first-class, queryable, and re-verifiable.* Everything below serves that.

---

## 1. Memory taxonomy

Three distinct stores with different write/read/decay semantics. Conflating them is the #1 failure mode.

| Layer | Name | What it holds | Write | Read | Decay |
|---|---|---|---|---|---|
| L0 | Short-term (working) | Recent turns of the *current* thread | Every turn | Every turn | Sliding window + token cap |
| L1 | Long-term factual (semantic) | Stable facts about user/world/preferences/entities | Extracted, merged/upserted | Semantic + entity lookup | Superseded, never deleted silently |
| L2 | Long-term episodic | Dated records of completed exchanges | Appended after review | Date-range + semantic | TTL + importance decay |

- **Short-term** is the conversation history the model actually sees as messages. It is authoritative for "what is happening now" and must never be replaced by retrieved memory.
- **Factual** memory is *merged*: "user's team is 20 people" updates an existing fact rather than creating a duplicate. Facts carry a lineage (supersedes / superseded-by) so contradictions are auditable.
- **Episodic** memory is *appended*: each completed, reviewed exchange becomes one immutable-ish record with an observation timestamp, the original question, the approved answer, source-message references, and review metadata. Episodes are the substrate for "what did I ask on 3 November?".

A fourth, optional layer — **procedural** (how the user likes answers: terse, cited, no marketing) — is worth mentioning but is out of scope for v1; it folds into factual memory as preference facts.

**Key invariant:** historical statements remain *historical claims*, not verified current facts. Memory tells the agent what it previously said; web search tells it what is true now. The agent must never present a memory as current truth without re-checking.

---

## 2. Storage: PostgreSQL + pgvector

### 2.1 Schema (logical)

```sql
-- identity / tenancy
users(id, email, ...)
threads(id, user_id, title, created_at, ...)
messages(id, thread_id, role, content, created_at, ...)

-- long-term memory
memories(
  id uuid PK,
  user_id uuid NOT NULL,            -- hard tenant boundary
  type text NOT NULL,               -- 'fact' | 'episode'
  subtype text,                     -- fact: 'preference'|'entity'|'decision'; episode: 'qa'
  content text NOT NULL,            -- canonical text for embedding + display
  embedding vector(1536) NOT NULL,
  entities text[] NOT NULL DEFAULT '{}',   -- normalized entity keys
  tags text[] NOT NULL DEFAULT '{}',
  importance real NOT NULL DEFAULT 0.5,     -- 0..1
  confidence real NOT NULL DEFAULT 0.5,     -- extraction confidence
  observed_at timestamptz NOT NULL,        -- when the underlying event happened
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  source_message_ids uuid[] NOT NULL DEFAULT '{}',
  source_thread_id uuid,
  review_verdict text,              -- 'supported'|'qualified'|'blocked' (episodes)
  superseded_by uuid REFERENCES memories(id),
  archived boolean NOT NULL DEFAULT false,
  deleted_at timestamptz
)

-- fact lineage / versions
memory_versions(id, memory_id, content, embedding, valid_from, valid_to, reason)

-- search acceleration
-- HNSW on embedding; B-tree on (user_id, type, observed_at); GIN on entities/tags
```

### 2.2 Why PostgreSQL + pgvector (and not a hosted vector DB)

- **One database, one transactional boundary.** Memories, messages, threads and users live together; owner-scoping and cascading deletes are SQL, not distributed glue.
- **Hybrid retrieval in one query.** pgvector (ANN) + `tsvector` (full-text) + metadata predicates in a single SQL statement with `ORDER BY` scoring. No cross-service round trips.
- **Mature ops.** Backups, point-in-time recovery, RLS, connection pooling (PgBouncer) are solved problems; matches the challenge's "we read your code" expectation of boring, defensible choices.
- **Cost predictability.** No per-query vector-DB billing; embeddings are the only model cost.

Trade-off: ANN index (HNSW) tuning and reindexing on embedding-model change are manual. Mitigation: pin the embedding model + dimension in config; treat model change as a migration with re-embedding job.

### 2.3 Indexing choices

- `embedding`: HNSW (`m=16, ef_construction=64`) with cosine distance. HNSW over IVFFlat for recall at low latency without a training step.
- `content` full-text: `tsvector` generated column + GIN for lexical fallback (handles exact names like "Postgres", "CRM" that embeddings blur).
- `entities`: GIN for `&&`/`@>` filters ("memories mentioning HubSpot").
- Composite `(user_id, type, observed_at DESC)` for the "recent N episodes" fast path.

### 2.4 Multi-tenancy & privacy

- Every query filters `user_id = $owner`. Enforced in the data-access layer (not just the SQL string) via a scoped repository; RLS as belt-and-braces.
- API keys (LLM + search providers) stay in encrypted user settings, server-side only, never in memory documents or workflow args — carried over from the existing design.
- Memory deletion cascades: deleting a thread/message marks dependent memories `deleted_at` via source-message linkage; retrieval excludes them.

---

## 3. Memory lifecycle

### 3.1 Extraction (post-turn, async, idempotent)

Trigger: after an answer is **committed** (reviewed + persisted). Failed/blocked drafts never enter memory.

Pipeline:

1. **Extractor LLM** (cheap, fast, structured output) receives: the turn's user message + assistant answer + retrieved evidence + current date. It emits candidates:
   ```json
   { "type": "fact"|"episode",
     "content": "...",
     "entities": ["hubspot", "salesforce"],
     "subtype": "decision",
     "importance": 0.8,
     "confidence": 0.9,
     "temporal_scope": "persistent"|"dated:2026-..." }
   ```
2. **Normalization**: entity canonicalization (lowercase, alias map), content dedup hash.
3. **Quality gate**: drop candidates below confidence threshold; require at least one entity or a clear user-preference signal.
4. **Consolidation**:
   - Episode: insert (append). Link `source_message_ids`.
   - Fact: find existing facts with same `(user, entity-set overlap, subtype)` above similarity threshold; if found, create a new version (supersede) rather than duplicate; else insert. Keep `superseded_by` chain.
5. **Embedding**: compute embedding for `content`; store.
6. **Idempotency**: keyed by `source_message_ids` hash; re-running a sync is a no-op.

Runs in a durable background job (queue), not in the request path. The chat answer is already delivered; memory sync is eventually consistent.

### 3.2 Retrieval (pre-turn)

Runs at the start of handling a user message, in parallel with intent classification.

**Query construction:**
- `q_text` = current user message (possibly rewritten by a lightweight query-rewrite step that expands relative dates and entities).
- `q_emb` = embedding of `q_text`.
- Parsed date range (if the message contains temporal expressions): `{from, to}`.

**Hybrid SQL (conceptual):**
```sql
SELECT m.*,
  (1 - (m.embedding <=> $q_emb)) AS vec_score,
  ts_rank_cd(m.tsv, plainto_tsquery($q_text)) AS lex_score,
  m.importance, m.observed_at
FROM memories m
WHERE m.user_id = $uid
  AND m.deleted_at IS NULL
  AND m.archived = false
  AND ($type IS NULL OR m.type = $type)
  AND ($date_from IS NULL OR m.observed_at >= $date_from)
  AND ($date_to   IS NULL OR m.observed_at <= $date_to)
  AND (m.entities && $entities OR $entities = '{}')
ORDER BY
  (0.55*vec_score + 0.25*lex_score + 0.10*importance
   + 0.10*recency_decay(m.observed_at)) DESC
LIMIT 40;
```

Then **re-rank** the top 40 with a cross-encoder or a cheap LLM reranker → top 8–12. Re-ranking is the single biggest recall/precision lever; budget it.

**Type-aware retrieval policy:**
- "What did I ask on 3 November?" → episodes only, date filter strict, no facts.
- "I prefer terse answers" → facts only.
- General question → both; facts weighted higher for preferences, episodes for "last time".

**Budgeting:** cap retrieved memory at ~4–8k tokens; prefer dropping low-score items over truncating mid-record. Always include the *most recent 2–3 episodes* of the current thread's topic as a floor (recency floor prevents "I forgot what we just said").

**Date parsing** is done with a small, deterministic temporal resolver (not the LLM): "Monday" → last Monday relative to `now()`; "3 November" → that date in the current/previous year depending on whether it's passed; "last Tuesday" → previous Tuesday. Ambiguous → ask a clarifying question rather than guess. This is critical and cheap to get right; LLM date math is unreliable.

### 3.3 Update / invalidation

- **Source edit/delete** → mark dependent memories `deleted_at` (soft) via `source_message_ids` containment; they stop being retrieved. Hard delete on retention schedule.
- **Fact contradiction**: when a new fact conflicts with an old one (same entity + predicate, different value), create version, set old `superseded_by = new`. Retrieval prefers non-superseded; old remains auditable ("you used to say X").
- **Decay**: episodic importance decays exponentially with half-life ~30 days unless pinned; facts don't decay.
- **User controls**: pin (importance=1, no decay), edit content (re-embed), archive (excluded from retrieval but retained), delete (hard).

### 3.4 What NOT to store

- Raw chain-of-thought / reasoning.
- Credentials, API keys, PII beyond what the user volunteered.
- Drafts that failed review.
- Tool call internals; store the *outcome* and citations instead.

---

## 4. Agent loop

Per request, target end-to-end: first progress event < 200ms, answer < 8–15s for search-heavy turns.

```
1. Submit → optimistic "preparing" UI state
2. Load short-term context (last N persisted messages, token-capped)  [server-side, trusted]
3. Classify intent (cheap LLM or rules): memory-recall | current-info | mixed | chitchat
4. Retrieve memories (hybrid) + resolve dates
5. Plan web searches (if current-info/mixed): decompose into 1..4 sub-queries, entity-scoped
6. Execute searches in parallel (provider abstraction, dedup by URL, deadline)
7. Synthesize draft (streaming internally) with inline citations
8. Evidence review (second LLM): supported | qualified | blocked + revised answer
9. Deterministic citation check: every cited URL must be in retrieved evidence
10. Commit answer (persist message) → enqueue async memory sync
11. Emit answer text to client
```

**Progress events** (NDJSON/SSE) at each stage so the UI never looks idle: `preparing → context → memory → searching → reviewing → saving → done`. This is a UX fix, not a latency fix — inference time is unchanged.

**Strict review cost**: raw draft tokens cannot be shown while promising review-before-delivery. We buffer the draft, review, persist, then emit text. We do not fake token-by-token typing. A later sentence-gated release is possible but adds review calls and cross-sentence contradiction handling.

**Concurrency**: per-user run lock (watchdog marks abandoned runs failed) to prevent duplicate commits on reconnect/retry. Idempotency keys on commit.

---

## 5. Web search integration

The only external tool. Design for *correctness and speed*, not breadth.

- **Provider abstraction**: Tavily / Brave / Serper / Firecrawl behind one interface `{search(q, opts)}`. Primary + fallback; if primary fails/timeouts, fall back automatically. Configured provider keys.
- **Query planning**: an LLM step turns the user question + memory context into 1–4 concrete queries, each with an intent ("pricing page", "changelog 2026", "comparison"). Entity-specific queries beat one giant query.
- **Recency handling**: when the question says "since Monday / since last Tuesday", add date filters / recency bias to queries and prefer results with recent `published_date`.
- **Parallel execution** with a global deadline (e.g. 6s); partial results acceptable.
- **Dedup**: by normalized URL; merge snippets; keep top snippet per domain unless multiple pages add value.
- **Ranking**: provider score + domain authority heuristic + recency; cap at ~12–15 unique sources.
- **Citation discipline**: the synthesizer may only cite URLs present in the retrieved evidence set; the reviewer enforces this deterministically (URL set intersection), not by LLM judgment.
- **Caching**: short TTL (minutes–hours) on identical queries to avoid re-paying on follow-ups; cache keyed by normalized query + date bucket.
- **No-source claims must be qualified** ("as of my last knowledge…") — enforced in the system prompt and reviewer.

---

## 6. Temporal reasoning & staleness

This is where the challenge's three prompts live or die.

- **System date injection**: every prompt includes `Today is <date> (<weekday>)`. Never rely on model's internal date.
- **Deterministic date resolver** for memory filters (see §3.2). LLMs are bad at "last Tuesday"; code is not.
- **"Has X changed since Y?" pattern**:
  1. Retrieve the episode from date Y (and any fact it produced).
  2. Extract the entities/claims from that episode.
  3. Run targeted current searches for each entity.
  4. Diff: present (a) what was true then, (b) what is true now, (c) what changed, with citations and dates.
- **"Is your answer still correct today?"**: re-verify the prior answer's claims against fresh search; report per-claim status (still supported / changed / unable to verify), never a blanket yes/no.
- **Memory age surfacing**: when an episode is older than N days, the answer notes "based on our conversation on <date>" and re-checks before asserting.

---

## 7. Toggle section (UI)

A dedicated panel, not buried in settings, that makes memory *inspectable and controllable* — transparency is a trust feature and a judging differentiator.

Contents:
- **Memory toggle** (global + per-thread): ON/OFF for cross-thread retrieval and new archival. OFF = no L1/L2 retrieval and no new archival; short-term thread context still applies. Existing records are not erased (reversible).
- **Web search toggle**: enable/disable the search tool; when off, agent answers from memory + model knowledge and qualifies accordingly.
- **Memory inspector**:
  - Tabs: **Factual** | **Episodic** (and "All").
  - Each entry: type badge, content, entities, date, importance, confidence, source link (jump to original message), status (active / superseded / archived).
  - Actions: view source, pin, edit, archive, delete, "forget this".
  - Search/filter within memories.
- **Per-answer attribution**: "Used 3 memories, 5 sources" expandable, listing which memories and URLs informed the answer.
- **Privacy controls**: export memories, delete all, retention setting.

Design constraint: the toggle must be legible in < 2 seconds; favor compact badges over prose.

---

## 8. Evaluation against the challenge prompts

**Prompt 1 — "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"**
- Memory: episode from Monday retrieved by date filter; factual memory holds the 5 CRM names + "20-person sales team".
- Agent extracts entity list from memory → plans 5 (or fewer, grouped) pricing/changelog queries → searches in parallel → diffs.
- Answer: per-CRM bullet with "no change detected" vs "pricing changed X→Y on date (source)" vs "shipped Z (source)"; notes team-size context if relevant.
- Failure mode guarded: if memory missing the 5 names, agent says so and asks, rather than hallucinating a list.

**Prompt 2 — "What did I ask you on 3 November? Is your answer still correct today?"**
- Memory: episodes with `observed_at` on 3 November, sorted; returns the question(s) and the approved answer(s) verbatim-ish (summarized with quote).
- Re-verification: re-run the original question's claims against fresh search; per-claim verdict + citations.
- If no memory for that date: say so explicitly.

**Prompt 3 — "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"**
- Date resolver → previous Tuesday; retrieve episode + extracted provider list.
- Current searches for each provider's pricing → diff table.
- Memory supplies *which* providers were discussed (so we don't search the whole market); search supplies *current* prices.

---

## 9. Tradeoffs & what we deliberately reject

- **Rejected: opaque hosted memory (e.g. Supermemory).** Unauditable, vendor lock-in, can't do date-range SQL or source linkage. We want memory we can inspect and test.
- **Rejected: browser-trusted history.** Server-side persisted messages are the only trusted context (prevents injection and tampering).
- **Rejected: fake token streaming.** Strict review buffers; we stream *progress*, not unreviewed tokens. Honesty > perceived speed.
- **Rejected: parallel server/database.** One Postgres is the source of truth; memory is a derived index, not a second store continuously overwriting.
- **Rejected: LLM date math.** Deterministic resolver.
- **Accepted cost: second LLM (reviewer).** ~+1 LLM call per turn. Buys citation discipline and a blocked-verdict safety net. Same-model review has correlated blind spots — we mitigate with deterministic URL checks and "qualify no-source claims" rules, and we state this limit honestly in docs.
- **Accepted cost: async memory sync.** Answers are delivered before memory is durable; retrieval may miss the just-finished turn within the same session (mitigated by short-term context always applying).

---

## 10. Risks, limits, and how we'd measure

- **Extraction errors** compound. Mitigation: confidence thresholds, user correction UI, supersession rather than overwrite, audit trail.
- **Lexical + vector retrieval misses paraphrases.** Mitigation: query rewrite + reranker; honest statement that historical recall is not exhaustive.
- **Embedding model change** requires re-embedding. Mitigation: pin model; migration job.
- **Latency budget**: track first-progress-event time, search deadline, review time, commit time. Target p95 answer < 15s for search turns.
- **Quality metrics**: claim-support rate (reviewer verdict distribution), citation validity rate (deterministic), memory retrieval hit rate (did retrieved memory contain the needed fact), user correction rate.
- **Security**: owner scoping on every query; RLS; no credentials in memory; source-content re-check on retrieval (exclude edited/deleted sources).

---

## 11. Roadmap (next)

1. Hybrid retrieval + reranker (biggest quality lever).
2. Date-aware episode retrieval + deterministic date resolver.
3. Memory inspector UI + per-answer attribution.
4. Retention/deletion controls + export.
5. Procedural memory (answer-style preferences).
6. Evaluation harness replaying the three challenge prompts + a held-out set.
7. Concurrency/watchdog hardening and idempotent commits (already in prior iteration; carry over).

---

## 12. One-paragraph summary

A chat agent whose short-term context is the trusted server-side conversation history; whose long-term memory is split into **merged factual** and **appended episodic** records stored in **PostgreSQL + pgvector** with hybrid (vector + full-text + metadata) retrieval and deterministic date filtering; which extracts memory only from **reviewed, committed** turns asynchronously and idempotently; which treats web search as its single external tool with parallel, deduped, deadline-bounded execution and deterministic citation verification; and which exposes all of this through a **toggle + inspector panel** so memory types, contents, and search activity are visible and controllable. The design optimizes for the challenge's temporal, cross-session, re-verification prompts while being honest about the limits of LLM review and retrieval.

---

## 13. Critique and improvement opportunities

Self-review of the architecture above. Items are ordered within each subsection by expected impact; tags: **[HIGH]** high impact/low cost, **[MED]**, **[LOW]**.

### A. Memory model & extraction

1. **[HIGH] Extraction is a single LLM pass with no verification.** A hallucinated fact becomes durable memory and poisons later turns. *Improve:* two-pass extraction — draft candidates, then a verifier LLM that must quote the supporting span from the source turn; drop candidates without a verifiable span. Add an extraction F1 eval on a labeled set.
2. **[HIGH] Factual merge key is fuzzy (entity overlap + subtype + similarity).** Risks both false merges (distinct facts collapsed) and false splits (duplicate facts). *Improve:* move to structured triples `(entity, attribute, value)` with a canonical schema for common attributes (team_size, preferred_provider, budget); merge on `(entity, attribute)`, version on value change. Keep free-text `content` for display/embedding but key on the triple.
3. **[MED] No handling of negation or corrections.** "Actually we dropped Salesforce" should supersede, not append. *Improve:* extractor emits an explicit `operation: add|update|delete|contradict`; consolidation applies it; store the reason. Negative preferences ("don't want X") become first-class facts.
4. **[MED] Episode granularity is one-record-per-turn.** Long threads produce dozens of near-duplicate episodes and retrieval noise. *Improve:* hierarchical memory — raw turns → session summary (on thread close/idle) → monthly gist; keep raw for recent N days, summaries for older. Retrieval searches the right level by recency.
5. **[MED] No explicit "remember / forget" tool.** Auto-extraction alone misses intent ("remember that our budget is $50k"). *Improve:* add a `memory_write` / `memory_forget` tool the agent can call deliberately, in addition to auto-extraction. Hybrid: explicit writes have confidence 1.0.
6. **[LOW] No confidence calibration.** Thresholds are magic numbers. *Improve:* calibrate extractor confidence on a labeled set; report calibration in evals.

### B. Storage & retrieval

7. **[HIGH] Retrieval scoring weights are hand-tuned (0.55/0.25/0.10/0.10).** Unvalidated. *Improve:* learn weights via a small labeled (query, relevant memory) set; at minimum, run an offline eval and tune. Expose weights as config, not constants.
8. **[HIGH] Pre-turn batch retrieval only.** The agent cannot ask a follow-up memory question mid-reasoning ("what else did we say about X?"). *Improve:* expose `search_memory(query, type?, date_range?)` as an on-demand tool, in addition to pre-injected top-k. This is the biggest architectural lever for "best agent" behavior on multi-hop prompts.
9. **[MED] Paraphrase gap despite hybrid search.** Vector + lexical still misses semantic variants. *Improve:* add query rewriting (LLM expands the user query into 2–3 variants) and HyDE (embed a hypothetical answer) as optional retrieval paths; measure recall@k before adopting.
10. **[MED] No multi-vector per memory.** One embedding per record loses sub-aspects. *Improve:* store separate embeddings for question-facing and answer-facing text of episodes; retrieve against both, dedup by record.
11. **[MED] No memory graph.** Entities are flat tags. *Improve:* entity nodes + edges (memory↔entity, entity↔entity co-occurrence) enabling traversal "everything about HubSpot" and better recall for entity-heavy prompts (prompt 1).
12. **[LOW] HNSW reindex on embedding-model change is manual.** *Improve:* version the embedding model in the row; background re-embed job; retrieval filters by current model and degrades gracefully.
13. **[LOW] No compaction/retention policy defined beyond decay.** *Improve:* periodic job rolls episodes older than N days into summaries and archives raw (already retrievable on demand from cold storage).

### C. Agent loop & web search

14. **[HIGH] Run lock is per-user, too coarse.** Blocks legitimate parallel conversations. *Improve:* per-thread lock; allow concurrent threads for the same user.
15. **[HIGH] Search has no result-quality gate.** Snippets may be irrelevant or stale. *Improve:* add a lightweight relevance filter (LLM or embedding similarity between query and snippet) before synthesis; drop bottom results; fetch full page for top 2–3 when snippet insufficient (Firecrawl) with a time budget.
16. **[MED] No source freshness handling.** "Pricing changed since Monday" needs dates; many results lack `published_date`. *Improve:* prefer sources with dates; when absent, fetch page and extract date; qualify undated sources explicitly.
17. **[MED] Query planning is one LLM call with no feedback.** If first search is weak, no retry. *Improve:* allow one refinement round when evidence is thin (reviewer or a coverage check signals low support), bounded by the deadline.
18. **[MED] Caching TTL is vague.** *Improve:* tiered cache — exact-query cache (minutes) + normalized-entity cache (hours) + never cache "since <date>" queries whose date bucket changes daily.
19. **[LOW] No abstention policy.** Agent should say "I don't know / can't verify" rather than guess. *Improve:* explicit abstention when (memory+search) coverage below threshold; surface as a first-class verdict alongside supported/qualified/blocked.

### D. Temporal reasoning

20. **[HIGH] Date resolver only handles explicit dates.** "A few days ago", "recently", "earlier" are common and currently unresolved. *Improve:* fuzzy temporal parsing with user-timezone awareness; when ambiguous, ask a clarifying question rather than guess (already the stated policy — extend to fuzzy cases).
21. **[MED] No user timezone capture.** Server `now()` vs user local day causes off-by-one on "Monday". *Improve:* store user tz (from browser) and resolve all relative dates in user tz.
22. **[MED] Re-verification is described but not enforced in the loop.** The agent could restate memory instead of re-searching. *Improve:* make "is your answer still correct?" an explicit branch: extract prior claims → targeted searches → per-claim verdict table. Add a prompt-level checklist and a reviewer check that a re-verification turn includes fresh sources.

### E. Review & correctness

23. **[HIGH] Reviewer is same model as synthesizer → correlated blind spots.** *Improve:* use a different provider/model for review (allow a separate "review model" setting), or a small ensemble of 2 reviewers with disagreement → qualified/blocked.
24. **[MED] "Supported" is only within supplied evidence.** Snippets can be wrong/outdated. *Improve:* add source-tier weighting (official docs > primary source > blog) and cross-source corroboration count into the verdict; require ≥2 independent sources for "supported" on high-stakes claims (pricing).
25. **[MED] No sentence-gated streaming.** Strict review blocks all text until done → slow perceived latency. *Improve:* implement the mentioned sentence-level gate: review per sentence/paragraph, release approved chunks, hold back the tail; handle cross-sentence contradictions with a final consistency pass. Measure latency win.
26. **[LOW] No adversarial/consistency test in CI.** *Improve:* add a small suite of "trap" prompts (stale memory, contradictory sources) to catch regressions.

### F. UX / toggle panel

27. **[MED] Raw memory dump may overwhelm.** *Improve:* group by entity/topic, show "why used this turn" explanations, default to compact; advanced view for full list.
28. **[MED] No behavior matrix for toggle combinations.** Memory off + search off leaves an unqualified parametric agent. *Improve:* define and document the 4 combos (mem± × search±) and what the agent is allowed to claim in each; qualify accordingly.
29. **[LOW] No "why did you remember this?" provenance.** *Improve:* each memory entry links to source message + extraction rationale; inspector shows the supporting quote.

### G. Ops, eval, security

30. **[HIGH] No concrete eval harness.** Architecture claims are unmeasured. *Improve:* build a replay harness with (a) the 3 challenge prompts + (b) a held-out set of temporal/cross-session questions with gold answers; metrics: answer correctness, claim-support rate, citation validity, retrieval hit rate (recall@k), latency percentiles. Run on every change.
31. **[MED] Privacy: memory stored in plaintext.** *Improve:* encrypt `content` at rest at column level (or app-level) for sensitive facts; document threat model; GDPR delete-all + export endpoints.
32. **[MED] Observability excludes prompts/answers (privacy) but blocks debugging extraction.** *Improve:* sampled, redacted debug mode (opt-in, admin-only) that logs extraction inputs/outputs for a fraction of turns.
33. **[MED] Memory writes have no rate limit / junk protection.** *Improve:* per-user write quotas + confidence gating + dedup hashing (already) + a "memory health" metric (growth rate, duplicate rate).
34. **[LOW] No backup/DR story for the derived index.** *Improve:* document that memory is rebuildable from messages; add a `rebuild_memory` admin job; test it.

### H. Prioritized next steps (top 5)

1. **On-demand `search_memory` tool** (B.8) — biggest quality lever for multi-hop challenge prompts.
2. **Structured factual triples + supersession** (A.2, A.3) — fixes merge correctness.
3. **Hierarchical episode summaries** (A.4) — keeps retrieval useful as history grows.
4. **Deterministic + fuzzy date resolver with user tz** (D.20, D.21) — directly targets prompts 2 & 3.
5. **Eval harness with the 3 prompts + gold set** (G.30) — makes every other improvement measurable.

The architecture is sound in its bones (derived index, owner scoping, strict review, progress streaming). The largest gaps are (a) memory is *injected* rather than *queryable on demand*, (b) factual merging is fuzzy where it should be structured, and (c) nothing is measured yet. Fixing those three moves it from "reasonable" to "best".