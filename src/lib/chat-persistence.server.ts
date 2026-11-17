import { and, eq, sql } from "drizzle-orm";
import { db } from "#/database";
import { chatMessages, chatThreads } from "#/database/chats";
import { agentRuns } from "#/database/memory";
import { hasGenerationLease } from "./resumable-stream";
import { readUserIdFromCookie } from "./user-id";

export class BrowserIdentityError extends Error {}

// The current app uses an anonymous browser identity cookie, not account auth.
export function requestUserId(request: Request) {
	const id = readUserIdFromCookie(request.headers.get("cookie"));
	if (!id) throw new BrowserIdentityError("Browser identity is required");
	return id;
}
export async function ownedThread(threadId: string, userId: string) {
	const [thread] = await db
		.select()
		.from(chatThreads)
		.where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)));
	return thread;
}
export async function finishStream(args: {
	threadId: string;
	streamId: string;
	text: string;
	reasoning: string;
	toolData: unknown;
}) {
	await db.transaction(async (tx) => {
		if (args.text || args.reasoning)
			await tx
				.insert(chatMessages)
				.values({
					id: `msg-${crypto.randomUUID()}`,
					clientUuid: `${args.streamId}:assistant`,
					threadId: args.threadId,
					role: "assistant",
					content: args.text,
					reasoning: args.reasoning || null,
					toolData: args.toolData,
					createdAt: Date.now(),
				})
				.onConflictDoNothing({ target: chatMessages.clientUuid });
		await tx
			.update(chatThreads)
			.set({
				currentStreamId: null,
				streamStartedAt: null,
				updatedAt: Date.now(),
			})
			.where(
				and(
					eq(chatThreads.id, args.threadId),
					eq(chatThreads.currentStreamId, args.streamId),
				),
			);
	});
}

/** Clear abandoned claims without disturbing a live producer or a racing POST. */
export async function recoverAbandonedStream(
	thread: typeof chatThreads.$inferSelect,
) {
	if (!thread.currentStreamId) return thread;
	const age = Date.now() - (thread.streamStartedAt ?? 0);
	if (age < 30000) return thread;
	const lease = await hasGenerationLease(thread.currentStreamId);
	if (lease === true || (lease === null && age < 6 * 60 * 1000)) return thread;
	const [recovered] = await db
		.update(chatThreads)
		.set({ currentStreamId: null, streamStartedAt: null })
		.where(
			and(
				eq(chatThreads.id, thread.id),
				eq(chatThreads.currentStreamId, thread.currentStreamId),
			),
		)
		.returning();
	if (recovered)
		await db
			.update(agentRuns)
			.set({ state: "failed", error: "Generation interrupted" })
			.where(
				and(
					eq(agentRuns.id, thread.currentStreamId),
					eq(agentRuns.threadId, thread.id),
					sql`${agentRuns.state} IN ('running', 'reviewing')`,
				),
			);
	return recovered ?? thread;
}
