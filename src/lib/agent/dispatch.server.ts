import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "#/database";
import { chatMessages, chatThreads } from "#/database/chats";
import { agentRuns } from "#/database/memory";
import {
	finishStream,
	ownedThread,
	recoverAbandonedStream,
	requestUserId,
} from "../chat-persistence.server";
import { startMemoryWorker } from "../memory/worker.server";
import {
	getResumableStreamContext,
	trackGeneration,
} from "../resumable-stream";
import type { chatInput } from "./core";
import { openDirectStream } from "./direct.server";
import { requireModelCredentials } from "./provider.server";
import { ChatTransportError } from "./transport";

export type ChatRequest = z.infer<typeof chatInput>;

/** Resolve credentials and open a direct chat stream (convex removed). */
export async function openAgentStream(
	request: Request,
	body: ChatRequest,
): Promise<ReadableStream<Uint8Array>> {
	const userId = requestUserId(request);
	try {
		requireModelCredentials(body.model);
	} catch (error) {
		throw new ChatTransportError(
			error instanceof Error
				? error.message
				: "Model configuration unavailable.",
		);
	}
	if (!body.threadId || !body.streamId)
		throw new ChatTransportError("Chat not found.");
	const thread = await ownedThread(body.threadId, userId);
	if (!thread) throw new ChatTransportError("Chat not found.");
	startMemoryWorker();
	const [prior] = await db
		.select()
		.from(agentRuns)
		.where(
			and(
				eq(agentRuns.id, body.streamId),
				eq(agentRuns.threadId, body.threadId),
			),
		);
	if (prior?.state === "complete" && prior.answerId) {
		const [answer] = await db
			.select()
			.from(chatMessages)
			.where(eq(chatMessages.id, prior.answerId));
		if (answer)
			return new ReadableStream({
				start(controller) {
					controller.enqueue(
						new TextEncoder().encode(
							`${JSON.stringify({ t: "t", d: answer.content })}\n{"t":"e"}\n`,
						),
					);
					controller.close();
				},
			});
	}
	if (prior && ["failed", "cancelled"].includes(prior.state))
		throw new ChatTransportError(
			"This request has ended. Submit a new request to retry.",
		);

	const existing = await recoverAbandonedStream(thread);
	if (existing.currentStreamId) {
		const replay = await getResumableStreamContext()?.resumeExistingStream(
			existing.currentStreamId,
		);
		if (replay) return replay.pipeThrough(new TextEncoderStream());
		throw new ChatTransportError("A response is already running in this chat.");
	}
	const claimed = await db
		.update(chatThreads)
		.set({ currentStreamId: body.streamId, streamStartedAt: Date.now() })
		.where(
			and(
				eq(chatThreads.id, body.threadId),
				or(
					isNull(chatThreads.currentStreamId),
					lt(chatThreads.streamStartedAt, Date.now() - 6 * 60 * 1000),
				),
			),
		)
		.returning({ id: chatThreads.id });
	if (!claimed.length) {
		const winner = await ownedThread(body.threadId, userId);
		if (winner?.currentStreamId) {
			const replay = await getResumableStreamContext()?.resumeExistingStream(
				winner.currentStreamId,
			);
			if (replay) return replay.pipeThrough(new TextEncoderStream());
		}
		throw new ChatTransportError("A response is already running in this chat.");
	}
	// Persist userId on body for downstream use.
	body.userId = userId;
	let stopLease: (() => Promise<void>) | undefined;
	try {
		stopLease = await trackGeneration(body.streamId);
		const upstream = await openDirectStream(request, body);
		const reader = upstream.getReader();
		return new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						controller.enqueue(value);
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				} finally {
					reader.releaseLock();
					await stopLease?.().catch(console.error);
				}
			},
		});
	} catch (error) {
		await stopLease?.().catch(console.error);
		await finishStream({
			threadId: body.threadId,
			streamId: body.streamId,
			text: "",
			reasoning: "",
			toolData: null,
		});
		throw error;
	}
}
