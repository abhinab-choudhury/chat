import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ---------- Messages ----------

export const getMessages = query({
	args: { threadId: v.id("threads"), userId: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread) return [];
		if (!thread.isPublic && (!args.userId || thread.userId !== args.userId)) {
			return [];
		}
		return await ctx.db
			.query("messages")
			.withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
			.order("asc")
			.collect();
	},
});

// Idempotent send: client generates a UUID; if we already have it, return existing id.
export const sendMessage = mutation({
	args: {
		clientUuid: v.string(),
		threadId: v.id("threads"),
		role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
		content: v.string(),
		authorId: v.optional(v.string()),
		userId: v.optional(v.string()),
		isStreaming: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread) throw new Error("Thread not found");
		// Only the owner of the thread can write messages to it.
		if (!args.userId || thread.userId !== args.userId) {
			throw new Error("Not allowed");
		}

		const existing = await ctx.db
			.query("messages")
			.withIndex("by_client_uuid", (q) => q.eq("clientUuid", args.clientUuid))
			.unique();
		if (existing) return existing._id;

		const id = await ctx.db.insert("messages", {
			threadId: args.threadId,
			role: args.role,
			content: args.content,
			authorId: args.authorId ?? args.userId,
			clientUuid: args.clientUuid,
			createdAt: Date.now(),
			isStreaming: args.isStreaming,
		});
		await ctx.db.patch(args.threadId, { updatedAt: Date.now() });
		return id;
	},
});

// Update the content of an existing message (e.g. after editing).
export const updateMessage = mutation({
	args: { messageId: v.id("messages"), content: v.string() },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.messageId, { content: args.content });
	},
});

// Append to an in-flight assistant message (streaming). Uses clientUuid to find it.
export const appendMessage = mutation({
	args: { clientUuid: v.string(), content: v.string(), isStreaming: v.boolean() },
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("messages")
			.withIndex("by_client_uuid", (q) => q.eq("clientUuid", args.clientUuid))
			.unique();
		if (!existing) throw new Error("message not found");
		await ctx.db.patch(existing._id, { content: args.content, isStreaming: args.isStreaming });
	},
});