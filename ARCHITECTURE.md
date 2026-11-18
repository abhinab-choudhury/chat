# .Chat architecture

Implementation reference, checked against the repository on 18 November 2026.
[DESIGN.md](DESIGN.md) explains the choices and limitations; this document describes the running code.

## Runtime and dependencies

.Chat is a React 19 application using TanStack Start, TanStack Router, Vite, and Nitro on Node.js. Server routes and ordinary server modules implement the backend; there is no separate API service or Convex runtime.

| Dependency | Responsibility | Required? |
| --- | --- | --- |
| PostgreSQL + pgvector, accessed through Drizzle | Canonical chats, runs, source-linked memory, embedding jobs | Yes |
| Gemini or OpenAI through AI SDK | Structured generation, tool continuations, conditional review | A key for the selected provider |
| Serper | Live web search excerpts | Only for configured web search |
| Ollama, `qwen3-embedding:0.6b`, 1,024 dimensions | Local query and episode embeddings | For vector retrieval/enrichment; lexical recall survives its failure |
| Redis + `resumable-stream` | Buffered stream replay and generation liveness leases | Optional; reload replay requires it |
| Zustand and browser storage | UI state, persisted browser cache, model preferences | Client only; not authoritative history |

`docker-compose.yml` supplies PostgreSQL on localhost:5433, Redis on localhost:6379, and optional RedisInsight on localhost:5540. Ollama runs separately. Database schema and migrations are under `src/database/` and `drizzle/`. Migration 0004 enables pgvector and adds lexical GIN, cosine HNSW, owner/date, and due-job indexes.

## Code boundaries

```text
React UI / useThreadChat / Zustand cache
                  |
       TanStack server routes
                  |
       dispatch.server.ts       ownership, run replay, thread claim
                  |
        direct.server.ts        recall, tools, draft, review, commit
          /       |       \
   memory service |    provider.server.ts -> Gemini / OpenAI
       |          +---- Serper search excerpts
 PostgreSQL       |
       |          +---- NDJSON progress and final answer
 embedding jobs
       |
     Ollama                 Redis: optional replay + liveness lease
```

| Location | Responsibility |
| --- | --- |
| `src/hooks/use-thread-chat.ts` | Send, auto-send, resume, progress, error and UI state |
| `src/lib/chat-data.ts` | Browser cache, snapshot reconciliation, refresh deduplication and polling |
| `src/lib/agent/dispatch.server.ts` | Server identity, credential checks, stream/run reuse and thread claims |
| `src/lib/agent/direct.server.ts` | Single generation and persistence pipeline |
| `src/lib/agent/core.ts` | Input schema, system prompt, web tool and draft configuration |
| `src/lib/agent/comparison.ts`, `validation.ts` | Provenance checks, citation checks, review schema and instructions |
| `src/lib/memory/` | Context, recall, atomic commit, date resolution, embedding jobs |
| `src/lib/chat-persistence.server.ts` | Ownership, stream cleanup and abandoned-run recovery |
| `src/lib/resumable-stream.ts` | Redis connections, replay context and generation leases |
| `src/lib/server-logging.ts`, `api-logging.server.ts` | Log formatting and asynchronous request correlation |

## HTTP and identity

| Endpoint | Behavior |
| --- | --- |
| `GET /api/chats` | Owner-scoped threads, ordered by `updatedAt DESC, id ASC` |
| `GET /api/chats?threadId=…` | Selected owned thread and its messages |
| `GET /api/chats?view=memories` | Latest memory episodes and facts for the browser scope |
| `POST /api/chats` | Validated operations: create/rename/delete thread, send/update message, archive/forget memory |
| `POST /api/chat` | Validate chat input, return an NDJSON response, start or reuse generation |
| `GET /api/chat/$streamId/stream?threadId=…` | Replay the matching owned active stream; 204 when no replay applies |

There is no account authentication. The browser creates an `anon-…` ID in localStorage and mirrors it into the `anon-user-id` cookie. Server handlers resolve scope from that cookie, not `body.userId`; missing identity is rejected. This is application-level isolation by a client-controlled identifier, **not authenticated identity or database RLS**. Clearing storage can lose access to the browser's previous scope.

