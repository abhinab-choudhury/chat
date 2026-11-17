import { createThread, saveMessages } from "@convex-dev/agent";
import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { phase, verdict } from "./validators";

const workflows = new WorkflowManager(components.workflow);
export const begin = internalMutation({
	args: {
		threadId: v.id("threads"),
		userId: v.string(),
		requestId: v.string(),
		question: v.string(),
		memoryEnabled: v.boolean(),
	},
	returns: v.object({
		runId: v.id("agentRuns"),
		componentThreadId: v.string(),
	}),
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread || thread.userId !== args.userId)
			throw new Error("Thread access denied");
		const duplicate = await ctx.db
			.query("agentRuns")
			.withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
			.unique();
		if (duplicate)
			throw new Error("Request already processed; reload the conversation.");
		const previous = await ctx.db
			.query("agentRuns")
			.withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
			.order("desc")
			.first();
		if (
			previous &&
			!["complete", "failed"].includes(previous.phase) &&
			Date.now() - previous.createdAt < 150000
		)
			throw new Error("A response is already running.");
		const latest = await ctx.db
			.query("messages")
			.withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
			.order("desc")
			.first();
		if (!latest || latest.role !== "user" || latest.content !== args.question)
			throw new Error("Conversation changed. Reload before retrying.");
		const componentThreadId =
			thread.agentThreadId ??
			(await createThread(ctx, components.agent, { userId: args.userId }));
		const runId = await ctx.db.insert("agentRuns", {
			...args,
			questionId: latest._id,
			componentThreadId,
			phase: "memory",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		await ctx.db.patch(args.threadId, {
			agentThreadId: componentThreadId,
			isLive: true,
			currentStreamId: args.requestId,
			streamStartedAt: Date.now(),
		});
		await ctx.scheduler.runAfter(150000, internal.agent.state.expire, {
			runId,
		});
		return { runId, componentThreadId };
	},
});
export const expire = internalMutation({
	args: { runId: v.id("agentRuns") },
	returns: v.null(),
	handler: async (ctx, { runId }) => {
		const run = await ctx.db.get(runId);
		if (run && !["complete", "failed"].includes(run.phase)) {
			await ctx.db.patch(runId, { phase: "failed", updatedAt: Date.now() });
			const thread = await ctx.db.get(run.threadId);
			if (thread?.currentStreamId === run.requestId)
				await ctx.db.patch(run.threadId, { isLive: false });
		}
		return null;
	},
});
export const progress = internalMutation({
	args: { runId: v.id("agentRuns"), phase },
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run || ["complete", "failed"].includes(run.phase))
			throw new Error("Run is no longer active");
		await ctx.db.patch(args.runId, {
			phase: args.phase,
			updatedAt: Date.now(),
		});
		return null;
	},
});
export const context = internalQuery({
	args: { runId: v.id("agentRuns") },
	returns: v.object({
		recent: v.array(
			v.object({
				role: v.union(v.literal("user"), v.literal("assistant")),
				content: v.string(),
				at: v.number(),
			}),
		),
		memories: v.array(
			v.object({
				question: v.string(),
				answer: v.string(),
				at: v.number(),
				threadId: v.id("threads"),
			}),
		),
		customPrompt: v.string(),
	}),
	handler: async (ctx, { runId }) => {
		const run = await ctx.db.get(runId);
		if (!run) throw new Error("Missing run");
		const rows = await ctx.db
			.query("messages")
			.withIndex("by_thread", (q) => q.eq("threadId", run.threadId))
			.order("desc")
			.take(20);
		let recentBudget = 32000;
		const recent = rows
			.flatMap((m) => {
				if (m.role === "system" || recentBudget <= 0) return [];
				const content = m.content.slice(0, Math.min(8000, recentBudget));
				recentBudget -= content.length;
				return [{ role: m.role, content, at: m.createdAt }];
			})
			.reverse();
		const memories: Array<{
			question: string;
			answer: string;
			at: number;
			threadId: typeof run.threadId;
		}> = [];
		let memoryBudget = 16000;
		if (run.memoryEnabled) {
			const matched = await ctx.db
				.query("memories")
				.withSearchIndex("search_text", (q) =>
					q
						.search("searchText", run.question.slice(0, 500))
						.eq("userId", run.userId),
				)
				.take(6);
			const newest = await ctx.db
				.query("memories")
				.withIndex("by_userId_and_observedAt", (q) =>
					q.eq("userId", run.userId),
				)
				.order("desc")
				.take(6);
			for (const m of [
				...new Map([...matched, ...newest].map((m) => [m._id, m])).values(),
			]) {
				const thread = await ctx.db.get(m.threadId);
				const source = await ctx.db.get(m.sourceId);
				const questionSource = m.questionSourceId
					? await ctx.db.get(m.questionSourceId)
					: null;
				// Deleted, archived or edited source conversations must not survive as stale recall.
				if (
					thread?.userId === run.userId &&
					!thread.archived &&
					source?.content === m.answer &&
					questionSource?.content === m.question &&
					memoryBudget > 0
				) {
					const question = m.question.slice(0, Math.min(3000, memoryBudget));
					memoryBudget -= question.length;
					const answer = m.answer.slice(0, Math.min(5000, memoryBudget));
					memoryBudget -= answer.length;
					memories.push({
						question,
						answer,
						at: m.observedAt,
						threadId: m.threadId,
					});
				}
			}
		}
		const thread = await ctx.db.get(run.threadId);
		const project = thread?.projectId
			? await ctx.db.get(thread.projectId)
			: null;
		return {
			recent,
			memories,
			customPrompt:
				project?.userId === run.userId ? (project.customPrompt ?? "") : "",
		};
	},
});
export const complete = internalMutation({
	args: {
		runId: v.id("agentRuns"),
		answer: v.string(),
		toolData: v.any(),
		verdict,
	},
	returns: v.id("messages"),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run) throw new Error("Missing run");
		if (run.answerId) return run.answerId;
		if (run.phase === "failed") throw new Error("Run expired");
		const thread = await ctx.db.get(run.threadId);
		if (
			!thread ||
			thread.userId !== run.userId ||
			thread.currentStreamId !== run.requestId
		)
			throw new Error("Conversation changed");
		const questionSource = run.questionId
			? await ctx.db.get(run.questionId)
			: null;
		if (!questionSource || questionSource.content !== run.question)
			throw new Error("Original question changed");
		// Only approved text is saved into the component's durable conversation.
		await saveMessages(ctx, components.agent, {
			threadId: run.componentThreadId,
			userId: run.userId,
			messages: [
				{ role: "user", content: run.question },
				{ role: "assistant", content: args.answer },
			],
		});
		const answerId = await ctx.db.insert("messages", {
			threadId: run.threadId,
			role: "assistant",
			content: args.answer,
			clientUuid: `${run.requestId}:assistant`,
			authorId: run.userId,
			createdAt: Date.now(),
			toolData: { ...args.toolData, validation: args.verdict },
		});
		await ctx.db.patch(args.runId, {
			phase: "complete",
			answerId,
			updatedAt: Date.now(),
		});
		await ctx.db.patch(run.threadId, { isLive: false, updatedAt: Date.now() });
		if (run.memoryEnabled)
			await workflows.start(
				ctx,
				internal.agent.memory.synchronize,
				{ runId: args.runId, verdict: args.verdict },
				{ startAsync: true },
			);
		return answerId;
	},
});
