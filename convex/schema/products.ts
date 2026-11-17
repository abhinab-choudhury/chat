import { defineTable } from "convex/server";
import { v } from "convex/values";

export const products = defineTable({
	title: v.string(),
	imageId: v.string(),
	price: v.number(),
});
