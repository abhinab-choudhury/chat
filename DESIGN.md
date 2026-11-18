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

When Memory is enabled, the assistant can look up earlier conversations. When Web Search is enabled and configured, it can search for current information. Research and comparison answers go through an additional review step before they are saved and shown.

The interface shows progress while this happens. Final answer text arrives after it has been saved. It does not appear word by word while the model is drafting. This adds waiting time, but allows the application to check and save the answer before presenting it.

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

## What should improve next

The first priority is to measure how often the assistant finds the right conversation and supports its comparisons with evidence. Those results should guide changes to retrieval and review.

Before a public release, the application needs authenticated accounts, usage controls, and a tested backup and restore process. Other useful improvements include full-page source reading, clearer memory correction and deletion tools, and generation jobs that can recover after a server restart. These are future work, not existing features.
