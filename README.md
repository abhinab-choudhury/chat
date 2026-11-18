# .Chat

TanStack Start chat with PostgreSQL/pgvector memory, local Ollama embeddings,
Gemini or OpenAI answers, and optional Serper web search. No login; conversations are scoped
to an anonymous browser cookie. Run locally; this is not an authenticated public service.

## Setup

Requires Node.js 22+, Docker, and Ollama.

```sh
npm install
cp .env.example .env.local
# Set OPENAI_API_KEY or GEMINI_API_KEY in .env.local; add SERPER_API_KEY for web search.
docker compose up -d postgres
ollama pull qwen3-embedding:0.6b
# Start Ollama with `ollama serve` if it is not already running.
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Enable Memory in the chat controls; inspect, archive,
or forget memories at `/library`. Correct facts by editing their source messages.

- `DATABASE_URL`: PostgreSQL with the `vector` extension (Docker includes it).
- `OLLAMA_BASE_URL`: defaults to `http://localhost:11434`. Embeddings use
  `qwen3-embedding:0.6b`, 1,024 dimensions; changing models requires reindexing.
- `OPENAI_API_KEY`: server-only. OpenAI defaults to `gpt-5.6-luna`; override with `OPENAI_MODEL`.
- `GEMINI_API_KEY`: server-only. `GEMINI_MODEL` optionally sets the Gemini default.
- Choose either provider in the chat model menu or Settings → Models. Both support tool calling.
  ChatGPT Plus does not include API usage; API credits are billed separately.
- `SERPER_API_KEY`: optional, enables current web evidence.
- `REDIS_URL`: optional stream replay; start with `docker compose up -d redis`.

## Behavior

Server history is authoritative. Memory combines exact-date recall, PostgreSQL
full-text search, and vector retrieval. Episodes commit with answers; local
embedding jobs retry at most three times. The worker wakes on the first chat
request after startup and then every minute. Older chats are not silently backfilled.
Memory off keeps current-thread context but disables cross-thread recall and new
memory writes. Forgetting removes derived memory, not the original chat.

Draft answers stream while generation runs. Research answers are reviewed and saved,
then replace the provisional draft. Evidence,
comparison verdicts, and memory references are saved with each answer. Search
currently uses excerpts; missing historical evidence is not proof of a change.
Model requests are serialized per provider per Node process, paced, and retried once for
transient errors, with cooldown on overload. Titles and embeddings use no cloud model
calls. Run a single application process for this local demo.

## Check

```sh
npm run typecheck
npm test
npm run build
```

Tests use fake providers and do not spend API quota. Optional database integration:
set `TEST_DATABASE_URL` to a disposable, migrated PostgreSQL database, then run
`npm test`. Never point it at your application database.
