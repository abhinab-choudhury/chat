import { defineTable } from "convex/server";
import { v } from "convex/values";

export const projects = defineTable({
	name: v.string(),
	userId: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
})
	.index("by_user", ["userId"])
	.searchIndex("search_name", {
		searchField: "name",
		filterFields: ["userId"],
	});