import { createGoogle } from "@ai-sdk/google";
import { withSupermemory } from "@supermemory/tools/ai-sdk";
import { createFileRoute } from "@tanstack/react-router";
import { isStepCount, streamText, tool } from "ai";
import { z } from "zod";

import { auth } from "#/lib/auth";
import { convexApi, getConvexServerClient } from "#/lib/convex-server";
import { ChatError, toChatError } from "#/lib/errors";
import { getResumableStreamContext } from "#/lib/resumable-stream";
import { SearchProvider } from "#/lib/search/search-provider";
import {
	summarizeResults,
	type WebSearchToolCall,
	type WebSearchToolData,
} from "#/lib/search/types";

type ChatBody = {
	messages?: Array<{ role: string; content: string }>;
	model?: string;
	streamId?: string;
	threadId?: string;
	userId?: string;
	assistantClientUuid?: string;
	webSearch?: boolean;
};

const WEB_SEARCH_SYSTEM_PROMPT = `You have access to a web_search tool that searches the web for up-to-date information.

Use it whenever the user asks about current events, recent developments, or anything your knowledge may be outdated on. Formulate a concise search query, review the returned results, and ground your answer in them. Cite the sources you used with inline markdown links like [title](url). Do not mention the tool itself in your answer.`;

/** Builds the web_search AI tool. Ported from intern3-chat's WebSearchAdapter. */
function createWebSearchTool() {
	return tool({
		description:
			"Search the web for information. Returns a list of results with title, url and description.",
		parameters: z.object({
			query: z.string().describe("The search query"),
		}),
		execute: async ({ query }) => {
			try {
				const searchProvider = new SearchProvider();
				const results = await searchProvider.search(query, {
					limit: 5,
					scrapeContent: true,
					formats: ["markdown", "links"],
				});
				return {
					success: true,
					query,
					results,
					count: results.length,
				};
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error ? error.message : "Unknown error occurred",
					query,
					results: [],
				};
			}
		},
	});
}

