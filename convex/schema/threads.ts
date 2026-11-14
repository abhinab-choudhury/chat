import { defineTable } from "convex/server";
import { v } from "convex/values";

export const threads = defineTable({
	title: v.string(),
	userId: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	archived: v.optional(v.boolean()),
	isPublic: v.optional(v.boolean()),
	clientUuid: v.optional(v.string()),
	// Optional project grouping (see projects table).
	projectId: v.optional(v.id("projects")),
	// Streaming state for reconnect/resume.
	isLive: v.optional(v.boolean()),
	currentStreamId: v.optional(v.string()),
	streamStartedAt: v.optional(v.number()),
})
	.index("by_user", ["userId"])
	.index("by_client_uuid", ["clientUuid"])
	.searchIndex("search_title", {
		searchField: "title",
		filterFields: ["userId", "projectId"],
	});