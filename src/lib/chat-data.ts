import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getCurrentUserId } from "./user-id";

export interface Thread {
	_id: string;
	_creationTime?: number;
	title: string;
	userId: string;
	clientUuid?: string;
	createdAt: number;
	updatedAt: number;
	archived?: boolean;
	isPublic?: boolean;
	isLive?: boolean;
	currentStreamId?: string;
	streamStartedAt?: number;
	agentThreadId?: string;
	projectId?: string;
	customPrompt?: string;
	defaultModel?: string;
}

export interface Message {
	_id: string;
	_creationTime?: number;
	threadId: string;
	role: string;
	content: string;
	reasoning?: string;
	toolData?: unknown;
	authorId?: string;
	clientUuid?: string;
	createdAt: number;
	isStreaming?: boolean;
}

interface ChatDataState {
	threadsByUser: Record<string, Thread[]>;
	messagesByThread: Record<string, Message[]>;

	listThreads: (userId: string) => Thread[];
	getThread: (threadId: string) => Thread | null;
	createThread: (args: {
		userId: string;
		title?: string;
		clientUuid?: string;
	}) => string;
	renameThread: (args: { threadId: string; title: string }) => void;
	archiveThread: (args: { threadId: string }) => void;
	deleteThread: (args: { threadId: string; userId: string }) => void;
	setThreadPublic: (args: {
		threadId: string;
		isPublic: boolean;
		userId?: string;
	}) => void;
	setThreadStreaming: (args: {
		threadId: string;
		isLive: boolean;
		streamId?: string;
	}) => void;

	getMessages: (threadId: string) => Message[];
	sendMessage: (args: {
		clientUuid: string;
		threadId: string;
		role: string;
		content: string;
		reasoning?: string;
		toolData?: unknown;
		authorId?: string;
		userId?: string;
		isStreaming?: boolean;
	}) => string;
	updateMessage: (args: {
		messageId: string;
		content: string;
		reasoning?: string;
	}) => void;
	appendMessage: (args: {
		clientUuid: string;
		content: string;
		reasoning?: string;
		isStreaming: boolean;
	}) => void;

	searchThreads: (args: {
		userId: string;
		query: string;
		limit?: number;
	}) => Thread[];
	getUserUsage: (userId: string) => {
		totalThreads: number;
		totalMessages: number;
		userMessages: number;
		assistantMessages: number;
		daily: { name: string; messages: number }[];
	};
}

function makeId(prefix: string) {
	return `${prefix}-${crypto.randomUUID()}`;
}