`user-settings.functions.ts` exposes provider availability through a server function. Credentials come from environment variables; they are not returned to the browser. `ai.functions.ts` generates titles by truncating the message locally in a server function, without a model call. Existing settings schema is not the credential authority.

## A chat turn

1. The home view persists a thread and its initial question before navigating and scheduling auto-send. Existing-thread sends persist the question before starting generation. Message `clientUuid` is unique in PostgreSQL.
2. `/api/chat` validates the body. It still accepts a bounded `messages` array for compatibility, but generation reconstructs history from PostgreSQL.
3. Dispatch resolves the cookie owner, checks thread ownership and selected-provider credentials, and checks the requested run ID (`streamId`). Completed runs can return their saved answer; failed/cancelled run IDs are rejected. An existing active stream may be replayed.
4. A conditional thread update claims `currentStreamId`. Competing callers do not freely start another generation in the same thread. This is a database claim, not a process-local mutex.
5. The direct pipeline loads up to 50 recent messages with a 24,000-character context budget and requires the latest context message to be a user question. It inserts a `running` run and optionally recalls memory.
6. AI SDK generates a structured draft with answer, memory IDs, quoted user facts and comparison claims. It can call `web_search`, `search_memory`, and `read_episode` when those capabilities are enabled.
7. Deterministic checks validate memory references and comparison provenance. Comparison prompts, attempted web searches, or current-information keywords trigger a separate structured review using the same selected model. Review moves the run to `reviewing`.
8. Review can support, qualify or block an answer. A blocked review produces an explanatory response and disables memory archival for that turn. Reviewed answers also pass URL citation checks.
9. `commitAnswer` locks and validates the active run, thread claim and unchanged source question. One transaction inserts the assistant message and evidence metadata, completes the run, releases the claim, and—if memory archival is enabled—creates the episode, fact versions and embedding job.
10. Only after commit does the producer emit final answer text and the terminal event. Failure marks the run failed when possible, emits a public error, and releases the stream claim in cleanup.

The actual run states used here are `running`, `reviewing`, `complete` and `failed`; dispatch also rejects a pre-existing `cancelled` state. There is no separate durable generation queue.

## Streaming and recovery

The wire protocol carries preparation/status events, web-tool summaries, answer text, errors and an end marker. The client reader also supports reasoning events, but the current server pipeline buffers the answer rather than streaming model reasoning or unreviewed tokens. The transport tees and drains the producer so client disconnection does not itself stop persistence.

Redis replay is optional and replays the buffered stream from its beginning. Registration failures fall back to direct delivery. A generation lease expires after 30 seconds and is refreshed every 10 seconds. Recovery gives a new claim 30 seconds before checking liveness; without Redis it tolerates claims younger than six minutes. Missing/expired producers can be marked failed when history or dispatch triggers recovery. Reload replay does not restart a model request, and a process crash does not resume generation computation.

## Storage and memory

| Table | Role |
| --- | --- |
| `chat_threads` | Browser owner, title, activity timestamps, active stream claim |
| `chat_messages` | Canonical messages, unique client UUID, optional reasoning/tool metadata |
| `agent_runs` | Run ID, question/answer references, state, start time, options and generic error |
| `memory_episodes` | Source question/answer references and snapshots, evidence JSON, date, archive/forget flags, optional vector/model |
| `memory_facts` | Quoted user assertions keyed by scope-aware strings, episode source, supersession pointer |
| `memory_jobs` | Durable episode enrichment state, attempt count and next-attempt time |

Memory is created only for eligible turns with memory enabled. It is not an exhaustive index of all chat messages. Episodes and facts are committed with the answer; **only embeddings are asynchronous**. Facts must quote a substring of the current question. Updates to a fact key use a transaction advisory lock and supersede an older assertion rather than overwrite its source.

The worker starts on the first chat request, drains once immediately and then every 60 seconds. Generation cleanup also requests a drain. Each drain claims at most one job with `FOR UPDATE SKIP LOCKED`; jobs have at most three attempts and retry delays. The worker rechecks source snapshots and forget state before saving an embedding. There is no cloud embedding fallback.

### Retrieval

