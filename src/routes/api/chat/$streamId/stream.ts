import { createFileRoute } from "@tanstack/react-router";

import { getResumableStreamContext } from "#/lib/resumable-stream";

export const Route = createFileRoute("/api/chat/$streamId/stream")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const ctx = getResumableStreamContext();
				if (!ctx) {
					return new Response("Resumable streams not configured", {
						status: 501,
					});
				}
				const stream = await ctx.resumeExistingStream(params.streamId);
				if (stream === null) {
					// Stream fully done.
					return new Response(null, { status: 204 });
				}
				if (stream === undefined) {
					return new Response("Stream not found", { status: 404 });
				}
				return new Response(stream, {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			},
		},
	},
});
