import { createGoogle } from "@ai-sdk/google";
import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";

import { auth } from "#/lib/auth";
import { convexApi, getConvexServerClient } from "#/lib/convex-server";
import { ChatError, toChatError } from "#/lib/errors";
import { getResumableStreamContext } from "#/lib/resumable-stream";

type ChatBody = {
	messages?: Array<{ role: string; content: string }>;
	model?: string;
	streamId?: string;
	threadId?: string;
	userId?: string;
	assistantClientUuid?: string;
};

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

				const finalize = async () => {
					if (finalized) return;
					finalized = true;
					const convex = getConvexServerClient();
					if (!convex || !threadId || !effectiveUserId) return;
					try {
						if (
							assistantClientUuid &&
							(accumulated.trim() || reasoningAccumulated.trim())
						) {
							await convex.mutation(convexApi.messages.sendMessage, {
								clientUuid: assistantClientUuid,
								threadId: threadId as any,
								role: "assistant",
								content: accumulated,
								reasoning: reasoningAccumulated.trim() || undefined,
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

					// Best-effort auth/ownership validation for durable, resumable streams.
					const session = await auth.api
						.getSession({ headers: request.headers })
						.catch(() => null);
					const sessionUserId = session?.user?.id as string | undefined;
					const convex = getConvexServerClient();
					if (threadId) {
						if (!convex) {
							throw new ChatError("internal:chat", {
								cause: "Convex server client is not configured.",
							});
						}
						// Fetch with owner context only; streaming/persistence is owner-only.
						const ownerHint = sessionUserId ?? body.userId;
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
					} else if (sessionUserId) {
						effectiveUserId = sessionUserId;
					} else if (body.userId) {
						effectiveUserId = body.userId;
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
					const result = streamText({
						model: google(model),
						messages,
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
						const resumable = await ctx.resumableStream(
							streamId,
							() => clientStream,
						);
						if (resumable) {
							return new Response(resumable, { headers });
						}
					}

					// No resumable context: stream directly to this client, but producer is
					// independently drained above so generation/finalization continues on disconnect.
					return new Response(clientStream.pipeThrough(new TextEncoderStream()), {
						headers,
					});
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
