import { defineTable } from "convex/server";
import { v } from "convex/values";

export const projects = defineTable({
	name: v.string(),
	userId: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	description: v.optional(v.string()),
	color: v.optional(v.string()),
	icon: v.optional(v.string()),
	customPrompt: v.optional(v.string()),
	defaultModel: v.optional(v.string()),
	archived: v.optional(v.boolean()),
})
	.index("by_user", ["userId"])
	.index("by_user_updated", ["userId", "updatedAt"])
	.searchIndex("search_name", {
		searchField: "name",
		filterFields: ["userId"],
	});