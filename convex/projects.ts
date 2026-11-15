import { query } from "./_generated/server";
import { v } from "convex/values";

export const getProject = query({
	args: { projectId: v.id("projects"), userId: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) return null;
		if (args.userId && project.userId !== args.userId) return null;
		return project;
	},
});