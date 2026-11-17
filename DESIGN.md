# .Chat — memory and evidence pipeline

**One existing app.** The React UI, Better Auth, encrypted provider settings and Convex message subscriptions stay in place. `/api/chat` is now a small authenticated credential bridge; the agent, retrieval, review and commits execute in a Convex HTTP action using `@convex-dev/agent`. Provider keys travel server-to-server for this request only, never into workflow arguments or memory documents. A short-lived HMAC envelope authenticates the bridge; request IDs prevent replayed generations.

## Flow and latency

`Submit → immediate UI status → context → research/draft → evidence review → commit → answer`

The original endpoint already used NDJSON; SSR was not the cause of model latency. The UI now shows an optimistic preparing state at submit, and the response flushes a status event before authentication, settings lookup or Redis registration. Convex emits memory, research, review and save stages. Stream errors and incomplete EOF now fail visibly instead of being mistaken for successful answers.

**Strict review has a real cost:** raw draft tokens cannot be shown while promising review before delivery. This implementation streams progress and search activity immediately, buffers the draft, reviews it, persists the approved answer, then emits its text. It does not fake token-by-token typing. A later sentence-by-sentence gate could release approved chunks sooner, but must handle cross-sentence contradictions and adds review calls. Transport progress fixes an idle-looking interface; it does not eliminate inference time.

## Two memory layers, one source of truth

**Short term:** the latest 20 persisted messages, capped at 32,000 characters, loaded from the existing thread on the server. Browser-supplied assistant history is no longer trusted as model context.

**Long term:** dated records of completed reviewed exchanges, indexed by owner and searchable text. Retrieval combines six lexical matches with six recent records, bounded to 16,000 characters. Each record keeps the original question, answer, source-message references, observation time and review metadata. Historical statements remain historical claims, not verified current facts. The memory toggle controls cross-chat retrieval and future archival; recent thread context always applies. Existing conversations are not automatically backfilled in this first version.

**Synchronization:** the answer commit atomically starts a durable `@convex-dev/workflow` projection. It copies accepted turns into memory asynchronously and idempotently by source ID. Failed drafts never enter memory. Retrieval checks current ownership, archive state, and both question/answer source content, excluding deleted or edited sources. This is a derived index, not two databases continuously overwriting each other. Old source records remain stored until a future retention/cleanup policy removes them.

## Evidence review and limits

Web search remains the only external agent tool. Existing provider adapters, budgets, deduplication and deadlines are reused. A separate reviewer sees the draft, exact bounded source excerpts and conversation evidence. It returns a supported, qualified or blocked verdict plus a revised answer. A deterministic URL check rejects citations absent from retrieved evidence. Only reviewed text is committed to the component and existing UI messages; no unreviewed reasoning is sent to the browser. A watchdog marks abandoned runs failed.

A second LLM is not a truth oracle. “Supported” means supported within supplied evidence; snippets can be incomplete or wrong, and same-model review has correlated blind spots. No-source current claims must be qualified. Lexical retrieval misses paraphrases and is not exhaustive historical/date recall. These are evaluation targets, not hidden guarantees.

## Tradeoffs and next week

Kept the existing optional Redis transport for reload compatibility; it is not the memory engine. Rejected a parallel server/database, opaque hosted memory, fake streaming, and promoting drafts to durable context. Tests cover ownership, replay/concurrency, idempotent commits/workflow sync, failed-run exclusion, memory isolation, changed sources, signed envelopes and stream failures. Next: measure live claim support and first-status/answer latency; improve dated/hybrid retrieval and corrections; add retention controls; harden the older public Convex APIs, whose client-supplied identity pattern predates this pipeline.
