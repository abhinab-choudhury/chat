import { createFileRoute } from "@tanstack/react-router";

import { ChatError, toChatError } from "#/lib/errors";
import { getResumableStreamContext } from "#/lib/resumable-stream";

export const Route = createFileRoute("/api/chat/$streamId/stream")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					if (!params.streamId) {
						throw new ChatError("bad_request:stream", {
							cause: "streamId is required",
							exposeCause: true,
						});
					}

					const ctx = getResumableStreamContext();
					if (!ctx) {
						throw new ChatError("offline:stream", {
							cause:
								"Resumable streams are not configured (REDIS_URL missing).",
							exposeCause: true,
						});
					}

					const stream = await ctx.resumeExistingStream(params.streamId);
					if (stream === null) {
						// Stream fully done.
						return new Response(null, { status: 204 });
					}
					if (stream === undefined) {
						throw new ChatError("not_found:stream");
					}

					return new Response(stream, {
						headers: {
							"Content-Type": "application/x-ndjson; charset=utf-8",
							"Cache-Control": "no-cache",
						},
					});
				} catch (error) {
					return toChatError(error, "internal:stream").toResponse();
				}
			},
		},
	},
});