- Exact dates resolve in the supplied IANA timezone using a frozen run clock and UTC half-open ranges. Supported forms include ISO dates, `3 November`, weekdays, `last Tuesday`, today and yesterday. `last weekday` means the previous calendar week; an omitted year means the most recent past occurrence. Conflicting recognized dates and invalid dates ask for clarification; arbitrary fuzzy date language is not implemented.
- Exact-date recall returns pages of 20 episodes, plus eligible non-complete memory-enabled runs without an episode. It does not search every historical question saved with memory disabled or without a run.
- Topic recall takes up to 30 PostgreSQL full-text candidates and 30 cosine candidates, filters vectors to the pinned embedding model, and combines ranks with reciprocal rank fusion (`k=60`, at most 10 episodes). Up to 12 current user facts supplement topic recall. Ollama failure yields lexical-only coverage metadata.
- Episode retrieval checks source contents against stored snapshots. Fact retrieval checks the source question. Archive/forget exclusions apply to memory reads. The memory library offers archive/unarchive, forget, indexing status, quotes and source links; it is not a full fact editor or export system.

## Budgets and provider calls

| Control | Current implementation |
| --- | --- |
| Draft loop | At most 5 AI SDK steps; tools disabled on the final step |
| Review | One extra model call when review is required |
| Output cap | 8,000 tokens per draft step/review request |
| History | 50 rows, 24,000 characters; not a tokenizer-based limit |
| Memory tools | 6 combined `search_memory`/`read_episode` calls after initial recall |
| Memory context | 24,000 characters per recall result, 48,000 cumulative |
| Web search | 8 unique query executions, concurrency 3, 15-second tool timeout, at most 5 normalized results per query |
| Model gate | One in-flight fetch per provider per Node process, 1.5-second spacing, queue capped at 8 pending requests |
| Retries | SDK retries disabled; gate permits one retry for transient 5xx, no immediate 429 retry |

A turn can therefore make up to six logical model calls before gate-level retries. A 429 starts a cooldown of at least 60 seconds; transient failures use a shorter cooldown unless the provider requests a longer delay. The gate is process-local, shared across that provider's models, and does not enforce an account's token/minute, daily or billing quota.

Draft generation uses a 180-second abort signal, also passed to review. `limits.ts` additionally declares total/transport/run-expiry constants; they are not all wired into independent runtime timers. These values are not an end-to-end latency guarantee.

## Client history and logging

Thread refreshes merge and sort snapshots instead of moving the active thread to the end. Unchanged records and arrays retain references, sidebar rows are memoized, and simultaneous refreshes for the same scope/target share a request. Polling waits for completion before scheduling another read: nominally five seconds for live threads or 30 seconds idle, with failure backoff capped at 60 seconds. Hidden documents skip polling reads. Strict Mode auto-send is deferred until effect replay settles and claims the pending send once.

API logs distinguish `response.opened` for streaming headers from completed ordinary HTTP requests. AsyncLocalStorage correlates API, agent and provider logs. Agent logs cover generation success/failure, draft step counts, and token usage; provider logs include status, retry/cooldown decisions and allowlisted quota diagnostics. A 200 stream opening does not prove generation succeeded; 429 and 503 are different failures.

Local shared logs are readable; production uses JSON, and `LOG_FORMAT=json` requests JSON locally. Shared diagnostics exclude prompts, answers, credentials and raw provider error bodies. Some Redis/search paths still use older direct console logging; universal redaction and fully uniform formatting are not implemented.

## Verification and operations

```sh
npm run typecheck
npm run check
npm test
npm run build
```

`npm run verify` runs those commands sequentially and stops at the first failure. Tests use Node's test runner through tsx, including mocked provider failures and React Strict Mode coverage. Two database-backed suites require `TEST_DATABASE_URL` pointing to a migrated disposable PostgreSQL/pgvector database; their external AI/search/embedding calls are fixtures, not live quality benchmarks. Expected warning/error logs from failure fixtures can appear in passing test output.

Use `.env.example` and README setup instructions for local configuration. Apply tracked migrations with `npm run db:migrate`; the database role must be able to enable the vector extension. Keep `.env.local` and credentials out of commits. PostgreSQL is authoritative and needs its own backup policy; browser cache and Redis replay are not backups.
