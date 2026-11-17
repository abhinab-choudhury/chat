import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---------- Threads ----------

export const listThreads = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("threads")
			.withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
			.order("desc")
			.collect();
	},
});

// Title search used by the ⌘/Ctrl+K thread palette.
// An empty term falls back to the user's most recently updated threads.
export const searchThreads = query({
	args: {
		userId: v.string(),
		query: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(Math.trunc(args.limit ?? 20), 1), 50);
		const term = args.query.trim();

		const results = term
			? await ctx.db
					.query("threads")
					.withSearchIndex("search_title", (q) =>
						q.search("title", term).eq("userId", args.userId),
					)
					.take(limit)
			: await ctx.db
					.query("threads")
					.withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
					.order("desc")
					.take(limit);

		// Archived threads are hidden in the sidebar, so hide them here too.
		return results.filter((thread) => !thread.archived);
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
		await ctx.db.patch(args.threadId, {
			title: args.title,
			updatedAt: Date.now(),
		});
	},
});

export const archiveThread = mutation({
	args: { threadId: v.id("threads") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.threadId, {
			archived: true,
			updatedAt: Date.now(),
		});
	},
});

export const deleteThread = mutation({
	args: { threadId: v.id("threads"), userId: v.string() },
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread) throw new Error("Thread not found");
		if (thread.userId !== args.userId) throw new Error("Not allowed");
		// Remove messages belonging to this thread.
		const messages = await ctx.db
			.query("messages")
			.withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
			.collect();
		for (const m of messages) await ctx.db.delete(m._id);
		await ctx.db.delete(args.threadId);
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
