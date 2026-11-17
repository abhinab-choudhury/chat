import assert from "node:assert/strict";
import test from "node:test";
import { createProviderGate } from "../src/lib/agent/provider.server";
import {
	EMBEDDING_DIMENSIONS,
	embedText,
} from "../src/lib/memory/embeddings.server";
import { reciprocalRankFusion, resolveDate } from "../src/lib/memory/temporal";

const now = new Date("2026-11-17T12:00:00Z");
for (const [query, date] of [
	["last Tuesday", "2026-11-10"],
	["on Monday", "2026-11-16"],
	["3 November", "2026-11-03"],
	["25 December", "2025-12-25"],
	["2024-02-29", "2024-02-29"],
	["yesterday", "2026-11-16"],
] as const)
	test(`date grammar: ${query}`, () => {
		assert.equal(resolveDate(query, now, "UTC")?.label, `${date} (UTC)`);
	});
test("DST date ranges are local calendar days, not fixed 24 hours", () => {
	const spring = resolveDate("2026-03-08", now, "America/New_York");
	const autumn = resolveDate("2026-11-01", now, "America/New_York");
	assert.ok(spring && autumn);
	assert.equal(spring.to - spring.from, 23 * 3600000);
	assert.equal(autumn.to - autumn.from, 25 * 3600000);
});
test("timezone midnight and most recent year are local", () => {
	const range = resolveDate(
		"today",
		new Date("2026-11-16T20:00:00Z"),
		"Asia/Kolkata",
	);
	assert.ok(range);
	assert.equal(new Date(range.from).toISOString(), "2026-11-16T18:30:00.000Z");
});
test("invalid dates fail instead of normalizing into another month", () => {
	assert.throws(() => resolveDate("31 February", now, "UTC"), /invalid/);
	assert.equal(resolveDate("previous discussion", now, "UTC"), undefined);
});
test("rank fusion rewards agreement without mixing raw distance and lexical scores", () => {
	assert.deepEqual(
		reciprocalRankFusion(
			[
				[{ id: "a" }, { id: "b" }],
				[{ id: "b" }, { id: "c" }],
			],
			2,
		).map((x) => x.id),
		["b", "a"],
	);
});
test("local embedding calls coalesce and apply query instructions; no Google fallback", async () => {
	let calls = 0;
	const fetcher = (async (url, init) => {
		calls++;
		assert.match(String(url), /11434\/api\/embed$/);
		const body = JSON.parse(String(init?.body));
		assert.equal(body.model, "qwen3-embedding:0.6b");
		assert.match(body.input, /^Instruct:/);
		return Response.json({
			embeddings: [Array(EMBEDDING_DIMENSIONS).fill(0.1)],
		});
	}) as typeof fetch;
	const vectors = await Promise.all([
		embedText("fixture-coalesced", true, fetcher),
		embedText("fixture-coalesced", true, fetcher),
	]);
	assert.equal(calls, 1);
	assert.equal(vectors[0].length, 1024);
});
test("invalid dimensions and Ollama failures are not cached", async () => {
	let calls = 0;
	const fetcher = (async () => {
		calls++;
		return Response.json({ embeddings: [[1, 2]] });
	}) as typeof fetch;
	await assert.rejects(embedText("fixture-invalid", false, fetcher), /Invalid/);
	await assert.rejects(embedText("fixture-invalid", false, fetcher), /Invalid/);
	assert.equal(calls, 2);
});
test("Gemini gate serializes calls and refuses requests during Retry-After cooldown", async () => {
	let calls = 0;
	const gate = createProviderGate(
		(async () => {
			calls++;
			return new Response("busy", {
				status: 503,
				headers: { "retry-after": "60" },
			});
		}) as typeof fetch,
		0,
	);
	const first = await gate("https://fixture.invalid");
	assert.equal(first.status, 503);
	await assert.rejects(gate("https://fixture.invalid"), /busy/);
	assert.equal(calls, 1);
});
test("Gemini gate never retries permanent API errors", async () => {
	let calls = 0;
	const gate = createProviderGate(
		(async () => {
			calls++;
			return new Response("invalid", { status: 400 });
		}) as typeof fetch,
		0,
	);
	assert.equal((await gate("https://fixture.invalid")).status, 400);
	assert.equal(calls, 1);
});