export const Route = createFileRoute("/api/chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				let threadMarkedLive = false;
				let finalized = false;
				let streamId: string | undefined;
				let threadId: string | undefined;
				let effectiveUserId: string | undefined;
				let assistantClientUuid: string | undefined;
				let accumulated = "";
				let reasoningAccumulated = "";
				const webSearchToolCalls: WebSearchToolCall[] = [];
				let webSearchToolData: WebSearchToolData | undefined;

				const finalize = async () => {
					if (finalized) return;
					finalized = true;
					const convex = getConvexServerClient();
					if (!convex || !threadId || !effectiveUserId) return;
					try {
						if (
							assistantClientUuid &&
							(accumulated.trim() ||
								reasoningAccumulated.trim() ||
								(webSearchToolCalls.length ?? 0) > 0)
						) {
							await convex.mutation(convexApi.messages.sendMessage, {
								clientUuid: assistantClientUuid,
								threadId: threadId as any,
								role: "assistant",
								content: accumulated,
								reasoning: reasoningAccumulated.trim() || undefined,
								toolData: webSearchToolData,
								userId: effectiveUserId,
							});
						}
						await convex.mutation(convexApi.threads.setThreadStreaming, {
							threadId: threadId as any,
							isLive: false,
						});
					} catch (error) {
						console.error("[chat] failed to finalize stream", error);
					}
				};

				try {
					const earlySession = await auth.api
						.getSession({ headers: request.headers })
						.catch(() => null);
					if (!earlySession?.user?.id) {
						return new Response(JSON.stringify({ message: "Unauthorized" }), {
							status: 401,
							headers: { "Content-Type": "application/json" },
						});
					}
					const apiKey = process.env.GEMINI_API_KEY;
					if (!apiKey) {
						throw new ChatError("internal:api", {
							cause: "GEMINI_API_KEY is not set on the server.",
						});
					}

					let body: ChatBody;
					try {
						body = (await request.json()) as ChatBody;
					} catch (error) {
						throw new ChatError("bad_request:chat", {
							cause: error,
							exposeCause: true,
						});
					}

					if (!Array.isArray(body.messages) || body.messages.length === 0) {
						throw new ChatError("bad_request:chat", {
							cause: "messages array is required",
							exposeCause: true,
						});
					}

					streamId = body.streamId?.trim() || undefined;
					threadId = body.threadId?.trim() || undefined;
					assistantClientUuid =
						body.assistantClientUuid?.trim() ||
						(streamId ? `${streamId}:assistant` : undefined);

					// Require authentication for all chat requests.
					const session = await auth.api
						.getSession({ headers: request.headers })
						.catch(() => null);
					const sessionUserId = session?.user?.id as string | undefined;
					if (!sessionUserId) {
						return new Response(JSON.stringify({ message: "Unauthorized" }), {
							status: 401,
							headers: { "Content-Type": "application/json" },
						});
					}
					const convex = getConvexServerClient();
					if (threadId) {
						if (!convex) {
							throw new ChatError("internal:chat", {
								cause: "Convex server client is not configured.",
							});
						}
						// Fetch with owner context only; streaming/persistence is owner-only.
						const ownerHint = sessionUserId;
						const thread = await convex.query(convexApi.threads.getThread, {
							threadId: threadId as any,
							userId: ownerHint,
						});
						const ownerId = (thread as { userId?: string } | null)?.userId;
						if (!thread || !ownerId || ownerId !== ownerHint) {
							throw new ChatError("forbidden:chat", {
								cause: "Thread not found or access denied.",
								exposeCause: true,
							});
						}
						effectiveUserId = ownerId;

						if (streamId) {
							await convex.mutation(convexApi.threads.setThreadStreaming, {
								threadId: threadId as any,
								isLive: true,
								streamId,
							});
							threadMarkedLive = true;
						}
					} else {
						effectiveUserId = sessionUserId;
					}

					const model = body.model || "gemini-3.5-flash-lite";
					const messages = body.messages.map((m) => ({
						role: m.role as "user" | "assistant" | "system",
						content: String(m.content ?? ""),
					}));

					const google = createGoogle({ apiKey });
					const wantsThinking =
						/hydrogen|thinking|reason/i.test(model) ||
						model.includes("gemini-2.5") ||
						model.includes("gemini-3");

					// Supermemory proxy: intercepts every model call to inject
					// relevant memories from past threads (namespace = one per end
					// user) and saves the exchange after the stream completes.
					// `id` groups each thread's turns into a single document.
					// Falls back to the unwrapped model when no key is configured.
					const wrappedModel = process.env.SUPERMEMORY_API_KEY
						? withSupermemory(google(model), {
								namespace: `user_${effectiveUserId}`,
								id: threadId || streamId || "ephemeral",
								mode: "full",
							})
						: google(model);

					// Web search tool (opt-in from the client's globe toggle).
					const tools = body.webSearch
						? { web_search: createWebSearchTool() }
						: undefined;

					const result = streamText({
						model: wrappedModel,
						messages,
						...(tools
							? {
									tools,
									// Allow the model to continue after tool results.
									stopWhen: isStepCount(10),
									system: WEB_SEARCH_SYSTEM_PROMPT,
								}
							: {}),
						...(wantsThinking
							? {
									providerOptions: {
										google: {
											thinkingConfig: {
												includeThoughts: true,
											},
										},
									},
								}
							: {}),
					});

					const makeEventStream = () =>
						new ReadableStream<string>({
							async start(controller) {
								const enqueue = (event: Record<string, unknown>) => {
									try {
										controller.enqueue(`${JSON.stringify(event)}\n`);
									} catch {
										// Client may have disconnected; keep consuming the model stream.
									}
								};
								try {
									for await (const part of result.fullStream) {
										if (part.type === "reasoning-delta" && "text" in part) {
											const delta = (part as { text?: string }).text ?? "";
											if (delta) {
												reasoningAccumulated += delta;
												enqueue({ t: "r", d: delta });
											}
										} else if (part.type === "text-delta" && "text" in part) {
											const delta = (part as { text?: string }).text ?? "";
											if (delta) {
												accumulated += delta;
												enqueue({ t: "t", d: delta });
											}
										} else if (part.type === "tool-call") {
											const { toolCallId, input } = part as unknown as {
												toolCallId?: string;
												input?: { query?: string };
											};
											const call: WebSearchToolCall = {
												id: toolCallId,
												query: input?.query ?? "",
												state: "loading",
											};
											webSearchToolCalls.push(call);
											enqueue({ t: "tool", d: JSON.stringify(call) });
										} else if (part.type === "tool-result") {
											const { toolCallId, input, output } = part as unknown as {
												toolCallId?: string;
												input?: { query?: string };
												output?: {
													success?: boolean;
													results?: Array<{
														url: string;
														title: string;
														description: string;
													}>;
													error?: string;
												};
											};
											const call: WebSearchToolCall = {
												id: toolCallId,
												query: input?.query ?? "",
												state: "done",
												results: output?.success
													? summarizeResults(output.results ?? [])
													: undefined,
												error: output?.success ? undefined : output?.error,
											};
											// Merge into the matching pending call (by id, else query).
											let pendingIndex = -1;
											for (let i = webSearchToolCalls.length - 1; i >= 0; i--) {
												const pending = webSearchToolCalls[i];
												if (
													pending.state === "loading" &&
													pending.query === call.query &&
													(!call.id || pending.id === call.id)
												) {
													pendingIndex = i;
													break;
												}
											}
											if (pendingIndex !== -1) {
												webSearchToolCalls[pendingIndex] = call;
											} else {
												webSearchToolCalls.push(call);
											}
											webSearchToolData = {
												webSearches: webSearchToolCalls.filter(
													(c) => c.state === "done",
												),
											};
											enqueue({ t: "tool", d: JSON.stringify(call) });
										} else if (part.type === "error") {
											const err = (part as { error?: unknown }).error;
											throw err instanceof Error
												? err
												: new Error(String(err ?? "Stream error"));
										}
									}
									enqueue({ t: "e" });
								} catch (error) {
									enqueue({
										t: "err",
										d: error instanceof Error ? error.message : "Stream error",
									});
								} finally {
									try {
										await finalize();
									} finally {
										try {
											controller.close();
										} catch {
											// ignore close after disconnect
										}
									}
								}
							},
						});

					const headers = {
						"Content-Type": "application/x-ndjson; charset=utf-8",
						"Cache-Control": "no-cache, no-transform",
						"X-Accel-Buffering": "no",
					};

					// Always run the producer to completion so server-side persistence/finalization
					// happens even if the client disconnects (tab close/navigation).
					const producer = makeEventStream();
					const [clientStream, backgroundStream] = producer.tee();
					void (async () => {
						try {
							const reader = backgroundStream.getReader();
							while (true) {
								const { done } = await reader.read();
								if (done) break;
							}
						} catch (error) {
							console.error("[chat] background stream drain failed", error);
						}
					})();

					const ctx = getResumableStreamContext();
					if (ctx && streamId) {
						try {
							// createNewResumableStream (not resumableStream): the INCR-based
							// resumableStream can demote this POST to a passive listener if a
							// resume GET already created the sentinel (the client marks the
							// thread live before the stream is registered), leaving nobody
							// recording and every later resume hanging. This call always
							// makes this handler the recorder.
							const resumable = await ctx.createNewResumableStream(
								streamId,
								() => clientStream,
							);
							if (resumable) {
								// resumable-stream yields string chunks; encode to bytes for
								// the HTTP response (same as intern3-chat's POST route).
								return new Response(
									resumable.pipeThrough(new TextEncoderStream()),
									{ headers },
								);
							}
						} catch (error) {
							// A transient Redis failure must not fail the chat request;
							// fall back to a direct stream (not resumable on reload).
							console.error(
								"[chat] resumable stream setup failed; streaming directly",
								error,
							);
						}
					}

					// No resumable context: stream directly to this client, but producer is
					// independently drained above so generation/finalization continues on disconnect.
					return new Response(
						clientStream.pipeThrough(new TextEncoderStream()),
						{
							headers,
						},
					);
				} catch (error) {
					if (threadMarkedLive && !finalized) {
						const convex = getConvexServerClient();
						if (convex && threadId) {
							try {
								await convex.mutation(convexApi.threads.setThreadStreaming, {
									threadId: threadId as any,
									isLive: false,
								});
							} catch {
								// ignore cleanup failure
							}
						}
					}
					return toChatError(error, "internal:chat").toResponse();
				}
			},
		},
	},
});
