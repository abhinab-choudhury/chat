import { v } from "convex/values";
export const phase = v.union(
	...[
		"memory",
		"researching",
		"validating",
		"saving",
		"complete",
		"failed",
	].map((x) => v.literal(x)),
);
export const evidence = v.object({
	url: v.string(),
	title: v.string(),
	description: v.string(),
	content: v.string(),
});
export const verdict = v.object({
	status: v.union(v.literal("supported"), v.literal("qualified")),
	note: v.string(),
	checkedAt: v.number(),
});
