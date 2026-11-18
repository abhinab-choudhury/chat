import { z } from "zod";
import { type AgentPhase, isAgentPhase } from "./progress";

const sourceSchema = z.object({
	url: z
		.url()
		.refine((value) => /^https?:\/\//.test(value), "Unsafe source URL"),
	title: z.string(),
	description: z.string(),
});
export const toolCallSchema = z.object({
	id: z.string().optional(),
	query: z.string(),
	state: z.enum(["loading", "done"]),
	results: z.array(sourceSchema).optional(),
	error: z.string().optional(),
});

const streamEventSchema = z.discriminatedUnion("t", [
	z.object({ t: z.literal("status"), d: z.custom<AgentPhase>(isAgentPhase) }),
	z.object({ t: z.literal("t"), d: z.string() }),
	z.object({ t: z.literal("replace"), d: z.string() }),
	z.object({ t: z.literal("r"), d: z.string() }),
	z.object({ t: z.literal("tool"), d: z.string() }),
	z.object({ t: z.literal("err"), d: z.string() }),
	z.object({ t: z.literal("e") }),
]);

export function parseChatEvent(line: string) {
	try {
		return streamEventSchema.parse(JSON.parse(line));
	} catch {
		throw new Error("Invalid chat stream event");
	}
}

export function parseToolCall(value: string) {
	try {
		return toolCallSchema.parse(JSON.parse(value));
	} catch {
		throw new Error("Invalid chat search event");
	}
}
