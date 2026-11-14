import { defineSchema } from "convex/server";

import { messages } from "./schema/messages";
import { products } from "./schema/products";
import { projects } from "./schema/projects";
import { threads } from "./schema/threads";

export default defineSchema({
	products,
	projects,
	threads,
	messages,
});