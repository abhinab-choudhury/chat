import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
		role: v.union(
			v.literal("user"),
			v.literal("assistant"),
			v.literal("system"),
		),
		content: v.string(),
		reasoning: v.optional(v.string()),
		toolData: v.optional(v.any()),
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
			reasoning: args.reasoning,
			toolData: args.toolData,
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
	args: {
		messageId: v.id("messages"),
		content: v.string(),
		reasoning: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.messageId, {
			content: args.content,
			...(args.reasoning !== undefined ? { reasoning: args.reasoning } : {}),
		});
	},
});

// Aggregate per-user usage statistics for the settings page.
export const getUserUsage = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const threads = await ctx.db
			.query("threads")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.collect();

		let totalMessages = 0;
		let userMessages = 0;
		let assistantMessages = 0;

		const days = 7;
		const now = Date.now();
		const msPerDay = 24 * 60 * 60 * 1000;
		// Bucket start (midnight-ish) for each of the last `days` days.
		const bucketStarts: number[] = [];
		for (let i = days - 1; i >= 0; i--) {
			const d = new Date(now - i * msPerDay);
			d.setHours(0, 0, 0, 0);
			bucketStarts.push(d.getTime());
		}
		const counts = new Array(days).fill(0);

		for (const thread of threads) {
			const messages = await ctx.db
				.query("messages")
				.withIndex("by_thread", (q) => q.eq("threadId", thread._id))
				.collect();
			for (const m of messages) {
				totalMessages += 1;
				if (m.role === "user") userMessages += 1;
				else if (m.role === "assistant") assistantMessages += 1;

				const dayIndex = bucketStarts.findIndex(
					(start, idx) =>
						m.createdAt >= start &&
						(idx === days - 1 || m.createdAt < bucketStarts[idx + 1]),
				);
				if (dayIndex !== -1) counts[dayIndex] += 1;
			}
		}

		const daily = bucketStarts.map((start, idx) => {
			const d = new Date(start);
			return {
				name: d.toLocaleDateString("en-US", { weekday: "short" }),
				messages: counts[idx],
			};
		});

		return {
			totalThreads: threads.length,
			totalMessages,
			userMessages,
			assistantMessages,
			daily,
		};
	},
});

// Append to an in-flight assistant message (streaming). Uses clientUuid to find it.
export const appendMessage = mutation({
	args: {
		clientUuid: v.string(),
		content: v.string(),
		reasoning: v.optional(v.string()),
		isStreaming: v.boolean(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("messages")
			.withIndex("by_client_uuid", (q) => q.eq("clientUuid", args.clientUuid))
			.unique();
		if (!existing) throw new Error("message not found");
		await ctx.db.patch(existing._id, {
			content: args.content,
			...(args.reasoning !== undefined ? { reasoning: args.reasoning } : {}),
			isStreaming: args.isStreaming,
		});
	},
});
