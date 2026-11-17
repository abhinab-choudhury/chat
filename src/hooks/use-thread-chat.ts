import { useMutation } from "convex/react";
import * as React from "react";
import { useSession } from "#/hooks/auth-hooks";
import type { AgentPhase } from "#/lib/agent/progress";
import { useDiskCachedQuery } from "#/lib/convex-cached-query";
import {
	readCachedMessages,
	writeCachedMessages,
} from "#/lib/local-chat-cache";
import type { WebSearchToolCall, WebSearchToolData } from "#/lib/search/types";
import { consumeChatStream } from "#/lib/stream-reader";
import { getCurrentUserId } from "#/lib/user-id";
import { useChatStore } from "#/store/chat-store";
import { useModelStore } from "#/store/model-store";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

export interface ChatMessage {
	_id: string;
	role: string;
	content: string;
	reasoning?: string;
	toolData?: WebSearchToolData;
	_optimistic?: boolean;
}

export interface UseThreadChatResult {
	isPending: boolean;
	currentUserId: string | null;
	thread: Doc<"threads"> | null | undefined;
	canView: boolean;
	isOwner: boolean;
	messages: ChatMessage[] | undefined;
	displayMessages: ChatMessage[];
	input: string;
	setInput: (input: string) => void;
	busy: boolean;
	pendingAutoSend: boolean;
	streamingText: string;
	agentPhase: AgentPhase;
	chatError: string | null;
	streamingReasoning: string;
	streamingToolCalls: WebSearchToolCall[];
	webSearchEnabled: boolean;
	toggleWebSearch: () => void;
	selectedModel: string;
	setSelectedModel: (model: string) => void;
	handleSubmit: (override?: string, sendUser?: boolean) => Promise<void>;
}

/**
 * Owns all thread-level data and chat logic: queries, optimistic sends,
 * streaming, auto-send, and stream resume. Route components stay thin and
 * presentational.
 */