test("comparison policy requires baseline, actual quotes and two observations", async () => {
	const { validateComparisons } = await import("../src/lib/agent/comparison");
	const memories = new Map<string, Record<string, unknown>>([
		[
			"crm",
			{
				answer: "Plan A costs $20 per seat monthly.",
				evidence: {
					evidence: [
						{ url: "https://vendor.example/old", retrievedAt: "2026-11-16" },
					],
				},
			},
		],
		[
			"unsupported",
			{ answer: "Plan A costs $20 per seat monthly.", evidence: {} },
		],
	]);
	const urls = new Set(["https://vendor.example/pricing"]);
	const claim = {
		baselineEpisodeId: "crm",
		historicalClaim: "Plan A costs $20 per seat monthly.",
		currentEvidenceUrls: [...urls],
		verdict: "changed",
	};
	assert.doesNotThrow(() => validateComparisons([claim], memories, urls));
	assert.throws(
		() =>
			validateComparisons(
				[{ ...claim, baselineEpisodeId: null }],
				memories,
				urls,
			),
		/baseline/,
	);
	assert.throws(
		() =>
			validateComparisons(
				[{ ...claim, baselineEpisodeId: "invented" }],
				memories,
				urls,
			),
		/reference/,
	);
	assert.throws(
		() =>
			validateComparisons(
				[{ ...claim, historicalClaim: "Invented price" }],
				memories,
				urls,
			),
		/baseline/,
	);
	assert.throws(
		() =>
			validateComparisons(
				[{ ...claim, currentEvidenceUrls: [] }],
				memories,
				urls,
			),
		/evidence/,
	);
	assert.throws(
		() =>
			validateComparisons(
				[{ ...claim, currentEvidenceUrls: ["https://invented.example"] }],
				memories,
				urls,
			),
		/reference/,
	);
	assert.throws(
		() =>
			validateComparisons(
				[{ ...claim, baselineEpisodeId: "unsupported" }],
				memories,
				urls,
			),
		/historical support/,
	);
	assert.doesNotThrow(() =>
		validateComparisons(
			[
				{
					...claim,
					baselineEpisodeId: null,
					historicalClaim: null,
					currentEvidenceUrls: [],
					verdict: "unable to verify",
				},
			],
			memories,
			urls,
		),
	);
});

test("ambiguous historical dates ask for clarification", () => {
	assert.throws(
		() => resolveDate("Compare Monday and Tuesday", now, "UTC"),
		/Which historical date/,
	);
	assert.equal(
		resolveDate("Last Tuesday, is that still correct today?", now, "UTC")
			?.label,
		"2026-11-10 (UTC)",
	);
});
test("provider gate holds a queued request until the first finishes", async () => {
	let calls = 0;
	let resolveFirst: (() => void) | undefined;
	const gate = createProviderGate(
		(async () => {
			calls++;
			if (calls === 1)
				await new Promise<void>((resolve) => {
					resolveFirst = resolve;
				});
			return Response.json({ ok: true });
		}) as typeof fetch,
		0,
	);
	const one = gate("https://fixture.invalid");
	const two = gate("https://fixture.invalid");
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.equal(calls, 1);
	assert.ok(resolveFirst);
	resolveFirst();
	await Promise.all([one, two]);
	assert.equal(calls, 2);
});
test("web search parallelism is bounded to three", async () => {
	const { createSearchTool } = await import("../src/lib/agent/core");
	let active = 0,
		peak = 0;
	const search = createSearchTool({
		search: async () => {
			active++;
			peak = Math.max(peak, active);
			await new Promise<void>((resolve) => setImmediate(resolve));
			active--;
			return [];
		},
	});
	assert.ok(search.execute);
	const execute = search.execute;
	await Promise.all(
		Array.from({ length: 8 }, (_, i) =>
			execute(
				{ query: `fixture search ${i}` },
				{ toolCallId: String(i), messages: [], context: {} },
			),
		),
	);
	assert.equal(peak, 3);
});

test("historical context keeps source IDs and bounds excerpts", async () => {
	const { episodeExcerpt } = await import("../src/lib/memory/context");
	const record = episodeExcerpt({
		id: "source-id",
		question: "q".repeat(32000),
		answer: "a".repeat(32000),
		evidence: {
			evidence: Array.from({ length: 40 }, () => ({
				url: "https://fixture.invalid",
				content: "x".repeat(6000),
				description: "d".repeat(2000),
			})),
		},
	});
	assert.equal(record.id, "source-id");
	assert.equal(record.excerpt, true);
	assert.ok(JSON.stringify(record).length < 24000);
	assert.equal(record.evidence.evidence.length, 5);
});