export const useChatDataStore = create<ChatDataState>()(
	persist(
		(set, get) => ({
			threadsByUser: {},
			messagesByThread: {},

			listThreads: (userId) => {
				const threads = get().threadsByUser[userId] ?? [];
				return [...threads].sort(
					(a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
				);
			},
			getThread: (threadId) => {
				for (const threads of Object.values(get().threadsByUser)) {
					const found = threads.find((t) => t._id === threadId);
					if (found) return found;
				}
				return null;
			},
			createThread: ({ userId, title, clientUuid }) => {
				if (clientUuid) {
					const existing = (get().threadsByUser[userId] ?? []).find(
						(t) => t.clientUuid === clientUuid,
					);
					if (existing) return existing._id;
				}
				const now = Date.now();
				const id = makeId("thread");
				const thread: Thread = {
					_id: id,
					title: title ?? "New chat",
					userId,
					clientUuid,
					createdAt: now,
					updatedAt: now,
				};
				set((state) => {
					const list = state.threadsByUser[userId] ?? [];
					return {
						threadsByUser: {
							...state.threadsByUser,
							[userId]: [thread, ...list],
						},
					};
				});
				return id;
			},
			renameThread: ({ threadId, title }) => {
				set((state) => {
					const next: Record<string, Thread[]> = { ...state.threadsByUser };
					for (const userId of Object.keys(next)) {
						next[userId] = next[userId].map((t) =>
							t._id === threadId ? { ...t, title, updatedAt: Date.now() } : t,
						);
					}
					return { threadsByUser: next };
				});
			},
			archiveThread: ({ threadId }) => {
				set((state) => {
					const next: Record<string, Thread[]> = { ...state.threadsByUser };
					for (const userId of Object.keys(next)) {
						next[userId] = next[userId].map((t) =>
							t._id === threadId
								? { ...t, archived: true, updatedAt: Date.now() }
								: t,
						);
					}
					return { threadsByUser: next };
				});
			},
			deleteThread: ({ threadId, userId }) => {
				set((state) => {
					const list = (state.threadsByUser[userId] ?? []).filter(
						(t) => t._id !== threadId,
					);
					const messages = { ...state.messagesByThread };
					delete messages[threadId];
					return {
						threadsByUser: { ...state.threadsByUser, [userId]: list },
						messagesByThread: messages,
					};
				});
			},
			setThreadPublic: ({ threadId, isPublic }) => {
				set((state) => {
					const next: Record<string, Thread[]> = { ...state.threadsByUser };
					for (const userId of Object.keys(next)) {
						next[userId] = next[userId].map((t) =>
							t._id === threadId ? { ...t, isPublic } : t,
						);
					}
					return { threadsByUser: next };
				});
			},
			setThreadStreaming: ({ threadId, isLive, streamId }) => {
				set((state) => {
					const next: Record<string, Thread[]> = { ...state.threadsByUser };
					for (const userId of Object.keys(next)) {
						next[userId] = next[userId].map((t) =>
							t._id === threadId
								? {
										...t,
										isLive,
										currentStreamId: isLive ? streamId : undefined,
										streamStartedAt: isLive ? Date.now() : undefined,
										updatedAt: Date.now(),
									}
								: t,
						);
					}
					return { threadsByUser: next };
				});
			},

			getMessages: (threadId) => {
				return [...(get().messagesByThread[threadId] ?? [])].sort(
					(a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
				);
			},
			sendMessage: (args) => {
				if (args.clientUuid) {
					for (const msgs of Object.values(get().messagesByThread)) {
						const existing = msgs.find((m) => m.clientUuid === args.clientUuid);
						if (existing) return existing._id;
					}
				}
				const now = Date.now();
				const id = makeId("msg");
				const msg: Message = {
					_id: id,
					threadId: args.threadId,
					role: args.role,
					content: args.content,
					reasoning: args.reasoning,
					toolData: args.toolData,
					authorId: args.authorId ?? args.userId,
					clientUuid: args.clientUuid,
					createdAt: now,
					isStreaming: args.isStreaming,
				};
				set((state) => {
					const list = state.messagesByThread[args.threadId] ?? [];
					// update thread updatedAt
					const threads = { ...state.threadsByUser };
					for (const userId of Object.keys(threads)) {
						threads[userId] = threads[userId].map((t) =>
							t._id === args.threadId ? { ...t, updatedAt: now } : t,
						);
					}
					return {
						messagesByThread: {
							...state.messagesByThread,
							[args.threadId]: [...list, msg],
						},
						threadsByUser: threads,
					};
				});
				return id;
			},
			updateMessage: ({ messageId, content, reasoning }) => {
				set((state) => {
					const next = { ...state.messagesByThread };
					for (const threadId of Object.keys(next)) {
						next[threadId] = next[threadId].map((m) =>
							m._id === messageId
								? {
										...m,
										content,
										...(reasoning !== undefined ? { reasoning } : {}),
									}
								: m,
						);
					}
					return { messagesByThread: next };
				});
			},
			appendMessage: () => {
				// no-op compatibility; use sendMessage instead
			},
			searchThreads: ({ userId, query, limit }) => {
				const lim = Math.min(Math.max(Math.trunc(limit ?? 20), 1), 50);
				const term = query.trim().toLowerCase();
				const threads = (get().threadsByUser[userId] ?? []).filter(
					(t) => !t.archived,
				);
				const results = term
					? threads.filter((t) => t.title.toLowerCase().includes(term))
					: threads;
				return [...results]
					.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
					.slice(0, lim);
			},
			getUserUsage: (userId) => {
				const threads = get().threadsByUser[userId] ?? [];
				let totalMessages = 0;
				let userMessages = 0;
				let assistantMessages = 0;
				const days = 7;
				const now = Date.now();
				const msPerDay = 24 * 60 * 60 * 1000;
				const bucketStarts: number[] = [];
				for (let i = days - 1; i >= 0; i--) {
					const d = new Date(now - i * msPerDay);
					d.setHours(0, 0, 0, 0);
					bucketStarts.push(d.getTime());
				}
				const counts = new Array(days).fill(0);
				for (const thread of threads) {
					const messages = get().messagesByThread[thread._id] ?? [];
					for (const m of messages) {
						totalMessages += 1;
						if (m.role === "user") userMessages += 1;
						else if (m.role === "assistant") assistantMessages += 1;
						const dayIndex = bucketStarts.findIndex(
							(start, idx) =>
								m.createdAt >= start &&
								(idx === days - 1 || m.createdAt < bucketStarts[idx + 1]),
						);
						if (dayIndex !== -1) counts[dayIndex] += 1;
					}
				}
				const daily = bucketStarts.map((start, idx) => {
					const d = new Date(start);
					return {
						name: d.toLocaleDateString("en-US", { weekday: "short" }),
						messages: counts[idx],
					};
				});
				return {
					totalThreads: threads.length,
					totalMessages,
					userMessages,
					assistantMessages,
					daily,
				};
			},
		}),
		{ name: "chat-data:v1" },
	),
);

// External-store snapshots must keep the same reference until data changes.
const EMPTY_THREADS: Thread[] = [];
const EMPTY_MESSAGES: Message[] = [];

export function selectThreads(
	state: Pick<ChatDataState, "threadsByUser">,
	userId: string | null,
) {
	return (userId ? state.threadsByUser[userId] : undefined) ?? EMPTY_THREADS;
}

export function selectMessages(
	state: Pick<ChatDataState, "messagesByThread">,
	threadId: string | undefined,
) {
	return (
		(threadId ? state.messagesByThread[threadId] : undefined) ?? EMPTY_MESSAGES
	);
}

// React hooks
export function useThreads(userId: string | null) {
	useEffect(() => {
		if (userId) void refreshChats().catch(console.error);
	}, [userId]);
	return useChatDataStore((state) => selectThreads(state, userId));
}

export function useThread(threadId: string | undefined) {
	useEffect(() => {
		if (!threadId) return;
		void refreshChats(threadId).catch(console.error);
		const timer = setInterval(() => {
			void refreshChats(threadId).catch(console.error);
		}, 1500);
		return () => clearInterval(timer);
	}, [threadId]);
	return useChatDataStore((state) => {
		if (!threadId) return undefined;
		for (const threads of Object.values(state.threadsByUser)) {
			const found = threads.find((t) => t._id === threadId);
			if (found) return found;
		}
		return null;
	});
}

export function useMessages(threadId: string | undefined) {
	return useChatDataStore((state) => selectMessages(state, threadId));
}

// Postgres is authoritative; Zustand is the browser view/cache.
export async function refreshChats(threadId?: string) {
	getCurrentUserId();
	const response = await fetch(
		`/api/chats${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ""}`,
	);
	if (!response.ok) throw new Error("Unable to load chats");
	const data = (await response.json()) as {
		threads: Thread[];
		messages: Message[];
	};
	useChatDataStore.setState((state) => {
		const threadsByUser = { ...state.threadsByUser };
		if (threadId) {
			for (const userId of Object.keys(threadsByUser))
				threadsByUser[userId] = threadsByUser[userId].filter(
					(t) => t._id !== threadId,
				);
			for (const thread of data.threads)
				threadsByUser[thread.userId] = [
					...(threadsByUser[thread.userId] ?? []),
					thread,
				];
		} else {
			threadsByUser[getCurrentUserId()] = data.threads;
			for (const thread of data.threads)
				threadsByUser[thread.userId] = data.threads.filter(
					(t) => t.userId === thread.userId,
				);
		}
		return {
			threadsByUser,
			...(threadId
				? {
						messagesByThread: {
							...state.messagesByThread,
							[threadId]: data.messages,
						},
					}
				: {}),
		};
	});
}
async function mutate(op: string, args: object) {
	getCurrentUserId();
	const response = await fetch("/api/chats", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...args, op }),
	});
	if (!response.ok) throw new Error("Unable to save chat");
}
export const chatData = {
	searchThreads: (args: Parameters<ChatDataState["searchThreads"]>[0]) =>
		useChatDataStore.getState().searchThreads(args),
	getUserUsage: (userId: string) =>
		useChatDataStore.getState().getUserUsage(userId),
	createThread: async (args: Parameters<ChatDataState["createThread"]>[0]) => {
		const id = makeId("thread");
		await mutate("createThread", { ...args, id });
		await refreshChats(id);
		return id;
	},
	renameThread: async (args: Parameters<ChatDataState["renameThread"]>[0]) => {
		await mutate("renameThread", args);
		await refreshChats(args.threadId);
	},
	deleteThread: async (args: Parameters<ChatDataState["deleteThread"]>[0]) => {
		await mutate("deleteThread", args);
		useChatDataStore.getState().deleteThread(args);
	},
	sendMessage: async (args: Parameters<ChatDataState["sendMessage"]>[0]) => {
		await mutate("sendMessage", args);
		await refreshChats(args.threadId);
		return args.clientUuid;
	},
	updateMessage: async (
		args: Parameters<ChatDataState["updateMessage"]>[0],
	) => {
		await mutate("updateMessage", args);
		useChatDataStore.getState().updateMessage(args);
	},
	setThreadStreaming: async (
		args: Parameters<ChatDataState["setThreadStreaming"]>[0],
	) => {
		useChatDataStore.getState().setThreadStreaming(args);
	},
};