export function useThreadChat(threadId: Id<"threads">): UseThreadChatResult {
	const { user, isPending } = useSession();
	const currentUserId = isPending ? null : (user?.id ?? getCurrentUserId(null));

	const thread = useDiskCachedQuery(
		api.threads.getThread,
		{
			key: `thread:${threadId}:${currentUserId ?? "anon"}`,
			default: undefined,
		},
		{ threadId, userId: currentUserId ?? undefined },
	);
	const canView =
		!!thread &&
		!!currentUserId &&
		(thread.userId === currentUserId || !!thread.isPublic);
	const messages = useDiskCachedQuery(
		api.messages.getMessages,
		{
			key: `messages:${threadId}:${currentUserId ?? "anon"}`,
			default: undefined,
		},
		canView ? { threadId, userId: currentUserId ?? undefined } : "skip",
	);

	// Best-effort local cache of finalized messages for instant paints.
	React.useEffect(() => {
		if (messages && messages.length > 0) {
			writeCachedMessages(
				threadId,
				messages.map(
					(m: {
						_id: string;
						role: string;
						content: string;
						reasoning?: string;
						toolData?: WebSearchToolData;
						createdAt?: number;
					}) => ({
						_id: String(m._id),
						role: m.role,
						content: m.content,
						reasoning: m.reasoning,
						toolData: m.toolData,
						createdAt: m.createdAt,
					}),
				),
			);
		}
	}, [messages, threadId]);

	const send = useMutation(api.messages.sendMessage).withOptimisticUpdate(
		(localStore, args) => {
			const queryArgs = {
				threadId: args.threadId,
				userId: args.userId,
			};
			const current = localStore.getQuery(api.messages.getMessages, queryArgs);
			if (current !== undefined) {
				localStore.setQuery(api.messages.getMessages, queryArgs, [
					...current,
					{
						_id: crypto.randomUUID() as unknown as (typeof current)[number]["_id"],
						_creationTime: Date.now(),
						threadId: args.threadId,
						role: args.role,
						content: args.content,
						reasoning: args.reasoning,
						toolData: args.toolData,
						authorId: args.authorId ?? args.userId,
						clientUuid: args.clientUuid,
						createdAt: Date.now(),
						isStreaming: args.isStreaming,
					},
				]);
			}
		},
	);

	const input = useChatStore((s) => s.input);
	const setInput = useChatStore((s) => s.setInput);
	const busy = useChatStore((s) => s.busy);
	const setBusy = useChatStore((s) => s.setBusy);
	const setThreadId = useChatStore((s) => s.setThreadId);
	const pendingAutoSend = useChatStore((s) => s.pendingAutoSend);
	const setPendingAutoSend = useChatStore((s) => s.setPendingAutoSend);
	const pendingInitialMessage = useChatStore((s) => s.pendingInitialMessage);
	const setPendingInitialMessage = useChatStore(
		(s) => s.setPendingInitialMessage,
	);
	const selectedModel = useModelStore((s) => s.selectedModel);
	const setSelectedModel = useModelStore((s) => s.setSelectedModel);
	// Web search is opt-in via the input's globe toggle (master-gated by
	// "Enable tools" in Settings > AI Options).
	const webSearchEnabled = useModelStore(
		(s) => s.toolsEnabled && s.enabledTools.includes("web_search"),
	);
	const reasoningEffort = useModelStore((s) => s.reasoningEffort);
	const memoryEnabled = useModelStore((s) => s.memoryEnabled);
	const toggleWebSearchTool = useModelStore((s) => s.toggleTool);
	const toggleWebSearch = React.useCallback(() => {
		toggleWebSearchTool("web_search");
	}, [toggleWebSearchTool]);

	const isOwner =
		!!thread && !!currentUserId && thread.userId === currentUserId;

	const [agentPhase, setAgentPhase] = React.useState<AgentPhase>("preparing");
	const [chatError, setChatError] = React.useState<string | null>(null);
	const [streamingText, setStreamingText] = React.useState("");
	const [streamingReasoning, setStreamingReasoning] = React.useState("");
	const [streamingToolCalls, setStreamingToolCalls] = React.useState<
		WebSearchToolCall[]
	>([]);

	const sendingRef = React.useRef(false);
	const abortRef = React.useRef<AbortController | null>(null);
	const autoSentRef = React.useRef(false);
	const resumedRef = React.useRef(false);

	// Reset per-thread streaming bookkeeping when navigating between threads so a
	// previous thread's in-flight stream doesn't leak into this one's UI.
	React.useEffect(() => {
		setThreadId(threadId);
		setChatError(null);
		setAgentPhase("preparing");
		autoSentRef.current = false;
		resumedRef.current = false;
		setStreamingText("");
		setStreamingReasoning("");
		setStreamingToolCalls([]);
		// Abort any in-flight stream when leaving this thread so it can't
		// keep writing into another thread's view.
		return () => {
			abortRef.current?.abort();
			abortRef.current = null;
			setBusy(false);
			sendingRef.current = false;
		};
	}, [threadId, setThreadId, setBusy]);

	const handleSubmit = React.useCallback(
		async (override?: string, sendUser: boolean = true) => {
			const trimmed = (override ?? input).trim();
			if (sendUser) {
				if (!trimmed || busy || !isOwner || sendingRef.current) return;
			} else {
				if (busy || !isOwner || sendingRef.current) return;
			}
			sendingRef.current = true;
			setBusy(true);
			setAgentPhase("preparing");
			setChatError(null);
			if (sendUser && !override) setInput("");
			try {
				if (sendUser && trimmed) {
					await send({
						clientUuid: crypto.randomUUID(),
						threadId,
						role: "user",
						content: trimmed,
						userId: currentUserId ?? undefined,
					});
				}

				const baseHistory = (messages ?? []).map((m) => ({
					role: m.role as "user" | "assistant" | "system",
					content: m.content,
				}));
				let history =
					sendUser && trimmed
						? [...baseHistory, { role: "user" as const, content: trimmed }]
						: baseHistory;

				// Optimistic path: on first auto-send, include the pending initial
				// message if it hasn't appeared in the Convex query yet.
				if (!sendUser && pendingInitialMessage) {
					const hasPending = baseHistory.some(
						(m) => m.role === "user" && m.content === pendingInitialMessage,
					);
					if (!hasPending) {
						history = [
							...baseHistory,
							{ role: "user" as const, content: pendingInitialMessage },
						];
					}
					setPendingInitialMessage(null);
				}

				const streamId = crypto.randomUUID();

				setStreamingText("");
				setStreamingReasoning("");
				setStreamingToolCalls([]);

				const controller = new AbortController();
				abortRef.current = controller;
				const res = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					signal: controller.signal,
					body: JSON.stringify({
						messages: history,
						model: selectedModel,
						streamId,
						threadId,
						userId: currentUserId ?? undefined,
						webSearch: webSearchEnabled,
						timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
						memory: memoryEnabled,
						reasoningEffort,
					}),
				});

				if (!res.ok || !res.body) {
					let message = `Chat request failed: ${res.status}`;
					try {
						const err = (await res.clone().json()) as { message?: string };
						if (err?.message) message = err.message;
					} catch {
						// ignore parse errors
					}
					throw new Error(message);
				}

				await consumeChatStream(res.body, {
					onText: setStreamingText,
					onReasoning: setStreamingReasoning,
					onToolCalls: setStreamingToolCalls,
					onStatus: setAgentPhase,
				});

				setStreamingText("");
				setStreamingReasoning("");
				setStreamingToolCalls([]);
			} catch (e) {
				if (!(e instanceof Error && e.name === "AbortError")) {
					setChatError(
						e instanceof Error ? e.message : "Unable to complete the response.",
					);
					console.error(e);
				}
				setStreamingText("");
				setStreamingReasoning("");
			} finally {
				abortRef.current = null;
				sendingRef.current = false;
				setBusy(false);
			}
		},
		[
			input,
			busy,
			messages,
			send,
			threadId,
			selectedModel,
			webSearchEnabled,
			reasoningEffort,
			memoryEnabled,
			setBusy,
			setInput,
			isOwner,
			currentUserId,
			pendingInitialMessage,
			setPendingInitialMessage,
		],
	);

	// First message of a new thread: the home screen queued an auto-send for us.
	React.useEffect(() => {
		if (
			pendingAutoSend &&
			isOwner &&
			thread !== undefined &&
			thread !== null &&
			!autoSentRef.current
		) {
			autoSentRef.current = true;
			setPendingAutoSend(false);
			void handleSubmit(undefined, false);
		}
	}, [pendingAutoSend, isOwner, thread, handleSubmit, setPendingAutoSend]);

	// Resume an in-flight stream after a reconnect/reload.
	React.useEffect(() => {
		if (!thread?.isLive || !thread.currentStreamId || resumedRef.current)
			return;
		if (busy || sendingRef.current) return;
		resumedRef.current = true;
		setBusy(true);
		setStreamingText("");
		setStreamingReasoning("");
		(async () => {
			try {
				const params = new URLSearchParams({
					threadId,
					...(currentUserId ? { userId: currentUserId } : {}),
				});
				const res = await fetch(
					`/api/chat/${thread.currentStreamId}/stream?${params.toString()}`,
				);
				if (res.status === 204 || !res.ok || !res.body) {
					return;
				}
				await consumeChatStream(res.body, {
					onText: setStreamingText,
					onReasoning: setStreamingReasoning,
					onToolCalls: setStreamingToolCalls,
					onStatus: setAgentPhase,
				});

				setStreamingText("");
				setStreamingReasoning("");
				setStreamingToolCalls([]);
			} catch (e) {
				setChatError(
					e instanceof Error ? e.message : "Unable to resume the response.",
				);
				console.error(e);
			} finally {
				setBusy(false);
			}
		})();
	}, [
		thread?.isLive,
		thread?.currentStreamId,
		busy,
		setBusy,
		threadId,
		currentUserId,
	]);

	const displayMessages = React.useMemo(() => {
		const source = (messages ?? readCachedMessages(threadId) ?? []) as Array<{
			_id: string;
			role: string;
			content: string;
			reasoning?: string;
			toolData?: WebSearchToolData;
		}>;
		const list: ChatMessage[] = source.map((m) => ({
			_id: String(m._id),
			role: m.role,
			content: m.content,
			reasoning: m.reasoning,
			toolData: m.toolData,
		}));
		if (
			pendingInitialMessage &&
			!list.some(
				(m) => m.role === "user" && m.content === pendingInitialMessage,
			)
		) {
			list.push({
				_id: "__optimistic_user__",
				role: "user",
				content: pendingInitialMessage,
				_optimistic: true,
			});
		}
		return list;
	}, [messages, threadId, pendingInitialMessage]);

	return {
		isPending,
		currentUserId,
		thread,
		canView,
		isOwner,
		messages,
		displayMessages,
		input,
		setInput,
		busy,
		pendingAutoSend,
		streamingText,
		agentPhase,
		chatError,
		streamingReasoning,
		streamingToolCalls,
		webSearchEnabled,
		toggleWebSearch,
		selectedModel,
		setSelectedModel,
		handleSubmit,
	};
}
