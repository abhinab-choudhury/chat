# .Chat: product design and decisions

.Chat is a chat assistant that can use saved conversations and search the web. It helps users return to an earlier discussion and check whether the answer is still useful today.

For example, a user might ask: “Last Tuesday we compared Postgres hosting services. Have any of their prices changed?” The assistant needs to find that conversation, look for current information, and explain what the evidence supports.

This document explains the product and the reasons behind its design. [ARCHITECTURE.md](ARCHITECTURE.md) describes the code and technical limits. [README.md](README.md) has setup instructions.

## What the product should do

The main use cases are:

1. Remember a previous discussion, such as a shortlist of five CRM tools for a 20-person team.
2. Find questions from a particular day, such as “What did I ask on 3 November?”
3. Compare an earlier answer with current information, while clearly saying when a change cannot be verified.

A useful answer should distinguish what the assistant said before from what the sources support now. If the earlier answer was wrong or lacked evidence, the assistant should say so. It should not describe every difference as a real-world change.

## How a conversation works

The user writes a question and chooses whether to enable Memory and Web Search. The server saves the question, loads relevant context, and asks the selected model to prepare an answer.

When Memory is enabled, the assistant can look up earlier conversations. When Web Search is enabled and configured, it can search for current information. Research and comparison answers go through an additional review step before the final answer is saved.

The interface shows progress and draft answer text while the model is working. That draft is provisional: review can change it or replace it with an explanation of what could not be verified. After saving, the server replaces the displayed draft with the final answer. This makes the interface more responsive, but means users can see text before it has been checked.

## Architecture choices

The application uses React and TanStack Start, with a Node.js server in the same project. Keeping the interface and backend together makes the local application easier to run and maintain.

PostgreSQL stores conversations, generation status, and memory. Drizzle provides the database queries and migrations. The pgvector extension lets the same database search for memories with similar meaning, avoiding a separate vector database.

Gemini or OpenAI generates answers. The user selects the provider; the application does not silently switch providers after a failure. Provider keys stay on the server.

Serper supplies web search results. The active chat pipeline uses search excerpts rather than reading full pages, so some answers may need more evidence than the current search can provide.

Ollama creates local embeddings: numerical representations used to find related text. This keeps memory indexing separate from paid generation calls. If Ollama is unavailable, keyword search still works, but recall may be less effective.

Redis is optional. It stores output for replay after a reload. PostgreSQL remains the source of saved conversation history.

## How memory works

The application uses three kinds of context.

### Recent conversation

The assistant uses a limited amount of the current thread even when Memory is off. The server reads the latest 21 messages, identifies the latest user question, and builds a window of up to 20 other messages within a 24,000-character budget. It keeps the last four entries in that window and older entries whose text matches terms in the question.

This keeps the prompt smaller, but simple word matching can miss a relevant earlier message. The assistant does not receive the entire thread on every turn.

### Saved exchanges

An eligible completed turn with Memory enabled creates an episode: a saved question-and-answer pair with its date, source message links, and evidence. Episodes record what was said at the time. They are not automatically verified facts about the present.

The answer and episode are saved in one database transaction. This prevents a successful memory-enabled answer from being saved without its episode. Embeddings are created later by a background worker, with a maximum of three attempts per job.

### User facts

The assistant can save explicit information from the current question, such as a preference. Each fact must include a quote found in that question. A newer assertion with the same fact key replaces the older one for current recall while preserving its history.

The quote check proves where the text came from. It does not prove that the model interpreted it correctly.

## Finding the right memory

Questions about a specific date use a date lookup. The application interprets supported dates in the user's timezone. For example, “last Tuesday” means Tuesday in the previous calendar week. Ambiguous or invalid recognized dates require clarification.

Date results are paginated. They cover eligible saved episodes and certain unfinished memory-enabled runs, rather than every question ever entered. Conversations saved with Memory off are not automatically added later.

Questions about a topic combine keyword search with similarity search. The application combines the rankings from both searches and gives the model a limited set of results. The model can request further searches or read an episode when needed.

