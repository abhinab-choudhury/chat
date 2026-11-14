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

						// If thread context is provided, enforce owner-only access.
						if (threadId) {
							const convex = getConvexServerClient();
							if (!convex) {
								throw new ChatError("internal:stream", {
									cause: "Convex server client is not configured.",
								});
							}
							const ownerHint = sessionUserId;
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
							// Resumable streams are not configured (REDIS_URL missing), so
							// nothing was buffered and there is nothing to resume. The
							// producer (if any) still persists the final message on
							// completion. Respond 204 so the client finalizes gracefully
							// instead of erroring (same as intern3-chat's GET route).
							console.warn(
								"[stream] resumable streams are not configured (REDIS_URL missing); cannot resume",
							);
							return new Response(null, { status: 204 });
						}

						// Replay the buffered stream from the beginning (intern3-chat's
						// resume architecture): a reloading client must receive every
						// chunk it missed, not just the tail from its reconnect point.
						//
						// resumeExistingStream (not resumableStream): it never starts a
						// recorder. resumableStream() with an empty fallback would turn
						// this GET into the recorder whenever the sentinel is missing
						// (Redis restart/flush, or a resume racing ahead of the POST),
						// instantly marking the stream DONE and killing the real one.
						// Returns undefined when the stream was never registered and null
						// when it already concluded; both mean "nothing to resume".
						const stream = await ctx.resumeExistingStream(params.streamId);
						if (!stream) {
							// Stream never existed or has already concluded; the thread is
							// already finalized server-side.
							return new Response(null, { status: 204 });
						}

						return new Response(stream.pipeThrough(new TextEncoderStream()), {
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
