import { defineTable } from "convex/server";
import { v } from "convex/values";

export const messages = defineTable({
	threadId: v.id("threads"),
	role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
	content: v.string(),
	// Optional model reasoning/thinking trace (hidden by default in UI)
	reasoning: v.optional(v.string()),
	// Optional AI tool trace, e.g. { webSearches: [{ query, state, results }] }
	toolData: v.optional(v.any()),
	authorId: v.optional(v.string()),
	clientUuid: v.optional(v.string()),
	createdAt: v.number(),
	// streaming support: assistant messages may be appended incrementally
	isStreaming: v.optional(v.boolean()),
})
	.index("by_thread", ["threadId"])
	.index("by_client_uuid", ["clientUuid"]);