Historical messages carry their recording date. A phrase such as “yesterday” in an old message should refer to the day before that message, not the day of the new question. Likewise, an old statement about someone's age is not enough to calculate their exact current age without a birth date. These rules are included in model instructions; the model can still make mistakes.

## Checking whether something changed

A comparison needs the earlier answer, any evidence saved with it, and fresh evidence for the new question. The answer can conclude that a claim is still supported, has changed, was previously unsupported, has conflicting evidence, or cannot be verified.

The application checks that referenced memories and current URLs belong to the evidence available for the request. A supported comparison needs a quote from the earlier answer and current evidence. A “changed” conclusion also requires historical evidence.

These checks reduce unsupported claims, but do not prove that two prices are comparable. The review still needs to consider currency, region, plan, seat count, billing period, taxes, and promotions. Finding a different price today also does not establish when it changed.

The review uses the same selected model as the draft, so both steps can make similar mistakes. If the review blocks an answer, the application saves an explanation of what it could not verify and does not create a memory episode for that turn.

## User controls

| Setting | Effect |
| --- | --- |
| Memory off | Use recent thread context; do not recall other threads or save new episodes. Ordinary chat messages are still saved. |
| Memory on | Recall eligible past exchanges and save eligible new episodes. |
| Web Search off | Answer without fresh web evidence. |
| Web Search on | Search when the provider key and master tool setting allow it. |

The memory library shows the latest 100 episodes, related facts, source links, and indexing status. Users can archive, unarchive, or forget a memory.

Archiving hides a memory from recall and can be reversed. Forgetting excludes the derived memory and removes associated facts and jobs, while keeping the original chat. Turning Memory off does not delete earlier memories.

Editing source messages makes outdated derived records ineligible for relevant memory reads. There is no automatic process that rebuilds all affected memories after an edit.

## Reliability and privacy

The server uses saved database history when generating answers. Browser storage is a cache for the interface. A database claim prevents competing requests from freely starting another generation in the same thread, and completed run IDs can return their saved answers.

A disconnected browser does not by itself stop the server from finishing and saving an answer. Redis can replay output while the producer is alive. If the server process crashes, it cannot resume the model computation. Later application activity detects abandoned runs and can mark them as failed.

This is a local demo without login. Conversations are grouped by an anonymous browser identifier stored in a cookie and browser storage. Because that identifier is controlled by the client, it is not suitable as account authentication for a public multi-user service.

Provider calls are queued and paced within one server process. Rate-limit errors and provider outages have different messages. This reduces bursts but does not enforce a provider's account-wide spending or token quota.

Shared logging records request IDs, status, timing, and token usage while omitting prompts, answers, credentials, and raw provider error bodies. Some older search and Redis paths still use separate console logging.

## How to evaluate the design

Automated tests cover date handling, memory lifecycle, comparison evidence checks, provider failures, streaming, and client history behavior. Database tests require a migrated disposable PostgreSQL database. Mock provider responses test application behavior; they do not measure the quality of live model answers.

Three useful manual checks are:

1. Save a CRM shortlist, then ask in another thread whether those vendors changed pricing. Check that the answer refers to the original shortlist and explains evidence gaps.
2. Save several questions on the same day, then ask for that date. Check the source links and whether more results are available.
3. Ask about a previous hosting comparison with Web Search off, then with Memory off. Check that the answer explains what information is unavailable.

Live answer accuracy, retrieval quality, cost per turn, and response time still need measurement. [docs/memory-evaluation.md](docs/memory-evaluation.md) records earlier verification and its limits.

## Future architecture plans

These are proposed changes, not implemented capabilities. The plan builds on the current PostgreSQL architecture described in [ARCHITECTURE.md](ARCHITECTURE.md). The older Convex/Supermemory description in `docs/next-week-plan.md` does not describe the current application or this roadmap.

### 1. Measure answer quality before changing retrieval

**Decision:** Create a versioned evaluation set covering cross-thread recall, exact dates, corrected facts, pricing comparisons, missing evidence, and questions that should receive an “unverified” answer. Keep deterministic engineering tests and live model evaluations separate.

