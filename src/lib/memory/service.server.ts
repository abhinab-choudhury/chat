import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "#/database";
import { chatMessages, chatThreads } from "#/database/chats";
import {
	agentRuns,
	memoryEpisodes,
	memoryFacts,
	memoryJobs,
} from "#/database/memory";
import { EMBEDDING_MODEL, embedText } from "./embeddings.server";
import { reciprocalRankFusion, resolveDate } from "./temporal";
export async function threadContext(threadId: string) {
	const rows = await db
		.select()
		.from(chatMessages)
		.where(eq(chatMessages.threadId, threadId))
		.orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
		.limit(50);
	const context = [];
	let budget = 24000;
	for (const row of rows) {
		if (row.role !== "user" && row.role !== "assistant") continue;
		if (row.content.length > budget && context.length) break;
		context.push({
			role: row.role as "user" | "assistant",
			content: row.content.slice(0, budget),
		});
		budget -= row.content.length;
		if (budget <= 0) break;
	}
	return {
		messages: context.reverse(),
		question: rows.find((m) => m.role === "user"),
	};
}
export async function recall(
	userId: string,
	query: string,
	now: Date,
	timezone: string,
	offset = 0,
) {
	const range = resolveDate(query, now, timezone);
	// Validate source contents at read time, so edits immediately invalidate projections.
	const valid = sql`e.user_id = ${userId} AND NOT e.archived AND NOT e.forgotten
 AND q.content = e.question AND a.content = e.answer`;
	const base = sql`FROM memory_episodes e JOIN chat_messages q ON q.id = e.question_id JOIN chat_messages a ON a.id = e.answer_id`;
	if (range) {
		const rows = await db.execute(sql`
   SELECT * FROM (
    SELECT e.id, e.thread_id, e.question_id, e.answer_id, e.question_at, e.question, e.answer, e.evidence, 'complete' AS status ${base}
    WHERE ${valid} AND e.question_at >= ${range.from} AND e.question_at < ${range.to}
    UNION ALL
    (SELECT DISTINCT ON (q.id) r.id, r.thread_id, r.question_id, NULL AS answer_id, q.created_at AS question_at, q.content AS question, NULL AS answer, '{}'::jsonb AS evidence, r.state AS status
    FROM agent_runs r JOIN chat_messages q ON q.id = r.question_id JOIN chat_threads t ON t.id = r.thread_id
    WHERE t.user_id = ${userId} AND r.options->>'memory' = 'true' AND r.state != 'complete'
      AND q.created_at >= ${range.from} AND q.created_at < ${range.to}
 AND NOT EXISTS (SELECT 1 FROM memory_episodes prior WHERE prior.question_id = q.id)
 ORDER BY q.id, r.started_at DESC)
   ) history ORDER BY question_at, id LIMIT 21 OFFSET ${offset}`);
		return {
			episodes: rows.rows.slice(0, 20),
			coverage: {
				date: range.label,
				offset,
				nextOffset: rows.rows.length > 20 ? offset + 20 : null,
				exact: true,
			},
		};
	}
	const lexical =
		await db.execute(sql`SELECT e.id, e.thread_id, e.question_id, e.answer_id, e.question_at, e.question, e.answer, e.evidence ${base} WHERE ${valid}
 AND to_tsvector('english', e.question || ' ' || e.answer) @@ plainto_tsquery('english', ${query})
 ORDER BY ts_rank_cd(to_tsvector('english', e.question || ' ' || e.answer), plainto_tsquery('english', ${query})) DESC LIMIT 30`);
	let semantic: Record<string, unknown>[] = [];
	let vectorStatus = "ready";
	try {
		const embedding = JSON.stringify(await embedText(query, true));
		const result = await db.execute(
			sql`SELECT e.id, e.thread_id, e.question_id, e.answer_id, e.question_at, e.question, e.answer, e.evidence ${base} WHERE ${valid} AND e.embedding_model = ${EMBEDDING_MODEL} AND e.embedding IS NOT NULL ORDER BY e.embedding <=> ${embedding}::vector LIMIT 30`,
		);
		semantic = result.rows;
	} catch {
		vectorStatus = "unavailable; lexical recall only";
	}
	const episodes = reciprocalRankFusion([lexical.rows, semantic] as ({
		id: string;
	} & Record<string, unknown>)[][]);
	const facts = await db
		.select({
			id: memoryFacts.id,
			content: memoryFacts.content,
			quote: memoryFacts.quote,
			episodeId: memoryFacts.episodeId,
			threadId: memoryEpisodes.threadId,
			question: memoryEpisodes.question,
			answer: memoryEpisodes.answer,
			questionAt: memoryEpisodes.questionAt,
			evidence: memoryEpisodes.evidence,
		})
		.from(memoryFacts)
		.innerJoin(memoryEpisodes, eq(memoryEpisodes.id, memoryFacts.episodeId))
		.innerJoin(chatMessages, eq(chatMessages.id, memoryEpisodes.questionId))
		.where(
			and(
				eq(memoryFacts.userId, userId),
				eq(memoryEpisodes.forgotten, false),
				eq(memoryEpisodes.archived, false),
				sql`${memoryFacts.supersededBy} IS NULL`,
				sql`${chatMessages.content} = ${memoryEpisodes.question}`,
			),
		)
		.orderBy(desc(memoryFacts.createdAt))
		.limit(12);
	return {
		episodes,
		facts,
		coverage: {
			exact: false,
			vectorStatus,
			candidateCount: new Set([...lexical.rows, ...semantic].map((x) => x.id))
				.size,
		},
	};
}

