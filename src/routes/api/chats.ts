import { createFileRoute } from "@tanstack/react-router";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/database";
import { chatMessages, chatThreads } from "#/database/chats";
import { memoryEpisodes, memoryFacts, memoryJobs } from "#/database/memory";
import {
	BrowserIdentityError,
	ownedThread,
	recoverAbandonedStream,
	requestUserId,
} from "#/lib/chat-persistence.server";

const mutation = z.discriminatedUnion("op", [
	z.object({ op: z.literal("forgetMemory"), episodeId: z.string() }),
	z.object({
		op: z.literal("archiveMemory"),
		episodeId: z.string(),
		archived: z.boolean(),
	}),

	z.object({
		op: z.literal("createThread"),
		id: z.string().max(200),
		title: z.string().max(1000).optional(),
	}),
	z.object({
		op: z.literal("renameThread"),
		threadId: z.string(),
		title: z.string().max(1000),
	}),
	z.object({ op: z.literal("deleteThread"), threadId: z.string() }),
	z.object({
		op: z.literal("sendMessage"),
		threadId: z.string(),
		clientUuid: z.string().max(200),
		role: z.literal("user"),
		content: z.string().max(32000),
	}),
	z.object({
		op: z.literal("updateMessage"),
		messageId: z.string(),
		content: z.string().max(32000),
		reasoning: z.string().optional(),
	}),
]);
export const Route = createFileRoute("/api/chats")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const userId = requestUserId(request);
					const threadId = new URL(request.url).searchParams.get("threadId");
					if (new URL(request.url).searchParams.get("view") === "memories") {
						const episodes = await db
							.select({
								id: memoryEpisodes.id,
								threadId: memoryEpisodes.threadId,
								questionId: memoryEpisodes.questionId,
								questionAt: memoryEpisodes.questionAt,
								question: memoryEpisodes.question,
								archived: memoryEpisodes.archived,
								indexState: memoryJobs.state,
								indexed: sql<boolean>`${memoryEpisodes.embedding} IS NOT NULL`,
							})
							.from(memoryEpisodes)
							.leftJoin(memoryJobs, eq(memoryJobs.episodeId, memoryEpisodes.id))
							.innerJoin(
								chatMessages,
								eq(chatMessages.id, memoryEpisodes.questionId),
							)
							.where(
								and(
									eq(memoryEpisodes.userId, userId),
									eq(memoryEpisodes.forgotten, false),
									sql`${chatMessages.content} = ${memoryEpisodes.question}`,
								),
							)
							.orderBy(desc(memoryEpisodes.questionAt))
							.limit(100);
						const facts = await db
							.select()
							.from(memoryFacts)
							.where(eq(memoryFacts.userId, userId))
							.orderBy(desc(memoryFacts.createdAt))
							.limit(500);
						return Response.json({ episodes, facts });
					}

					const threads = await db
						.select()
						.from(chatThreads)
						.where(
							threadId
								? and(
										eq(chatThreads.id, threadId),
										eq(chatThreads.userId, userId),
									)
								: eq(chatThreads.userId, userId),
						)
						.orderBy(desc(chatThreads.updatedAt));
					for (let i = 0; i < threads.length; i++)
						threads[i] = await recoverAbandonedStream(threads[i]);
					const messages =
						threadId && threads.length
							? await db
									.select()
									.from(chatMessages)
									.where(eq(chatMessages.threadId, threadId))
									.orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
							: [];
					return Response.json({
						threads: threads.map(
							({ id, currentStreamId, streamStartedAt, ...t }) => ({
								...t,
								_id: id,
								isLive: !!currentStreamId,
								currentStreamId: currentStreamId ?? undefined,
								streamStartedAt: streamStartedAt ?? undefined,
							}),
						),
						messages: messages.map(({ id, reasoning, ...m }) => ({
							...m,
							_id: id,
							reasoning: reasoning ?? undefined,
						})),
					});
				} catch (error) {
					if (error instanceof BrowserIdentityError)
						return Response.json(
							{
								message:
									"Browser identity cookie is required. Reload the page and enable cookies.",
							},
							{ status: 401 },
						);
					console.error("[chats] request failed", error);
					return Response.json(
						{ message: "Unable to load chats" },
						{ status: 500 },
					);
				}
			},
			POST: async ({ request }) => {
				try {
					const userId = requestUserId(request);
					const parsed = mutation.safeParse(await request.json());
					if (!parsed.success)
						return Response.json(
							{ message: "Invalid chat mutation" },
							{ status: 400 },
						);
					const body = parsed.data;
					if (body.op === "forgetMemory" || body.op === "archiveMemory") {
						await db.transaction(async (tx) => {
							const [episode] = await tx
								.select()
								.from(memoryEpisodes)
								.where(
									and(
										eq(memoryEpisodes.id, body.episodeId),
										eq(memoryEpisodes.userId, userId),
									),
								)
								.for("update");
							if (!episode) return;
							if (body.op === "archiveMemory")
								await tx
									.update(memoryEpisodes)
									.set({ archived: body.archived })
									.where(eq(memoryEpisodes.id, episode.id));
							else {
								// Keep only a source tombstone, preventing automatic re-extraction.
								await tx
									.update(memoryEpisodes)
									.set({
										forgotten: true,
										question: "",
										answer: "",
										evidence: {},
										embedding: null,
										embeddingModel: null,
									})
									.where(eq(memoryEpisodes.id, episode.id));
								await tx
									.delete(memoryFacts)
									.where(eq(memoryFacts.episodeId, episode.id));
								await tx
									.delete(memoryJobs)
									.where(eq(memoryJobs.episodeId, episode.id));
							}
						});
						return Response.json({ ok: true });
					}

					if (body.op === "createThread") {
						await db
							.insert(chatThreads)
							.values({
								id: body.id,
								userId,
								title: body.title ?? "New chat",
								createdAt: Date.now(),
								updatedAt: Date.now(),
							})
							.onConflictDoNothing();
					} else {
						let threadId: string;
						if (body.op === "updateMessage") {
							const [message] = await db
								.select()
								.from(chatMessages)
								.where(eq(chatMessages.id, body.messageId));
							if (!message) return new Response(null, { status: 404 });
							threadId = message.threadId;
						} else threadId = body.threadId;
						if (!(await ownedThread(threadId, userId)))
							return new Response(null, { status: 404 });
						if (body.op === "deleteThread")
							await db.delete(chatThreads).where(eq(chatThreads.id, threadId));
						if (body.op === "renameThread")
							await db
								.update(chatThreads)
								.set({ title: body.title, updatedAt: Date.now() })
								.where(eq(chatThreads.id, threadId));
						if (body.op === "sendMessage") {
							await db
								.insert(chatMessages)
								.values({
									id: `msg-${crypto.randomUUID()}`,
									threadId,
									clientUuid: body.clientUuid,
									role: body.role,
									content: body.content,
									createdAt: Date.now(),
								})
								.onConflictDoNothing({ target: chatMessages.clientUuid });
							await db
								.update(chatThreads)
								.set({ updatedAt: Date.now() })
								.where(eq(chatThreads.id, threadId));
						}

						if (body.op === "updateMessage")
							await db.transaction(async (tx) => {
								await tx
									.update(chatMessages)
									.set({ content: body.content, reasoning: body.reasoning })
									.where(eq(chatMessages.id, body.messageId));
								const affected = await tx
									.update(memoryEpisodes)
									.set({
										forgotten: true,
										embedding: null,
										embeddingModel: null,
									})
									.where(
										sql`${memoryEpisodes.questionId} = ${body.messageId} OR ${memoryEpisodes.answerId} = ${body.messageId}`,
									)
									.returning({ id: memoryEpisodes.id });
								for (const episode of affected) {
									await tx
										.delete(memoryFacts)
										.where(eq(memoryFacts.episodeId, episode.id));
									await tx
										.delete(memoryJobs)
										.where(eq(memoryJobs.episodeId, episode.id));
								}
							});
					}
					return Response.json({ ok: true });
				} catch (error) {
					if (error instanceof BrowserIdentityError)
						return Response.json(
							{
								message:
									"Browser identity cookie is required. Reload the page and enable cookies.",
							},
							{ status: 401 },
						);
					console.error("[chats] request failed", error);
					return Response.json(
						{ message: "Unable to save chat" },
						{ status: 500 },
					);
				}
			},
		},
	},
});
