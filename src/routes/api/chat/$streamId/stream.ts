import { createFileRoute } from "@tanstack/react-router";

import { auth } from "#/lib/auth";
import { convexApi, getConvexServerClient } from "#/lib/convex-server";
import { ChatError, toChatError } from "#/lib/errors";
import { getResumableStreamContext } from "#/lib/resumable-stream";

export const Route = createFileRoute("/api/chat/$streamId/stream")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				try {
					if (!params.streamId) {
						throw new ChatError("bad_request:stream", {
							cause: "streamId is required",
							exposeCause: true,
						});
					}

					const url = new URL(request.url);
					const threadId = url.searchParams.get("threadId");
					const userIdParam = url.searchParams.get("userId");

					// If thread context is provided, enforce owner-only access.
					if (threadId) {
						const convex = getConvexServerClient();
						if (!convex) {
							throw new ChatError("internal:stream", {
								cause: "Convex server client is not configured.",
							});
						}
						const session = await auth.api
							.getSession({ headers: request.headers })
							.catch(() => null);
						const sessionUserId = session?.user?.id as string | undefined;
						const ownerHint = sessionUserId ?? userIdParam ?? undefined;
						const thread = await convex.query(convexApi.threads.getThread, {
							threadId: threadId as any,
							userId: ownerHint,
						});
						const ownerId = (thread as { userId?: string } | null)?.userId;
						if (!thread || !ownerId || ownerId !== ownerHint) {
							throw new ChatError("forbidden:stream");
						}
						const currentStreamId = (thread as { currentStreamId?: string })
							.currentStreamId;
						if (currentStreamId && currentStreamId !== params.streamId) {
							return new Response(null, { status: 204 });
						}
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
						return new Response(null, { status: 204 });
					}
					if (stream === undefined) {
						return new Response(null, { status: 204 });
					}

					return new Response(stream, {
						headers: {
							"Content-Type": "application/x-ndjson; charset=utf-8",
							"Cache-Control": "no-cache, no-transform",
							"X-Accel-Buffering": "no",
						},
					});
				} catch (error) {
					return toChatError(error, "internal:stream").toResponse();
				}
			},
		},
	},
});
