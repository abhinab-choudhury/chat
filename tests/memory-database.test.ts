import assert from "node:assert/strict";
import test from "node:test";

test("PostgreSQL memory lifecycle, isolation, date recall and vector retrieval", {
	skip: !process.env.TEST_DATABASE_URL,
}, async () => {
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
	const originalFetch = globalThis.fetch;
	let embeddings = 0;
	globalThis.fetch = (async (url) => {
		assert.match(String(url), /\/api\/embed$/); // This suite must NEVER call Gemini.
		embeddings++;
		return Response.json({
			embeddings: [Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0))],
		});
	}) as typeof fetch;
	const { db } = await import("../src/database");
	const { chatThreads, chatMessages } = await import("../src/database/chats");
	const { agentRuns, memoryEpisodes, memoryFacts, memoryJobs } = await import(
		"../src/database/memory"
	);
	const { eq, sql } = await import("drizzle-orm");
	const { commitAnswer, recall, drainMemoryJobs } = await import(
		"../src/lib/memory/service.server"
	);
	const prefix = `test-${crypto.randomUUID()}`;
	const owner = `${prefix}:owner`;
	const threadId = `${prefix}:thread`;
	try {
		await db.insert(chatThreads).values({
			id: threadId,
			userId: owner,
			title: "fixture",
			createdAt: 1,
			updatedAt: 1,
		});
		const makeTurn = async (
			suffix: string,
			content: string,
			date: string,
			memory = true,
		) => {
			const question = {
				id: `${prefix}:q:${suffix}`,
				clientUuid: `${prefix}:q:${suffix}`,
				threadId,
				role: "user",
				content,
				reasoning: null,
				toolData: null,
				createdAt: Date.parse(date),
			};
			const runId = `${prefix}:run:${suffix}`;
			await db.insert(chatMessages).values(question);
			await db.insert(agentRuns).values({
				id: runId,
				threadId,
				questionId: question.id,
				state: "running",
				startedAt: question.createdAt,
				options: { memory },
			});
			await db
				.update(chatThreads)
				.set({ currentStreamId: runId })
				.where(eq(chatThreads.id, threadId));
			return { runId, threadId, userId: owner, question, memory };
		};
		const one = await makeTurn(
			"one",
			"Our sales team has 20 people. We shortlisted HubSpot, Salesforce, Zoho, Pipedrive and Freshsales.",
			"2026-11-16T10:00:00Z",
		);
		const args = {
			...one,
			answer: "Five CRM vendors shortlisted for 20 seats.",
			evidence: {
				evidence: [
					{
						url: "https://example.com/pricing",
						retrievedAt: "2026-11-16T10:00:00Z",
						description: "historical price",
					},
				],
			},
			facts: [
				{
					key: "sales-team:size",
					content: "Sales team: 20 people",
					quote: "20 people",
				},
				{ key: "injected", content: "Invalid", quote: "NOT IN SOURCE" },
			],
		};
		const firstAnswer = await commitAnswer(args);
		assert.equal(
			await commitAnswer(args),
			firstAnswer,
			"duplicate commit returns same answer",
		);
		let facts = await db
			.select()
			.from(memoryFacts)
			.where(eq(memoryFacts.userId, owner));
		assert.equal(facts.length, 1, "unsupported extraction is dropped");
		const date = await recall(
			owner,
			"On Monday which CRM tools?",
			new Date("2026-11-17T12:00:00Z"),
			"UTC",
		);
		assert.equal(date.episodes.length, 1);
		assert.equal(embeddings, 0, "date recall avoids model calls");
		assert.match(String(date.episodes[0].question), /HubSpot/);
		assert.equal(
			(
				await recall(
					"other-owner",
					"on Monday",
					new Date("2026-11-17T12:00:00Z"),
					"UTC",
				)
			).episodes.length,
			0,
		);
		await drainMemoryJobs();
		const [indexed] = await db
			.select()
			.from(memoryEpisodes)
			.where(eq(memoryEpisodes.id, one.runId));
		assert.equal(indexed.embedding?.length, 1024);
		assert.equal(indexed.embeddingModel, "qwen3-embedding:0.6b");
		const semantic = await recall(
			owner,
			"CRM shortlist",
			new Date("2026-11-17T12:00:00Z"),
			"UTC",
		);
		assert.equal(semantic.episodes[0].id, one.runId);
		assert.ok(embeddings >= 2);
		const two = await makeTurn(
			"two",
			"Our sales team now has 25 people",
			"2026-11-17T10:00:00Z",
		);
		await commitAnswer({
			...two,
			answer: "Updated team size.",
			evidence: {},
			facts: [
				{
					key: "sales-team:size",
					content: "Sales team: 25 people",
					quote: "25 people",
				},
			],
		});
		facts = await db
			.select()
			.from(memoryFacts)
			.where(eq(memoryFacts.userId, owner));
		assert.equal(facts.filter((f) => !f.supersededBy).length, 1);
		assert.equal(
			facts.find((f) => !f.supersededBy)?.content,
			"Sales team: 25 people",
		);
		const off = await makeTurn(
			"off",
			"Do not archive",
			"2026-11-17T11:00:00Z",
			false,
		);
		await commitAnswer({
			...off,
			answer: "Memory is off.",
			evidence: {},
			facts: [],
		});
		assert.equal(
			(
				await db
					.select()
					.from(memoryEpisodes)
					.where(eq(memoryEpisodes.id, off.runId))
			).length,
			0,
		);
		assert.equal(
			(
				await db
					.select()
					.from(memoryJobs)
					.where(eq(memoryJobs.episodeId, off.runId))
			).length,
			0,
		);
		await db
			.update(chatMessages)
			.set({ content: "Edited original" })
			.where(eq(chatMessages.id, one.question.id));
		assert.equal(
			(
				await recall(
					owner,
					"on Monday",
					new Date("2026-11-17T12:00:00Z"),
					"UTC",
				)
			).episodes.length,
			0,
			"edited sources immediately excluded",
		);
		const pending = await makeTurn(
			"failed",
			"Postgres hosting pricing?",
			"2026-11-10T10:00:00Z",
		);
		await db
			.update(agentRuns)
			.set({ state: "failed" })
			.where(eq(agentRuns.id, pending.runId));
		const historical = await recall(
			owner,
			"last Tuesday",
			new Date("2026-11-17T12:00:00Z"),
			"UTC",
		);
		assert.equal(
			historical.episodes.length,
			1,
			"unanswered historical questions remain discoverable",
		);
		assert.equal(historical.episodes[0].answer, null);
		assert.equal(
			(
				await recall(
					owner,
					"3 November",
					new Date("2026-11-17T12:00:00Z"),
					"UTC",
				)
			).episodes.length,
			0,
		);
		// Pagination is exhaustive, not vector top-k.
		for (let i = 0; i < 21; i++) {
			const turn = await makeTurn(
				`page${i}`,
				`Question ${i}`,
				"2026-11-03T10:00:00Z",
			);
			await commitAnswer({
				...turn,
				answer: `Answer ${i}`,
				evidence: {},
				facts: [],
			});
		}
		const page = await recall(
			owner,
			"3 November",
			new Date("2026-11-17T12:00:00Z"),
			"UTC",
		);
		assert.equal(page.episodes.length, 20);
		assert.equal(page.coverage.nextOffset, 20);
		assert.equal(
			(
				await recall(
					owner,
					"3 November",
					new Date("2026-11-17T12:00:00Z"),
					"UTC",
					20,
				)
			).episodes.length,
			1,
		);
		await db.delete(chatThreads).where(eq(chatThreads.id, threadId));
		assert.equal(
			(
				await db
					.select()
					.from(memoryEpisodes)
					.where(eq(memoryEpisodes.userId, owner))
			).length,
			0,
			"delete cascades memory",
		);
		assert.equal(
			(await db.select().from(memoryFacts).where(eq(memoryFacts.userId, owner)))
				.length,
			0,
		);
	} finally {
		globalThis.fetch = originalFetch;
		await db.delete(chatThreads).where(eq(chatThreads.id, threadId));
		await db.execute(sql`SELECT 1`);
		await db.$client.end();
	}
});
