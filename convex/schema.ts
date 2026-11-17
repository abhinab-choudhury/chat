import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { phase, verdict } from "./agent/validators";

import { messages } from "./schema/messages";
import { products } from "./schema/products";
import { projects } from "./schema/projects";
import { threads } from "./schema/threads";

export default defineSchema({
	agentRuns: defineTable({
		threadId: v.id("threads"),
		userId: v.string(),
		requestId: v.string(),
		componentThreadId: v.string(),
		phase,
		createdAt: v.number(),
		updatedAt: v.number(),
		question: v.string(),
		answerId: v.optional(v.id("messages")),
		questionId: v.optional(v.id("messages")),
		memoryEnabled: v.boolean(),
	})
		.index("by_requestId", ["requestId"])
		.index("by_threadId", ["threadId"]),
	memories: defineTable({
		userId: v.string(),
		threadId: v.id("threads"),
		sourceId: v.id("messages"),
		questionSourceId: v.optional(v.id("messages")),
		question: v.string(),
		answer: v.string(),
		searchText: v.string(),
		observedAt: v.number(),
		syncedAt: v.number(),
		verdict,
	})
		.index("by_sourceId", ["sourceId"])
		.index("by_userId_and_observedAt", ["userId", "observedAt"])
		.searchIndex("search_text", {
			searchField: "searchText",
			filterFields: ["userId"],
		}),
	products,
	projects,
	threads,
	messages,
});
