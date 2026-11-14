import { createGoogle } from "@ai-sdk/google";
import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";

import { ChatError, toChatError } from "#/lib/errors";
import { getResumableStreamContext } from "#/lib/resumable-stream";

export const Route = createFileRoute("/api/chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const apiKey = process.env.GEMINI_API_KEY;
					if (!apiKey) {
						throw new ChatError("internal:api", {
							cause: "GEMINI_API_KEY is not set on the server.",
						});
					}

					let body: {
						messages?: Array<{ role: string; content: string }>;
						model?: string;
						streamId?: string;
					};
					try {
						body = (await request.json()) as typeof body;
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

					const model = body.model || "gemini-3.5-flash-lite";
					const messages = body.messages.map((m) => ({
						role: m.role as "user" | "assistant" | "system",
						content: String(m.content ?? ""),
					}));

					const google = createGoogle({ apiKey });
					const result = streamText({
						model: google(model),
						messages,
					});

					const encoder = new TextEncoder();
					const eventStream = new ReadableStream<Uint8Array>({
						async start(controller) {
							const enqueue = (event: Record<string, unknown>) => {
								controller.enqueue(
									encoder.encode(`${JSON.stringify(event)}\n`),
								);
							};
							try {
								for await (const part of result.fullStream) {
									if (part.type === "reasoning-delta" && "text" in part) {
										const delta = (part as { text?: string }).text;
										if (delta) enqueue({ t: "r", d: delta });
									} else if (part.type === "text-delta" && "text" in part) {
										const delta = (part as { text?: string }).text;
										if (delta) enqueue({ t: "t", d: delta });
									}
								}
								enqueue({ t: "e" });
							} catch (error) {
								enqueue({
									t: "err",
									d: error instanceof Error ? error.message : "Stream error",
								});
							} finally {
								controller.close();
							}
						},
					});

					const ctx = getResumableStreamContext();
					const streamId = body.streamId;

					// If Redis-backed resumable streams are available and a streamId is
					// provided, publish the stream so clients can reconnect/resume.
					if (ctx && streamId) {
						const resumable = await ctx.resumableStream(
							streamId,
							() => eventStream,
						);
						if (resumable) {
							return new Response(resumable, {
								headers: {
									"Content-Type": "application/x-ndjson; charset=utf-8",
									"Cache-Control": "no-cache",
								},
							});
						}
					}

					return new Response(eventStream, {
						headers: {
							"Content-Type": "application/x-ndjson; charset=utf-8",
							"Cache-Control": "no-cache",
						},
					});
				} catch (error) {
					return toChatError(error, "internal:chat").toResponse();
				}
			},
		},
	},
});