**Why:** The documented 48-test pass establishes behavior for those fixtures; it does not establish a real-world answer success rate. Measurements should identify whether failures come from retrieval, source quality, or generation before adding more infrastructure.

**Tradeoff:** Human labeling and live evaluations take time and API budget. Use a small repeatable set first, with a held-out set to check improvements. Record model, prompt, embedding, and dataset versions so results remain interpretable.

**Validation:** Report retrieval recall@k (whether expected memories appear among the top k results), claim-support precision (the fraction of checked claims supported by cited evidence), correct abstention on insufficient-evidence cases, and end-to-end task success. Define task success as satisfying the question's labeled rubric without unsupported material claims. Publish sample counts, failure categories, cost per completed turn, and median/p95 time to first draft and final answer. Establish a baseline before choosing numerical release targets.

### 2. Keep a modular application and one authoritative database

**Decision:** Retain TanStack Start and PostgreSQL/pgvector. Make orchestration, retrieval, evidence collection, provider access, and persistence explicit module boundaries. Introduce a separately running worker from the same codebase when durable jobs are added.

**Why:** The existing stack can support the next stage without migrating chat history or operating a second authoritative data store. Clear boundaries allow retrieval and provider changes to be tested independently.

**Tradeoff:** PostgreSQL serves both transactional and retrieval workloads. Measure query plans, index size, and contention; consider a dedicated search service only when measured load or retrieval requirements justify its synchronization cost.

**Validation:** Load-test representative chat and recall traffic together. Preserve atomic answer/memory commits, owner filtering, and stable run IDs across module changes.

### 3. Add authenticated ownership before public access

**Decision:** Replace the client-controlled anonymous scope with server-verified sessions and account ownership. Apply ownership checks to history, memory, tools, jobs, and stream replay. Only introduce workspace roles if shared conversations become a product requirement.

**Why:** The current cookie groups local demo data but does not prove identity. Public users need durable access across devices and enforceable isolation.

**Tradeoff:** Accounts add session management, recovery, and migration work. Do not transfer existing anonymous history to an account solely because it supplies the old identifier; define an explicit, trusted migration process for local data.

**Validation:** Test unauthenticated access, expired sessions, guessed resource IDs, cross-account reads/writes, and stream subscription access. A worker must recheck ownership and source eligibility before publishing results.

### 4. Make generation and indexing recoverable jobs

**Decision:** Persist generation requests and job state in PostgreSQL, then let a dedicated worker claim jobs using leases, heartbeats, bounded retries, and attempt IDs. Start the embedding worker independently of incoming chat requests. Commit a request and its job atomically.

**Why:** Browser disconnection is already handled, but a server crash loses ongoing model computation. Durable scheduling allows abandoned work to be detected and retried without waiting for another user request.

**Tradeoff:** A retry may repeat a paid model call; it cannot resume a provider's interrupted computation. Use at-least-once execution with idempotent final commits, and reject writes from expired attempts. Checkpoint completed tool evidence where safe, with freshness checks before reuse. Define cancellation and retry budgets explicitly.

**Validation:** Kill workers during generation, review, and commit. Confirm jobs recover or reach a visible terminal failure, stale workers cannot overwrite newer attempts, and only one final answer and eligible memory episode commit per run.

### 5. Strengthen evidence before adding more review calls

**Decision:** Add bounded full-page reading for selected search results and store the supporting passage, URL, retrieval time, and content version/hash. Represent comparison claims with structured fields such as plan, currency, region, seat count, and billing period. Treat retrieved content as untrusted data, and restrict fetching to public HTTP(S) destinations with redirect, size, and timeout checks.

**Why:** Search excerpts can omit conditions that determine whether prices are comparable. A second model pass cannot reliably compensate for missing source evidence. A newly captured page also cannot prove what the page said historically.

**Tradeoff:** Fetching and storing passages adds latency, storage, and retention decisions. Read only the sources needed for the claim. Evaluate an independent reviewer for difficult comparisons only if it improves measured quality enough to justify extra cost; it still does not guarantee correctness.

