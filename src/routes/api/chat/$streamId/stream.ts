import { createFileRoute } from "@tanstack/react-router";
import { withApiLogging } from "#/lib/api-logging.server";
import {
	ownedThread,
	recoverAbandonedStream,
	requestUserId,
} from "#/lib/chat-persistence.server";
import { ChatError, toChatError } from "#/lib/errors";
import { getResumableStreamContext } from "#/lib/resumable-stream";

export const Route = createFileRoute("/api/chat/$streamId/stream")({
	server: {
		handlers: {
			GET: withApiLogging(
				"/api/chat/$streamId/stream",
				async ({
					params,
					request,
				}: {
					params: { streamId: string };
					request: Request;
				}) => {
					try {
						if (!params.streamId) {
							throw new ChatError("bad_request:stream", {
								cause: "streamId is required",
								exposeCause: true,
							});
						}

						const url = new URL(request.url);
						const threadId = url.searchParams.get("threadId");
						if (!threadId)
							throw new ChatError("bad_request:stream", {
								message: "threadId is required",
							});

						const owned = await ownedThread(threadId, requestUserId(request));
						const thread = owned
							? await recoverAbandonedStream(owned)
							: undefined;
						if (!thread || thread.currentStreamId !== params.streamId)
							return new Response(null, { status: 204 });

						const ctx = getResumableStreamContext();
						if (!ctx) {
							// Resumable streams are not configured (REDIS_URL missing), so
							// nothing was buffered and there is nothing to resume. The
							// producer (if any) still persists the final message on
							// completion. Respond 204 so the client finalizes gracefully
							// instead of erroring.
							console.warn(
								"[stream] resumable streams are not configured (REDIS_URL missing); cannot resume",
							);
							return new Response(null, { status: 204 });
						}

						// Replay the buffered stream from the beginning: a reloading
						// client must receive every chunk it missed, not just the
						// tail from its reconnect point.
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
			),
		},
	},
});