export async function commitAnswer(args: {
	runId: string;
	threadId: string;
	userId: string;
	question: typeof chatMessages.$inferSelect;
	answer: string;
	evidence: unknown;
	memory: boolean;
	facts: { key: string; content: string; quote: string }[];
}) {
	return db.transaction(async (tx) => {
		const [run] = await tx
			.select()
			.from(agentRuns)
			.where(eq(agentRuns.id, args.runId))
			.for("update");
		if (run?.state === "complete") return run.answerId;
		if (!run || !["running", "reviewing"].includes(run.state))
			throw new Error("Run is no longer active");
		const [thread] = await tx
			.select()
			.from(chatThreads)
			.where(eq(chatThreads.id, args.threadId))
			.for("update");
		if (thread?.currentStreamId !== args.runId)
			throw new Error("Run lease expired");
		const [source] = await tx
			.select()
			.from(chatMessages)
			.where(eq(chatMessages.id, args.question.id))
			.for("share");
		if (!source || source.content !== args.question.content)
			throw new Error("Question changed during generation");
		const id = `msg-${crypto.randomUUID()}`;
		await tx.insert(chatMessages).values({
			id,
			clientUuid: `${args.runId}:assistant`,
			threadId: args.threadId,
			role: "assistant",
			content: args.answer,
			createdAt: Date.now(),
			toolData: args.evidence,
		});
		if (args.memory) {
			await tx.insert(memoryEpisodes).values({
				id: args.runId,
				userId: args.userId,
				threadId: args.threadId,
				questionId: args.question.id,
				answerId: id,
				questionAt: args.question.createdAt,
				question: args.question.content,
				answer: args.answer,
				evidence: args.evidence,
			});
			await tx.insert(memoryJobs).values({
				id: `${args.runId}:enrich-v1`,
				episodeId: args.runId,
				nextAttemptAt: Date.now(),
			});
			for (const fact of [...args.facts]
				.sort((a, b) => a.key.localeCompare(b.key))
				.filter((f) => args.question.content.includes(f.quote))) {
				await tx.execute(
					sql`SELECT pg_advisory_xact_lock(hashtext(${args.userId + fact.key}))`,
				);
				const [prior] = await tx
					.select()
					.from(memoryFacts)
					.where(
						and(
							eq(memoryFacts.userId, args.userId),
							eq(memoryFacts.key, fact.key),
							sql`${memoryFacts.supersededBy} IS NULL`,
						),
					)
					.limit(1);
				if (prior && prior.createdAt >= args.question.createdAt) continue;
				const factId = crypto.randomUUID();
				await tx.insert(memoryFacts).values({
					id: factId,
					episodeId: args.runId,
					userId: args.userId,
					...fact,
					createdAt: args.question.createdAt,
				});
				if (prior)
					await tx
						.update(memoryFacts)
						.set({ supersededBy: factId })
						.where(eq(memoryFacts.id, prior.id));
			}
		}
		await tx
			.update(agentRuns)
			.set({ state: "complete", answerId: id })
			.where(eq(agentRuns.id, args.runId));
		await tx
			.update(chatThreads)
			.set({
				currentStreamId: null,
				streamStartedAt: null,
				updatedAt: Date.now(),
			})
			.where(eq(chatThreads.id, args.threadId));
		return id;
	});
}
let draining = false;
/** Durable jobs, bounded to one episode per drain; pending work resumes on the next chat request. */
export async function drainMemoryJobs() {
	if (draining) return;
	draining = true;
	try {
		const job = await db.transaction(async (tx) => {
			const [row] = await tx
				.select()
				.from(memoryJobs)
				.where(
					and(
						sql`${memoryJobs.state} IN ('pending', 'running')`,
						sql`${memoryJobs.nextAttemptAt} <= ${Date.now()}`,
						sql`${memoryJobs.attempts} < 3`,
					),
				)
				.orderBy(asc(memoryJobs.nextAttemptAt))
				.limit(1)
				.for("update", { skipLocked: true });
			if (!row) return;
			await tx
				.update(memoryJobs)
				.set({
					state: "running",
					attempts: row.attempts + 1,
					nextAttemptAt: Date.now() + 300000,
				})
				.where(eq(memoryJobs.id, row.id));
			return row;
		});
		if (!job) return;
		try {
			const [episode] = await db
				.select()
				.from(memoryEpisodes)
				.where(eq(memoryEpisodes.id, job.episodeId));
			if (!episode || episode.forgotten) {
				await db.delete(memoryJobs).where(eq(memoryJobs.id, job.id));
				return;
			}
			const embedding = await embedText(
				`${episode.question}\n${episode.answer}`,
			);
			await db.transaction(async (tx) => {
				const [current] = await tx
					.select()
					.from(memoryEpisodes)
					.where(eq(memoryEpisodes.id, episode.id))
					.for("update");
				if (!current || current.forgotten) return;
				const sources = await tx
					.select()
					.from(chatMessages)
					.where(
						sql`${chatMessages.id} IN (${episode.questionId}, ${episode.answerId})`,
					)
					.for("share");
				if (
					!sources.some(
						(s) =>
							s.id === episode.questionId && s.content === episode.question,
					) ||
					!sources.some(
						(s) => s.id === episode.answerId && s.content === episode.answer,
					)
				)
					return;
				await tx
					.update(memoryEpisodes)
					.set({ embedding, embeddingModel: EMBEDDING_MODEL })
					.where(eq(memoryEpisodes.id, episode.id));
				await tx
					.update(memoryJobs)
					.set({ state: "complete" })
					.where(eq(memoryJobs.id, job.id));
			});
		} catch {
			await db
				.update(memoryJobs)
				.set({
					state: job.attempts >= 2 ? "failed" : "pending",
					nextAttemptAt: Date.now() + 60000 * 2 ** job.attempts,
				})
				.where(eq(memoryJobs.id, job.id));
		}
	} finally {
		draining = false;
	}
}
