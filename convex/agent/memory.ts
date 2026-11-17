import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { verdict } from "./validators";

const workflow = new WorkflowManager(components.workflow);
// Durable, asynchronous projection. Retrying never duplicates an episode.
export const synchronize = workflow.define({
	args: { runId: v.id("agentRuns"), verdict },
	returns: v.null(),
	handler: async (step, args): Promise<null> => {
		await step.runMutation(internal.agent.memory.project, args);
		return null;
	},
});
export const project = internalMutation({
	args: { runId: v.id("agentRuns"), verdict },
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run?.answerId || run.phase !== "complete" || !run.memoryEnabled)
			return null;
		const source = await ctx.db.get(run.answerId);
		const thread = await ctx.db.get(run.threadId);
		if (!source || !thread || thread.userId !== run.userId || thread.archived)
			return null;
		const existing = await ctx.db
			.query("memories")
			.withIndex("by_sourceId", (q) => q.eq("sourceId", source._id))
			.unique();
		if (existing) return null;
		await ctx.db.insert("memories", {
			userId: run.userId,
			threadId: run.threadId,
			sourceId: source._id,
			questionSourceId: run.questionId,
			question: run.question,
			answer: source.content,
			searchText: `${run.question}\n${source.content}`.slice(0, 24000),
			observedAt: source.createdAt,
			syncedAt: Date.now(),
			verdict: args.verdict,
		});
		return null;
	},
});
