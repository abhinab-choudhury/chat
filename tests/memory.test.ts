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

test("historical timestamps anchor relative dates independently of the current year", async () => {
	const { episodeExcerpt } = await import("../src/lib/memory/context");
	// Stored SQL bigint values may arrive as strings; local date differs from UTC.
	const source = episodeExcerpt(
		{
			question_at: String(Date.parse("2025-11-17T20:00:00Z")),
			question: "I went hiking yesterday. I am 25.",
		},
		"Asia/Kolkata",
	);
	assert.deepEqual(source.temporalContext, {
		recordedAt: "2025-11-17T20:00:00.000Z",
		localDate: "2025-11-18",
		timezone: "Asia/Kolkata",
	});
	assert.equal(
		resolveDate(
			"yesterday",
			new Date(source.temporalContext?.recordedAt ?? ""),
			"Asia/Kolkata",
		)?.label,
		"2025-11-17 (Asia/Kolkata)",
	);
	assert.equal(
		resolveDate("yesterday", new Date("2026-11-18T12:00:00Z"), "Asia/Kolkata")
			?.label,
		"2026-11-17 (Asia/Kolkata)",
	);
	assert.equal(source.question, "I went hiking yesterday. I am 25.");
});

test("missing or invalid memory timestamps are explicit rather than fabricated", async () => {
	const { episodeExcerpt } = await import("../src/lib/memory/context");
	for (const questionAt of [undefined, null, "", "not-a-date", Infinity]) {
		assert.equal(episodeExcerpt({ questionAt }).temporalContext, null);
	}
	assert.equal(
		episodeExcerpt({ questionAt: 0 }).temporalContext?.recordedAt,
		"1970-01-01T00:00:00.000Z",
	);
});

test("last Friday is resolved against the request date and timezone", () => {
	assert.equal(
		resolveDate("last Friday", now, "UTC")?.label,
		"2026-11-13 (UTC)",
	);
	assert.equal(
		resolveDate("last Friday", new Date("2027-11-17T12:00:00Z"), "UTC")?.label,
		"2027-11-12 (UTC)",
	);
});

test("long embeddings include the entire message in bounded requests and pool every chunk", async () => {
	const inputs: string[] = [];
	const text = `${"a".repeat(1000)}${"b".repeat(1000)}tail-🙂`;
	const vector = await embedText(text, false, (async (_url, init) => {
		const body = JSON.parse(String(init?.body));
		inputs.push(body.input);
		assert.equal(body.truncate, false);
		const embedding = Array(1024).fill(0);
		embedding[inputs.length - 1] = 1;
		return Response.json({ embeddings: [embedding] });
	}) as typeof fetch);
	assert.equal(inputs.join(""), text);
	assert.equal(inputs.length, 3);
	assert.ok(inputs.every((input) => Array.from(input).length <= 1000));
	assert.ok(vector[0] > 0 && vector[1] > 0 && vector[2] > 0);
	assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-10);
});

test("failed long embeddings retry the failed chunk and reuse completed chunks", async () => {
	const inputs: string[] = [];
	let fail = true;
	const text = `${"retry-first-".repeat(100)}retry-last`;
	const fetcher = (async (_url, init) => {
		const { input } = JSON.parse(String(init?.body));
		inputs.push(input);
		if (input.endsWith("retry-last") && fail) {
			fail = false;
			throw new DOMException("timeout", "TimeoutError");
		}
		return Response.json({ embeddings: [Array(1024).fill(0.1)] });
	}) as typeof fetch;
	await assert.rejects(embedText(text, false, fetcher), /timeout/);
	await embedText(text, false, fetcher);
	assert.equal(inputs.length, 3);
	assert.equal(inputs[1], inputs[2]);
});
