import assert from "node:assert/strict";
import test from "node:test";

test("Gemini and OpenAI acceptance prompts: memory -> live evidence -> review -> atomic delivery", {
	skip: !process.env.TEST_DATABASE_URL,
}, async () => {
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
	process.env.OPENAI_API_KEY = "offline-fixture-only";
	process.env.GEMINI_API_KEY = "offline-fixture-only";
	process.env.SERPER_API_KEY = "offline-fixture-only";
	const originalFetch = globalThis.fetch;
	const url = "https://vendor.example/pricing";
	let stage = 0;
	let baselineId = "";
	let googleCalls = 0;
	const prefix = `agent-test-${crypto.randomUUID()}`;
	globalThis.fetch = (async (input, init) => {
		const target = String(input);
		if (target.includes("/api/embed"))
			return Response.json({ embeddings: [Array(1024).fill(0.1)] });
		if (target.includes("google.serper.dev"))
			return Response.json({
				organic: [
					{
						title: "Official pricing",
						link: url,
						snippet: "Current plan: $25 per seat monthly",
						position: 1,
					},
				],
			});
		assert.match(target, /generativelanguage.googleapis.com|api.openai.com/);
		const request = JSON.parse(String(init?.body));
		googleCalls++;
		let part: Record<string, unknown>;
		if (stage++ === 0)
			part = {
				functionCall: {
					name: "web_search",
					args: { query: "site:vendor.example pricing" },
				},
			};
		else if (stage === 2)
			part = {
				text: JSON.stringify({
					answer: `Draft: Price changed. [Official pricing](${url})`,
					memoryIds: [baselineId],
					userFacts: [],
					comparisons: [
						{
							claim: "Plan price",
							baselineEpisodeId: baselineId,
							historicalClaim: "$20 per seat monthly",
							currentEvidenceUrls: [url],
							verdict: "changed",
						},
					],
				}),
			};
		else {
			assert.match(JSON.stringify(request), /evidence/);
			part = {
				text: JSON.stringify({
					status: "qualified",
					answer: `Reviewed: The old answer said $20 per seat monthly; the current source shows $25. The effective change date is unknown. [Official pricing](${url})`,
					note: "No effective change date in current excerpt.",
				}),
			};
		}
		if (target.includes("api.openai.com")) {
			assert.match(target, /chat\/completions$/);
			assert.equal(request.model, "gpt-5.6-luna");
			assert.ok(!("providerOptions" in request));
			const call = part.functionCall as
				| { name: string; args: unknown }
				| undefined;
			return Response.json({
				id: "fixture-completion",
				object: "chat.completion",
				created: 1,
				model: request.model,
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: part.text ?? null,
							...(call
								? {
										tool_calls: [
											{
												id: "fixture-call",
												type: "function",
												function: {
													name: call.name,
													arguments: JSON.stringify(call.args),
												},
											},
										],
									}
								: {}),
						},
						finish_reason: call ? "tool_calls" : "stop",
					},
				],
				usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
			});
		}
		return Response.json({
			candidates: [
				{
					content: {
						role: "model",
						parts: [
							{
								...part,
								...(stage === 1
									? { thoughtSignature: "fixture-signature" }
									: {}),
							},
						],
					},
					finishReason: "STOP",
				},
			],
			usageMetadata: {
				promptTokenCount: 10,
				candidatesTokenCount: 10,
				totalTokenCount: 20,
			},
		});
	}) as typeof fetch;
	const { db } = await import("../src/database");
	const { chatThreads, chatMessages } = await import("../src/database/chats");
	const { agentRuns, memoryEpisodes } = await import("../src/database/memory");
	const { eq } = await import("drizzle-orm");
	const { openDirectStream } = await import("../src/lib/agent/direct.server");
	const { resolveDate } = await import("../src/lib/memory/temporal");
	const prompts = [
		"On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?",
		"What did I ask you on 3 November? Is your answer still correct today?",
		"Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?",
	];
	const threads: string[] = [];
	try {
		for (let i = 0; i < prompts.length * 2; i++) {
			stage = 0;
			const owner = `${prefix}:owner:${i}`;
			const oldThread = `${prefix}:old:${i}`;
			const newThread = `${prefix}:new:${i}`;
			const runId = `${prefix}:run:${i}`;
			threads.push(oldThread, newThread);
			baselineId = `${prefix}:baseline:${i}`;
			const date = resolveDate(prompts[i % prompts.length], new Date(), "UTC");
			assert.ok(date);
			await db.insert(chatThreads).values(
				[oldThread, newThread].map((id) => ({
					id,
					userId: owner,
					title: "Fixture",
					createdAt: 1,
					updatedAt: 1,
					currentStreamId: id === newThread ? runId : null,
				})),
			);
			const qId = `${prefix}:old-question:${i}`,
				aId = `${prefix}:old-answer:${i}`;
			await db.insert(chatMessages).values([
				{
					id: qId,
					clientUuid: qId,
					threadId: oldThread,
					role: "user",
					content:
						"Compare HubSpot, Salesforce, Zoho, Pipedrive, Freshsales and Postgres hosting for 20 seats.",
					createdAt: date.from + 10000,
				},
				{
					id: aId,
					clientUuid: aId,
					threadId: oldThread,
					role: "assistant",
					content: "$20 per seat monthly",
					createdAt: date.from + 11000,
				},
				{
					id: `${prefix}:new-question:${i}`,
					clientUuid: `${prefix}:new-question:${i}`,
					threadId: newThread,
					role: "user",
					content: prompts[i % prompts.length],
					createdAt: Date.now(),
				},
			]);
			await db.insert(memoryEpisodes).values({
				id: baselineId,
				userId: owner,
				threadId: oldThread,
				questionId: qId,
				answerId: aId,
				questionAt: date.from + 10000,
				question:
					"Compare HubSpot, Salesforce, Zoho, Pipedrive, Freshsales and Postgres hosting for 20 seats.",
				answer: "$20 per seat monthly",
				evidence: {
					evidence: [
						{
							url,
							description: "Historical price $20",
							retrievedAt: new Date(date.from).toISOString(),
						},
					],
				},
			});
			const stream = await openDirectStream(
				new Request("http://localhost/api/chat"),
				{
					threadId: newThread,
					streamId: runId,
					userId: owner,
					messages: [
						{
							role: "user",
							content:
								"Untrusted browser history must not replace the question",
						},
					],
					model: i < prompts.length ? "gemini-3.5-flash-lite" : "gpt-5.6-luna",
					memory: true,
					webSearch: true,
					timezone: "UTC",
				},
			);
			const events = (await new Response(stream).text())
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			assert.ok(!events.some((e) => e.t === "err"), JSON.stringify(events));
			const text = events
				.filter((e) => e.t === "t")
				.map((e) => e.d)
				.join("");
			assert.match(text, /^Reviewed:/);
			assert.doesNotMatch(text, /Draft:/);
			assert.ok(
				events.findIndex((e) => e.d === "validating") <
					events.findIndex((e) => e.t === "t"),
			);
			const [run] = await db
				.select()
				.from(agentRuns)
				.where(eq(agentRuns.id, runId));
			assert.equal(run.state, "complete");
			assert.ok(run.answerId);
			const [saved] = await db
				.select()
				.from(chatMessages)
				.where(eq(chatMessages.id, run.answerId));
			assert.equal(saved.content, text);
			const provenance = saved.toolData as {
				memoryIds: string[];
				comparisons: unknown[];
				evidence: unknown[];
			};
			assert.deepEqual(provenance.memoryIds, [baselineId]);
			assert.equal(provenance.comparisons.length, 1);
			assert.ok(provenance.evidence.length);
		}
		assert.equal(
			googleCalls,
			18,
			"one tool step, synthesis and reviewer per fixture; no extraction/title calls",
		);
	} finally {
		globalThis.fetch = originalFetch;
		for (const id of threads)
			await db.delete(chatThreads).where(eq(chatThreads.id, id));
		// Allow post-commit local embedding work to settle before closing the fixture pool.
		const { drainMemoryJobs } = await import(
			"../src/lib/memory/service.server"
		);
		await drainMemoryJobs();
		await db.$client.end();
	}
});
