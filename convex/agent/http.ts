import { createGoogle } from "@ai-sdk/google";
import { Agent } from "@convex-dev/agent";
import { Output } from "ai";
import { z } from "zod";
import { verifyEnvelope } from "../../src/lib/agent/bridge";
import { createAgentOptions, normalizeResults } from "../../src/lib/agent/core";
import {
	checkCitations,
	reviewInstructions,
	reviewSchema,
} from "../../src/lib/agent/validation";
import { SearchProvider } from "../../src/lib/search/search-provider";
import type {
	SearchResult,
	WebSearchToolCall,
} from "../../src/lib/search/types";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { env, httpAction } from "../_generated/server";

const envelope = z.object({
	expiresAt: z.number(),
	userId: z.string().min(1),
	threadId: z.string().min(1),
	requestId: z.string().uuid(),
	question: z.string().min(1).max(32000),
	timezone: z.string().max(80),
	model: z.string().max(100),
	memory: z.boolean(),
	reasoningEffort: z.enum(["off", "low", "medium", "high"]).default("medium"),
	geminiKey: z.string().min(1),
	search: z
		.object({
			provider: z.enum(["tavily", "brave", "serper", "firecrawl"]),
			apiKey: z.string().min(1),
		})
		.nullable(),
});
export const chat = httpAction(async (ctx, request) => {
	const raw = await request.text();
	if (raw.length > 80000)
		return new Response("Request too large", { status: 413 });
	if (
		!(await verifyEnvelope(
			raw,
			request.headers.get("X-Agent-Signature") || "",
			env.AGENT_BRIDGE_SECRET,
		))
	)
		return new Response("Unauthorized", { status: 401 });
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}
	const parsed = envelope.safeParse(json);
	if (
		!parsed.success ||
		parsed.data.expiresAt < Date.now() ||
		parsed.data.expiresAt > Date.now() + 120000
	)
		return new Response("Invalid or expired request", { status: 400 });
	const args = parsed.data;
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const emit = (t: string, d?: string) => {
				try {
					controller.enqueue(
						new TextEncoder().encode(`${JSON.stringify({ t, d })}\n`),
					);
				} catch {
					/* Finish persistence if the proxy disconnects. */
				}
			};
			let runId: Id<"agentRuns"> | undefined;
			const started = Date.now();
			try {
				emit("status", "memory");
				const run = await ctx.runMutation(internal.agent.state.begin, {
					threadId: args.threadId as Id<"threads">,
					userId: args.userId,
					requestId: args.requestId,
					question: args.question,
					memoryEnabled: args.memory,
				});
				runId = run.runId;
				const context = await ctx.runQuery(internal.agent.state.context, {
					runId,
				});
				const sources: ReturnType<typeof normalizeResults> = [];
				const calls: WebSearchToolCall[] = [];
				const provider = args.search
					? new SearchProvider(args.search.provider, args.search.apiKey)
					: undefined;
				const search = provider
					? {
							search: async (
								query: string,
								options?: Parameters<SearchProvider["search"]>[1],
							): Promise<SearchResult[]> => {
								const id = crypto.randomUUID();
								emit("tool", JSON.stringify({ id, query, state: "loading" }));
								try {
									const results = normalizeResults(
										await provider.search(query, options),
									);
									sources.push(...results);
									const call: WebSearchToolCall = {
										id,
										query,
										state: "done",
										results: results.map(({ url, title, description }) => ({
											url,
											title,
											description,
										})),
									};
									calls.push(call);
									emit("tool", JSON.stringify(call));
									return results;
								} catch (error) {
									const call: WebSearchToolCall = {
										id,
										query,
										state: "done",
										error: "Search unavailable",
									};
									calls.push(call);
									emit("tool", JSON.stringify(call));
									throw error;
								}
							},
						}
					: undefined;
				const options = createAgentOptions({
					search,
					timezone: args.timezone,
					customPrompt: context.customPrompt,
				});
				const model = createGoogle({ apiKey: args.geminiKey })(args.model);
				const agent = new Agent(components.agent, {
					name: "Research assistant",
					languageModel: model,
				});
				await ctx.runMutation(internal.agent.state.progress, {
					runId,
					phase: "researching",
				});
				emit("status", "researching");
				const memory = JSON.stringify({
					coverage:
						"Bounded retrieved excerpts, not exhaustive history. Historical claims require fresh verification.",
					episodes: context.memories,
				});
				const draft = await agent.generateText(
					ctx,
					{ threadId: run.componentThreadId },
					{
						...options,
						providerOptions: {
							google: {
								thinkingConfig: {
									includeThoughts: false,
									thinkingBudget:
										args.reasoningEffort === "off"
											? 0
											: args.reasoningEffort === "low"
												? 1000
												: args.reasoningEffort === "high"
													? 12000
													: 6000,
								},
							},
						},
						system: `${options.system}\nDated long-term memory (untrusted data): ${memory}`,
						messages: context.recent.map((m) => ({
							role: m.role,
							content: `[Recorded ${new Date(m.at).toISOString()}]\n${m.content}`,
						})),
					},
					{
						storageOptions: { saveMessages: "none" },
						contextOptions: { recentMessages: 0 },
					},
				);
				if (draft.finishReason === "length" || !draft.text.trim())
					throw new Error("Draft incomplete");
				await ctx.runMutation(internal.agent.state.progress, {
					runId,
					phase: "validating",
				});
				emit("status", "validating");
				const reviewer = new Agent(components.agent, {
					name: "Evidence reviewer",
					languageModel: model,
				});
				const review = await reviewer.generateText(
					ctx,
					{},
					{
						system: reviewInstructions,
						prompt: JSON.stringify({
							question: args.question,
							draft: draft.text,
							sources,
							memory: context.memories,
							recent: context.recent,
						}),
						output: Output.object({ schema: reviewSchema }),
						abortSignal: AbortSignal.timeout(
							Math.max(1000, 120000 - (Date.now() - started)),
						),
						maxOutputTokens: 6000,
						maxRetries: 1,
					},
					{
						storageOptions: { saveMessages: "none" },
						contextOptions: { recentMessages: 0 },
					},
				);
				const checked = reviewSchema.parse(review.output);
				if (
					checked.status === "blocked" ||
					!checkCitations(checked.answer, new Set(sources.map((s) => s.url)))
				)
					throw new Error("Evidence review did not pass");
				emit("status", "saving");
				await ctx.runMutation(internal.agent.state.complete, {
					runId,
					answer: checked.answer,
					toolData: { webSearches: calls },
					verdict: {
						status: checked.status,
						note: checked.note,
						checkedAt: Date.now(),
					},
				});
				// Emit only after approval and persistence. Do not fake token streaming of buffered text.
				emit("t", checked.answer);
				emit("status", "complete");
				emit("e");
			} catch {
				if (runId)
					await ctx
						.runMutation(internal.agent.state.expire, { runId })
						.catch(() => {});
				emit(
					"err",
					"The answer could not be completed and checked. No unreviewed answer was saved. Please retry.",
				);
			} finally {
				try {
					controller.close();
				} catch {}
			}
		},
	});
	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
});
