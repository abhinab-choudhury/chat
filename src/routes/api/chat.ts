import { createGoogle } from "@ai-sdk/google";
import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";

import { getResumableStreamContext } from "#/lib/resumable-stream";

export const Route = createFileRoute("/api/chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const apiKey = process.env.GEMINI_API_KEY;
				if (!apiKey) {
					return new Response("GEMINI_API_KEY is not set on the server.", {
						status: 500,
					});
				}

				const body = (await request.json()) as {
					messages?: Array<{ role: string; content: string }>;
					model?: string;
					streamId?: string;
				};

				const model = body.model || "gemini-3.5-flash-lite";
				const messages = (body.messages ?? []).map((m) => ({
					role: m.role as "user" | "assistant" | "system",
					content: m.content,
				}));

				const google = createGoogle({ apiKey });
				const result = streamText({
					model: google(model),
					messages,
				});

				const ctx = getResumableStreamContext();
				const streamId = body.streamId;

				// If Redis-backed resumable streams are available and a streamId is
				// provided, publish the stream so clients can reconnect/resume.
				if (ctx && streamId) {
					const textStream = new ReadableStream<string>({
						async start(controller) {
							for await (const chunk of result.textStream) {
								controller.enqueue(chunk);
							}
							controller.close();
						},
					});
					const resumable = await ctx.resumableStream(
						streamId,
						() => textStream,
					);
					if (resumable) {
						return new Response(resumable, {
							headers: { "Content-Type": "text/plain; charset=utf-8" },
						});
					}
				}

				return result.toTextStreamResponse();
			},
		},
	},
});