**Validation:** Test mismatched billing periods, stale pages, conflicting sources, missing historical evidence, malicious page instructions, and inaccessible URLs. Present a change as verified only when comparable historical and current evidence supports it; otherwise qualify or abstain.

### 6. Improve memory selection and correction

**Decision:** Preserve exact-date lookup and hybrid keyword/vector retrieval. Use evaluation failures to decide whether to add reranking and source-linked summaries for long threads. Version derived memories and embeddings so source edits can invalidate old versions and enqueue replacements.

**Why:** Term matching can miss relevant context, and current source edits exclude stale memory without automatically rebuilding it. Users need corrections to propagate consistently.

**Tradeoff:** Reranking and summaries add latency or model cost, and summaries may lose details. Keep original messages authoritative and make summaries traceable to them. Never let relevance ranking silently truncate a request for all conversations on a date.

**Validation:** Measure recall and task success against the baseline, including paraphrases and older context. Verify edited, archived, forgotten, and superseded records stay excluded during rebuilds. Use version checks to prevent a delayed job from restoring deleted memory. Embedding-model changes require a versioned reindex and an explicit cutover.

### 7. Enforce shared budgets and observe completed outcomes

**Decision:** Before running multiple application or worker instances, move provider concurrency and quota coordination into a shared store. Add per-account usage limits, an end-to-end deadline, and budgets for generation, review, search, and retries. Reserve estimated usage before calls and reconcile actual usage afterward.

**Why:** The current process-local gate cannot coordinate multiple workers or enforce account-wide budgets. Opening a successful HTTP stream does not mean an answer completed successfully.

**Tradeoff:** Shared coordination introduces contention and another failure mode. Define conservative behavior when budget state is unavailable, and keep provider switching explicit to the user.

**Validation:** Exercise concurrent workers, rate limits, provider outages, cancellations, and exhausted budgets. Correlate request/run IDs across retrieval, tools, review, and commit. Track completed/failed runs, queue age, retry counts, token usage, and cost without recording raw conversation content in operational logs.

### 8. Make recovery and user data controls operational

**Decision:** Define PostgreSQL backup frequency and retention from acceptable data loss and recovery time, and rehearse restoration into an isolated environment. Add clear export, memory correction, and separate actions for forgetting derived memory versus deleting original conversations. Document when deleted data expires from backups.

**Why:** PostgreSQL is the source of truth; browser caches and Redis replay cannot recover lost history. Users should understand and control which data remains stored.

**Tradeoff:** Backups and retained evidence increase storage and operational work. Deletion must also invalidate jobs, vectors, cached results, and replay buffers; restored backups need deletion reconciliation before serving users.

**Validation:** Demonstrate a restore within the chosen recovery objectives and verify deletions remain effective after retries and restoration. Keep Redis an optional delivery aid; final history must remain recoverable from PostgreSQL.

### Proposed flow after these changes

```text
React client → authenticated TanStack API
                         ↓
             PostgreSQL: question + durable job
                         ↓
                 worker claims attempt
                         ↓
         bounded context + date/keyword/vector recall
                         ↓
              Gemini / OpenAI ↔ evidence tools
                         ↓
               validate + conditional review
                         ↓
       atomic answer + evidence + memory + indexing job
                  ↓                       ↓
        final history / stream       Ollama worker
                                          ↓
                                  versioned embeddings

Shared budgets apply to external calls.
Redis may replay progress; PostgreSQL owns durable state.
```

### Delivery order

1. **Measure:** Establish the quality, latency, and cost baseline; keep the current architecture while identifying the largest failures.
2. **Prepare for public use:** Add authenticated ownership, enforce usage budgets, rehearse backup restoration, and define data deletion behavior before exposing the service publicly.
3. **Improve answer quality:** Add source reading and structured comparisons, then change retrieval only where the evaluation shows a benefit.
4. **Improve recovery and scale:** Add durable workers, attempt fencing, and independent indexing. Complete shared quota coordination before running multiple instances. Split additional services only when measured load warrants it.

The intended outcome is better-supported answers, recoverable execution, and measurable operating costs. No success-rate improvement is claimed until the proposed changes are evaluated.
