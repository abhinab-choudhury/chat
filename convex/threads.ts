import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ---------- Threads ----------

export const listThreads = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const threads = await ctx.db
			.query("threads")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.collect();
		return threads.sort((a, b) => b.updatedAt - a.updatedAt);
	},
});

export const getThread = query({
	args: { threadId: v.id("threads"), userId: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread) return null;
		// Public threads are viewable by anyone.
		if (thread.isPublic) return thread;
		// Private threads only to their owner.
		if (args.userId && thread.userId === args.userId) return thread;
		return null;
	},
});

export const createThread = mutation({
	args: {
		userId: v.string(),
		title: v.optional(v.string()),
		clientUuid: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (args.clientUuid) {
			const existing = await ctx.db
				.query("threads")
				.withIndex("by_client_uuid", (q) => q.eq("clientUuid", args.clientUuid))
				.unique();
			if (existing) return existing._id;
		}
		const now = Date.now();
		return await ctx.db.insert("threads", {
			title: args.title ?? "New chat",
			userId: args.userId,
			clientUuid: args.clientUuid,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const renameThread = mutation({
	args: { threadId: v.id("threads"), title: v.string() },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.threadId, { title: args.title, updatedAt: Date.now() });
	},
});

export const archiveThread = mutation({
	args: { threadId: v.id("threads") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.threadId, { archived: true, updatedAt: Date.now() });
	},
});

// Toggle whether a thread is publicly viewable via its link.
export const setThreadPublic = mutation({
	args: {
		threadId: v.id("threads"),
		isPublic: v.boolean(),
		userId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread) throw new Error("Thread not found");
		if (!args.userId || thread.userId !== args.userId) {
			throw new Error("Not allowed");
		}
		await ctx.db.patch(args.threadId, {
			isPublic: args.isPublic,
			updatedAt: Date.now(),
		});
	},
});

// Track streaming state for reconnect/resume.
export const setThreadStreaming = mutation({
	args: {
		threadId: v.id("threads"),
		isLive: v.boolean(),
		streamId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.threadId, {
			isLive: args.isLive,
			currentStreamId: args.isLive ? args.streamId : undefined,
			streamStartedAt: args.isLive ? Date.now() : undefined,
			updatedAt: Date.now(),
		});
	},
});