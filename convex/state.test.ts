import { Agent } from "@convex-dev/agent";
import agent from "@convex-dev/agent/test";
import workflow from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { signEnvelope } from "../src/lib/agent/bridge";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
function setup() {
	const t = convexTest(schema, modules);
	agent.register(t);
	workflow.register(t);
	return t;
}
async function seed(t: ReturnType<typeof setup>, userId = "alice") {
	return t.run(async (ctx) => {
		const threadId = await ctx.db.insert("threads", {
			title: "Plans",
			userId,
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("messages", {
			threadId,
			role: "user",
			content: "Compare Postgres",
			createdAt: 2,
		});
		return threadId;
	});
}
describe("agent memory and commit boundaries", () => {
	it("rejects a different owner and duplicate/concurrent requests", async () => {
		const t = setup();
		const threadId = await seed(t);
		const args = {
			threadId,
			userId: "alice",
			requestId: "one",
			question: "Compare Postgres",
			memoryEnabled: true,
		};
		await expect(
			t.mutation(internal.agent.state.begin, { ...args, userId: "bob" }),
		).rejects.toThrow("access denied");
		await t.mutation(internal.agent.state.begin, args);
		await expect(t.mutation(internal.agent.state.begin, args)).rejects.toThrow(
			"already processed",
		);
		await expect(
			t.mutation(internal.agent.state.begin, { ...args, requestId: "two" }),
		).rejects.toThrow("already running");
	});
	it("syncs approved source records idempotently and excludes edited/deleted sources", async () => {
		const t = setup();
		const threadId = await seed(t);
		const run = await t.mutation(internal.agent.state.begin, {
			threadId,
			userId: "alice",
			requestId: "one",
			question: "Compare Postgres",
			memoryEnabled: true,
		});
		// Seed a completed commit to isolate the projection from workflow scheduling.
		const answerId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("messages", {
				threadId,
				role: "assistant",
				content: "A qualified answer",
				createdAt: 3,
			});
			await ctx.db.patch(run.runId, { phase: "complete", answerId: id });
			return id;
		});
		const verdict = {
			status: "qualified" as const,
			note: "No pricing date established",
			checkedAt: 3,
		};
		await t.mutation(internal.agent.memory.project, {
			runId: run.runId,
			verdict,
		});
		await t.mutation(internal.agent.memory.project, {
			runId: run.runId,
			verdict,
		});
		expect(
			(await t.query(internal.agent.state.context, { runId: run.runId }))
				.memories,
		).toHaveLength(1);
		await t.run((ctx) => ctx.db.patch(answerId, { content: "Edited answer" }));
		expect(
			(await t.query(internal.agent.state.context, { runId: run.runId }))
				.memories,
		).toHaveLength(0);
	});
	it("keeps long-term memory scoped to the owner and respects memory off", async () => {
		const t = setup();
		const alice = await seed(t);
		const bob = await seed(t, "bob");
		const a = await t.mutation(internal.agent.state.begin, {
			threadId: alice,
			userId: "alice",
			requestId: "a",
			question: "Compare Postgres",
			memoryEnabled: true,
		});
		await t.run(async (ctx) => {
			const sourceId = await ctx.db.insert("messages", {
				threadId: alice,
				role: "assistant",
				content: "Private",
				createdAt: 3,
			});
			await ctx.db.patch(a.runId, { phase: "complete", answerId: sourceId });
		});
		await t.mutation(internal.agent.memory.project, {
			runId: a.runId,
			verdict: { status: "qualified", note: "", checkedAt: 3 },
		});
		const b = await t.mutation(internal.agent.state.begin, {
			threadId: bob,
			userId: "bob",
			requestId: "b",
			question: "Compare Postgres",
			memoryEnabled: true,
		});
		expect(
			(await t.query(internal.agent.state.context, { runId: b.runId }))
				.memories,
		).toHaveLength(0);
		await t.run((ctx) => ctx.db.patch(a.runId, { memoryEnabled: false }));
		expect(
			(await t.query(internal.agent.state.context, { runId: a.runId }))
				.memories,
		).toHaveLength(0);
	});
	it("never archives failed runs", async () => {
		const t = setup();
		const threadId = await seed(t);
		const run = await t.mutation(internal.agent.state.begin, {
			threadId,
			userId: "alice",
			requestId: "a",
			question: "Compare Postgres",
			memoryEnabled: true,
		});
		await t.mutation(internal.agent.state.expire, { runId: run.runId });
		await t.mutation(internal.agent.memory.project, {
			runId: run.runId,
			verdict: { status: "qualified", note: "", checkedAt: 3 },
		});
		expect(
			(await t.query(internal.agent.state.context, { runId: run.runId }))
				.memories,
		).toHaveLength(0);
		await expect(
			t.mutation(internal.agent.state.complete, {
				runId: run.runId,
				answer: "Draft",
				toolData: {},
				verdict: { status: "qualified", note: "", checkedAt: 3 },
			}),
		).rejects.toThrow("expired");
	});
});

it("approved commit is idempotent and durable workflow projects it", async () => {
	vi.useFakeTimers();
	try {
		const t = setup();
		const threadId = await seed(t);
		const run = await t.mutation(internal.agent.state.begin, {
			threadId,
			userId: "alice",
			requestId: "approved",
			question: "Compare Postgres",
			memoryEnabled: true,
		});
		const args = {
			runId: run.runId,
			answer: "Qualified result",
			toolData: { webSearches: [] },
			verdict: {
				status: "qualified" as const,
				note: "Limited evidence",
				checkedAt: Date.now(),
			},
		};
		const first = await t.mutation(internal.agent.state.complete, args);
		expect(await t.mutation(internal.agent.state.complete, args)).toEqual(
			first,
		);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		const result = await t.query(internal.agent.state.context, {
			runId: run.runId,
		});
		expect(result.memories).toHaveLength(1);
		expect(result.recent.filter((m) => m.role === "assistant")).toHaveLength(1);
	} finally {
		vi.useRealTimers();
	}
});

it("HTTP review gate never emits or saves a blocked draft", async () => {
	vi.stubEnv("AGENT_BRIDGE_SECRET", "test-secret");
	const generate = vi.spyOn(Agent.prototype, "generateText");
	generate.mockResolvedValueOnce({
		text: "UNVERIFIED DRAFT",
		finishReason: "stop",
	} as never);
	generate.mockResolvedValueOnce({
		output: {
			status: "blocked",
			answer: "Insufficient evidence",
			note: "Cannot substantiate",
		},
	} as never);
	try {
		const t = setup();
		const threadId = await seed(t);
		const body = JSON.stringify({
			expiresAt: Date.now() + 60000,
			userId: "alice",
			threadId,
			requestId: crypto.randomUUID(),
			question: "Compare Postgres",
			timezone: "UTC",
			model: "test",
			memory: true,
			geminiKey: "test",
			search: null,
		});
		const response = await t.fetch("/agent/chat", {
			method: "POST",
			body,
			headers: { "X-Agent-Signature": await signEnvelope(body, "test-secret") },
		});
		const events = (await response.text())
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(events.some((e) => e.t === "status" && e.d === "validating")).toBe(
			true,
		);
		expect(events.some((e) => e.t === "t")).toBe(false);
		expect(events[events.length - 1].t).toBe("err");
		const messages = await t.run((ctx) =>
			ctx.db
				.query("messages")
				.withIndex("by_thread", (q) => q.eq("threadId", threadId))
				.take(10),
		);
		expect(messages.filter((m) => m.role === "assistant")).toHaveLength(0);
	} finally {
		generate.mockRestore();
		vi.unstubAllEnvs();
	}
});
