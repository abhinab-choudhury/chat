import { createFileRoute } from "@tanstack/react-router";
import { chatInput } from "#/lib/agent/core";
import { openAgentStream } from "#/lib/agent/dispatch.server";
import { createChatResponseStream } from "#/lib/agent/transport";
import { withApiLogging } from "#/lib/api-logging.server";
import { getResumableStreamContext } from "#/lib/resumable-stream";

export const Route = createFileRoute("/api/chat")({
	server: {
		handlers: {
			POST: withApiLogging("/api/chat", async ({ request }) => {
				const parsed = chatInput.safeParse(
					await request.json().catch(() => null),
				);
				if (!parsed.success || !parsed.data.threadId || !parsed.data.streamId) {
					return Response.json(
						{ message: "Invalid chat request" },
						{ status: 400 },
					);
				}
				const body = parsed.data;
				const streamId = parsed.data.streamId;
				const stream = createChatResponseStream(
					() => openAgentStream(request, body),
					async (client) => {
						const context = getResumableStreamContext();
						return context
							? context.createNewResumableStream(streamId, () => client)
							: null;
					},
					streamId,
				);
				return new Response(stream, {
					headers: {
						"Content-Type": "application/x-ndjson; charset=utf-8",
						"Cache-Control": "no-cache, no-transform",
						"X-Accel-Buffering": "no",
					},
				});
			}),
		},
	},
});
