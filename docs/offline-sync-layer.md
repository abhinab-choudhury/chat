# Research: Offline Sync Layer for a Convex-Backed Chat App

> Research report for the `chat` project (TanStack Start + Convex + Better Auth).
> Scope: whether an offline sync layer is needed, its impact on UI performance/speed,
> and how to preserve security and data integrity while integrating with Convex.

---

## 1. Executive summary

- **Convex is reactive and server-authoritative, but it is not offline-first.** It gives
  optimistic updates and real-time subscriptions, yet every read ultimately depends on
  a live WebSocket to the Convex deployment. There is no durable local store, no
  offline write queue, and no resumption of partial sync out of the box.
  ([Convex sync platform](https://www.convex.dev/sync), [State of the Union](https://news.convex.dev/convex-state-of-the-union/))
- **An offline sync layer is worth adding only if the product needs one or more of:**
  offline usage, instant (no-spinner) UI, resilience on flaky networks, or
  multi-device continuity. For a chat app where messages must feel instant and
  survive connectivity drops, the case is strong.
- **It will not be free.** Offline sync moves authorization from Convex query
  functions into Sync Streams / local rules, requires client-generated IDs and
  conflict handling, and introduces a second store (SQLite/IndexedDB) that must be
  kept consistent with the server.
- **Recommended path for Convex today:** **PowerSync + Convex** (experimental) for
  structured data with offline writes, and **Automerge + Convex** (alpha) only for
  collaborative rich-text editing. Convex's own object sync engine is explicitly
  "on hold" and not available. Avoid Zero for offline *writes* (read-only offline).
- **Security/data integrity can be preserved** by keeping Convex mutations as the
  single write authority, enforcing row-level filtering in Sync Streams keyed to the
  authenticated user, using short-lived JWTs with the `convex` audience, and
  treating client optimistic state as pending until the server checkpoint confirms
  durability.

---

## 2. What an "offline sync layer" actually is

An offline sync layer is a **client-side durable store + bidirectional sync protocol**
between that store and the authoritative server store:

| Piece | Role |
|---|---|
| **Local store** | SQLite (PowerSync) or IndexedDB (Automerge/Replicache). UI reads/writes here synchronously. |
| **Sync protocol** | Initial snapshot, incremental deltas, mutation upload queue, checkpoints/cookies. |
| **Server store** | Convex (authoritative). Mutations run here with ACID/serializable isolation. |
| **Authorization boundary** | Which rows reach which device (Sync Streams / query functions). |

This is distinct from:

- **Optimistic updates** (Convex built-in): in-memory, lost on reload, no offline.
- **Caching** (React Query/TanStack): stale-while-revalidate, not a durable offline store.
- **CRDTs** (Automerge/Yjs): conflict-free merging for concurrent edits, not a
  general database sync.

The local-first ideal (Ink & Switch) is "no spinners" and "the network is optional"
([local-first](https://www.inkandswitch.com/local-first/)). An offline sync layer is
the engineering mechanism behind that ideal.

---

## 3. Do we *need* it? (need analysis)

### 3.1 Symptoms that indicate a need

| Symptom in current app | Evidence | Offline sync helps? |
|---|---|---|
| Chat messages need to feel instant | Chat UX expectation | Yes — local write returns immediately |
| Network drops / flaky mobile connections | Mobile users | Yes — queue + replay |
| Reload loses in-flight optimistic state | No durable store | Yes — IndexedDB/SQLite persists |
| Multi-tab consistency | BroadcastChannel needed | Yes (PowerSync/Replicache handle tabs) |
| Large thread history spinners on open | Server round-trip | Yes — preloaded local subset |
| Collaborative editing of a doc | CRDT needed | Yes (Automerge) |

### 3.2 When you do *not* need it

- Purely online, low-latency, server-rendered apps where correctness matters more
  than perceived speed (e.g., billing, admin consoles).
- Apps where every action must be server-validated before the UI changes
  (financial transactions, permission changes).
- When the dataset is huge relative to device storage — partial sync mitigates but
  adds complexity.

### 3.3 Cost / complexity budget

- Re-implement read path authorization in Sync Streams (PowerSync) or local schema.
- Client-generated IDs + mapping to server `_id` (Convex IDs are server-allocated).
- Schema/versioning discipline across code versions (IndexedDB persistence).
- Conflict resolution policy (server-authoritative reconciliation).
- A new operational component (PowerSync Service or Automerge sync) to run/monitor.

**Verdict for this chat app:** Yes, justified — but start with **structured data
(threads/messages/users)** via PowerSync, not CRDTs, unless you add collaborative
document editing.

---

## 4. Performance & speed benefits for the UI

### 4.1 Measured-style benefits (from prior art)

- **Memory-speed reads:** local store queries run in microseconds vs. network RTT
  (50–300 ms). Linear/Figma/Asana object sync engines target "your data next frame
  or your money back" (~16 ms).
  ([Object Sync Engine](https://stack.convex.dev/object-sync-engine))
- **No spinners:** UI renders from local store immediately; server sync happens
  in background.
- **Optimistic writes with rollback:** mutation returns a promise; UI updates
  synchronously, rolls back on server rejection.
- **Partial sync:** only the user's subset of data is on device → smaller memory
  footprint, faster initial load, better battery.
- **Incremental sync:** only deltas after a checkpoint are transferred → low
  bandwidth, fast catch-up after offline periods.
- **Multi-tab coordination:** BroadcastChannel avoids duplicate network work.

### 4.2 Where the gains come from (concretely)

1. **Reads:** `useLocalQuery`/SQL over SQLite instead of Convex `useQuery` → no
   WebSocket round-trip, no server re-execution.
2. **Writes:** local `INSERT`/`UPDATE` returns instantly; upload queue drains async.
3. **Initial load:** preloaded subset from IndexedDB/SQLite → first paint without
   network.
4. **Reactivity:** local store changes propagate synchronously to subscribers.

### 4.3 What you give up / trade-offs

- **Staleness window:** client can be seconds/minutes behind; UI must show sync
  status.
- **Storage cost:** ~100 MB target for rich object graphs; mobile devices have
  tighter limits.
- **Compute on client:** joins/filtering run on device (PowerSync gives SQL, so OK).
- **Two sources of truth during transition:** migration risk.

---

## 5. Security (without compromise)

### 5.1 Threat model

- Stolen device / shared browser leaking persisted data.
- Malicious client tampering with local SQLite/IndexedDB.
- Cross-user data leakage via over-broad sync.
- Token theft / replay.
- Mutation abuse (client sends forged writes).

### 5.2 Controls

| Control | Implementation |
|---|---|
| **Server authority** | Convex mutations remain the only write path that counts. Client writes are *requests* applied via `uploadData()` → Convex mutation. Server can reject. |
| **Row-level sync filtering** | PowerSync Sync Streams filter by `auth.user_id()` (and subqueries for shared resources). Only the user's subset replicates. |
| **Auth tokens** | Short-lived JWTs with `convex` audience; PowerSync configured to accept that audience. Rotated on sign-out. |
| **Encryption at rest** | Use platform secure storage (Keychain/Keystore) for tokens; consider SQLCipher for SQLite on mobile; web IndexedDB is origin-scoped (not encrypted by default — treat as sensitive). |
| **Logout / session expiry** | Clear local store + upload queue on logout; revoke tokens server-side. |
| **Public/shared devices** | Detect (flag on sign-in) → disable persistence or auto-wipe on session end (see Automerge post "public computers" discussion). |
| **Mutation validation** | Convex mutations validate args (`v` validators), check `ctx.auth`, enforce invariants. Never trust client-sent fields like `userId`/`role`. |
| **No client-allocated server IDs** | Convex `_id` stays server-side; client uses UUID mapped in mutations (PowerSync pattern). Prevents ID squatting. |
| **Audit** | Convex logs mutations; add audit tables for sensitive ops. |

### 5.3 Key principle

> **The local store is a cache, not an authority.** Security decisions (who can read
> what, who can write what) are enforced at the server boundary: Sync Streams for
> reads, Convex mutations for writes. The client can be compromised without
> breaking authorization, because the server re-checks every mutation.

---

## 6. Data integrity

### 6.1 Guarantees to preserve

- **Atomicity:** a Convex mutation is a single transaction; all its writes share one
  `_ts`. PowerSync commits them as one transaction → client never sees half a
  mutation.
- **Serializability:** Convex provides serializable isolation. Keep mutations
  server-authoritative; don't let clients bypass them.
- **Idempotency:** Convex mutations support idempotent delivery (Automerge sync
  relies on this). PowerSync upload queue retries safely.
- **Checkpointing:** client advances write checkpoint only after server confirms
  writes are in the replicated stream. Prevents "disappearing writes" glitches.
- **Conflict resolution:** server-authoritative reconciliation — client optimistic
  state rolls back when server state arrives. For concurrent edits to the same
  field, define a policy (last-writer-wins for simple fields; CRDT for
  collaborative text).
- **Schema evolution:** versioned local schema; graceful migrations (optional new
  fields, never required without backfill).

### 6.2 Specific pitfalls

- **Checkpoint stall on idle deployments:** PowerSync's Convex module writes a
  `powersync_checkpoints` row to advance the cursor. You must deploy the
  `createCheckpoint` mutation. ([PowerSync design notes](https://powersync.com/blog/convex-powersync-design-notes))
- **Dropped tables don't emit deletes:** clear table first or delete via mutation.
- **ID mapping cost:** every mutation must map client UUID ↔ Convex `_id`.
- **OCC conflicts** under frequent concurrent writes if you validate every change
  server-side (Automerge server-side validation).
- **Stale local data after logout** if you don't wipe.

---

## 7. Convex integration options (comparison)

| Option | Offline writes | Offline reads | Maturity | Fit for this app |
|---|---|---|---|---|
| **Native Convex (queries + optimistic updates)** | No (queued mutations only) | No (in-memory) | GA | Baseline; keep for online paths |
| **PowerSync + Convex** | Yes (SQLite queue) | Yes (SQLite) | Experimental (Convex module) | **Best for structured data** |
| **Automerge + Convex** | Yes (CRDT) | Yes (IndexedDB) | Alpha/demo | Only for collaborative text editing |
| **Convex object sync engine** | Yes (planned) | Yes (IndexedDB) | On hold | Not available; watch roadmap |
| **Replicache** | Yes | Yes | GA but backend-agnostic | High migration cost; you build sync endpoints |
| **Zero (Rocicorp)** | No (read-only offline) | Yes | GA | Not enough for chat writes |
| **ElectricSQL** | Yes | Yes | GA | Requires Postgres; doesn't fit Convex directly |
| **InstantDB** | Yes | Yes | GA | Would replace Convex, not integrate |

### 7.1 PowerSync + Convex (recommended for structured data)

Architecture:
- PowerSync Service replicates Convex → buckets via Streaming Export API
  (`json_schemas`, `list_snapshot`, `document_deltas`).
- Client SDK keeps a local SQLite DB; reads are SQL.
- Writes go through `uploadData()` → your Convex mutations → server → replicated
  back.
- Sync Streams define partial sync per user.

Pros: offline writes, SQL on client, partial sync, real-time.
Cons: experimental Convex module, rework read path, ID mapping in every mutation,
deploy `createCheckpoint`, Sync Streams duplicate authorization logic.

### 7.2 Automerge + Convex (for collaborative editing only)

- CRDT for text/JSON documents; Convex stores binary changes.
- Convex provides auth, SSR, server workflows, scheduling.
- Not a general database sync; consistency/correctness/convenience trade-offs.

### 7.3 Convex native (keep as foundation)

- Keep Convex mutations as authority.
- Use optimistic updates for online instant feel.
- Use SSR preloading for first paint.

---

## 8. Recommended architecture for this chat app

```
┌─────────────────────────────────────────────┐
│  UI (TanStack Router + React)               │
│   reads/writes → local store (SQLite)       │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  PowerSync Client SDK                       │
│   - local SQLite schema (threads, msgs,     │
│     users)                                  │
│   - upload queue → uploadData()             │
│   - subscriptions to Sync Streams           │
└──────────────┬──────────────────────────────┘
               │ JWT (convex audience)
┌──────────────▼──────────────────────────────┐
│  PowerSync Service (sync streams + buckets)  │
│   replicates from Convex via Streaming      │
│   Export API                                │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Convex (authoritative)                     │
│   - mutations: sendMessage, createThread,    │
│     toggle, delete                          │
│   - queries for SSR / non-synced ops        │
│   - Better Auth → JWT issuance             │
│   - powersync_checkpoints table             │
└─────────────────────────────────────────────┘
```

### 8.1 Sync Streams (example)

```yaml
# sync-streams.yaml (conceptual)
streams:
  user_threads:
    query: |
      SELECT t._id AS id, t.title, t.userId, t.updatedAt
      FROM threads t
      WHERE t.userId = auth.user_id()
    auto_subscribe: true

  thread_messages:
    query: |
      SELECT m._id AS id, m.threadId, m.content, m.authorId, m.createdAt
      FROM messages m
      WHERE m.threadId IN (
        SELECT t._id FROM threads t WHERE t.userId = auth.user_id()
      )
    parameters: [threadId]
```

### 8.2 Mutation shape (client UUID → Convex _id)

```ts
// convex/messages.ts
export const send = mutation({
  args: { clientUuid: v.string(), threadId: v.id("threads"), content: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx); // Better Auth session
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) throw new Error("Forbidden");
    // idempotent: if already inserted, return existing
    const existing = await ctx.db
      .query("messages").withIndex("by_client_uuid", q => q.eq("clientUuid", args.clientUuid))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("messages", {
      clientUuid: args.clientUuid,
      threadId: args.threadId,
      content: args.content,
      authorId: userId,
      createdAt: Date.now(),
    });
  },
});
```

### 8.3 Client-side local schema

```ts
const localSchema = defineLocalSchema({
  threads: defineLocalTable({ id: v.string(), title: v.string(), userId: v.string(), updatedAt: v.number() })
    .index("by_user", ["userId"]),
  messages: defineLocalTable({ id: v.string(), threadId: v.string(), content: v.string(), authorId: v.string(), createdAt: v.number(), clientUuid: v.string() })
    .index("by_thread", ["threadId"]),
});
```

### 8.4 Security checklist for implementation

- [ ] Better Auth issues JWTs with `convex` audience; PowerSync instance accepts it.
- [ ] Every Convex mutation calls `requireUser` and checks ownership.
- [ ] Mutations validate all args with `v.*`; never accept `userId`/`role` from client.
- [ ] Sync Streams filter by `auth.user_id()` and subqueries; no "sync everything".
- [ ] Deploy `createCheckpoint` mutation; register in PowerSync config.
- [ ] Clear local DB + queue on logout/session expiry.
- [ ] Disable persistence on shared/public device flag.
- [ ] Add `clientUuid` index for idempotency.
- [ ] Version local schema; write migration notes.
- [ ] Monitor replication lag and checkpoint delivery.
- [ ] Keep Convex queries for SSR/online-only operations (search, admin).

---

## 9. Risks & open questions

1. **Convex module is experimental** — API and semantics may change; pin versions.
2. **Object sync engine on hold** — Convex may ship a better native solution later;
   design to be able to swap PowerSync out.
3. **Authorization duplication** — Sync Streams must mirror Convex query auth;
   drift risk. Add tests comparing the two.
4. **ID mapping boilerplate** — every mutation needs UUID handling; generate
   helpers.
5. **Storage/battery on mobile** — measure; consider eviction of old threads.
6. **Conflict UX** — define how to surface rejected writes to users.
7. **Public device policy** — product decision needed.

---

## 10. Conclusion

An offline sync layer is **justified for this chat app** because chat UX demands
instant, resilient messaging and the app already targets mobile/web users on
unreliable networks. It will materially improve perceived speed (memory-speed
reads, no spinners, instant writes) and resilience (offline queue, persistence).

Security and data integrity are preserved by **keeping Convex as the single
authority**: Sync Streams gate what reaches each device, Convex mutations
re-validate every write, JWTs scope access, and server-authoritative reconciliation
rolls back bad optimistic state. The cost is duplicated authorization logic,
client-ID mapping, and an extra operational component.

**Recommended next step:** prototype PowerSync + Convex on a single entity
(`messages`) behind a feature flag, measure latency/consistency, then expand to
`threads`. Defer Automerge/CRDTs until collaborative editing is a real requirement.

---

## 11. References

- Convex Sync platform — https://www.convex.dev/sync
- Convex State of the Union — https://news.convex.dev/convex-state-of-the-union/
- What is Sync? — https://stack.convex.dev/sync
- An Object Sync Engine for Local-first Apps — https://stack.convex.dev/object-sync-engine
- A Map of Sync — https://stack.convex.dev/a-map-of-sync
- Going local-first with Automerge and Convex — https://stack.convex.dev/automerge-and-convex
- Convex + PowerSync design notes — https://powersync.com/blog/convex-powersync-design-notes
- PowerSync docs (Convex) — https://docs.powersync.com (source-db, handling-writes, sync/streams)
- PowerSync Convex todo demo — https://github.com/powersync-community/powersync-convex-todolist-demo
- curvilinear (Convex local sync alpha) — https://github.com/get-convex/curvilinear
- Convex auth best practices — https://stack.convex.dev/authentication-best-practices-convex-clerk-and-nextjs
- Offline-first (Android) — https://developer.android.com/topic/architecture/data-layer/offline-first
- Ink & Switch local-first — https://www.inkandswitch.com/local-first/
- Zero sync engine — https://zero.rocicorp.dev
- Replicache — https://replicache.dev
- Local-first landscape — https://www.localfirst.fm/landscape
