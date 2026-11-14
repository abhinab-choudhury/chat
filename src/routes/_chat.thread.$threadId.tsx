import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	CopyIcon,
	PencilIcon,
	RotateCcwIcon,
} from "lucide-react";
import * as React from "react";
import { Streamdown } from "streamdown";
import { ChatInput } from "#/components/chat/chat-input";
import { Button } from "#/components/ui/button";
import { Message, MessageContent } from "#/components/ui/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import { useSession } from "#/hooks/auth-hooks";
import { useDiskCachedQuery } from "#/lib/convex-cached-query";
import {
	readCachedMessages,
	writeCachedMessages,
} from "#/lib/local-chat-cache";
import { getCurrentUserId } from "#/lib/user-id";
import { cn } from "#/lib/utils";
import { useChatStore } from "#/store/chat-store";
import { useModelStore } from "#/store/model-store";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/_chat/thread/$threadId")({
	// SSR-friendly route boundary: validates params and enables streamed shell rendering.
	// Authenticated Convex data is reconciled client-side via reactive queries; public
	// prefetch/SSR can be layered here with server-side Convex fetching when safe.
	loader: async ({ params }) => {
		return { threadId: params.threadId };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { threadId: rawThreadId } = Route.useParams();
	const threadId = rawThreadId as Id<"threads">;

	const { user, isPending } = useSession();
	const currentUserId = isPending ? null : (user?.id ?? getCurrentUserId(null));

	const thread = useDiskCachedQuery(
		api.threads.getThread,
		{
			key: `thread:${threadId}:${currentUserId ?? "anon"}`,
			default: undefined as any,
		},
		{ threadId, userId: currentUserId ?? undefined },
	) as any;
	const canView =
		!!thread &&
		!!currentUserId &&
		(thread.userId === currentUserId || !!thread.isPublic);
	const messages = useDiskCachedQuery(
		api.messages.getMessages,
		{
			key: `messages:${threadId}:${currentUserId ?? "anon"}`,
			default: undefined as any,
		},
		canView ? { threadId, userId: currentUserId ?? undefined } : "skip",
	) as any;
	const cachedMessages = React.useMemo(
		() => readCachedMessages(threadId) ?? [],
		[threadId],
	);
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
						createdAt?: number;
					}) => ({
						_id: String(m._id),
						role: m.role,
						content: m.content,
						reasoning: m.reasoning,
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
						authorId: args.authorId ?? args.userId,
						clientUuid: args.clientUuid,
						createdAt: Date.now(),
						isStreaming: args.isStreaming,
					},
				]);
			}
		},
	);
	const setThreadStreaming = useMutation(api.threads.setThreadStreaming);
	const updateMessage = useMutation(api.messages.updateMessage);

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
	const [streamingText, setStreamingText] = React.useState("");
	const [streamingReasoning, setStreamingReasoning] = React.useState("");
	const [thinkingOpen, setThinkingOpen] = React.useState(false);
	const [openThinkingIds, setOpenThinkingIds] = React.useState<
		Record<string, boolean>
	>({});
	const [copiedId, setCopiedId] = React.useState<string | null>(null);
	const isOwner =
		!!thread && !!currentUserId && thread.userId === currentUserId;

	const [editingId, setEditingId] = React.useState<string | null>(null);
	const [editingText, setEditingText] = React.useState("");

	const toggleThinking = React.useCallback((id: string) => {
		setOpenThinkingIds((prev) => ({ ...prev, [id]: !prev[id] }));
	}, []);

	const copyText = React.useCallback(async (id: string, text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedId(id);
			window.setTimeout(() => {
				setCopiedId((current) => (current === id ? null : current));
			}, 1200);
		} catch (e) {
			console.error(e);
		}
	}, []);

	const sendingRef = React.useRef(false);

	React.useEffect(() => {
		setThreadId(threadId);
	}, [threadId, setThreadId]);

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

				const baseHistory = (messages ?? []).map((m: any) => ({
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
						(m: any) =>
							m.role === "user" && m.content === pendingInitialMessage,
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
				const assistantClientUuid = `${streamId}:assistant`;
				// Optimistic local mark; server also sets streaming state authoritatively.
				void setThreadStreaming({
					threadId,
					isLive: true,
					streamId,
				});

				setStreamingText("");
				setStreamingReasoning("");
				setThinkingOpen(false);

				const res = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						messages: history,
						model: selectedModel,
						streamId,
						threadId,
						userId: currentUserId ?? undefined,
						assistantClientUuid,
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

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let accumulated = "";
				let reasoningAccumulated = "";
				let buffer = "";

				const applyEvent = (line: string) => {
					if (!line.trim()) return;
					try {
						const evt = JSON.parse(line) as { t?: string; d?: string };
						if (evt.t === "r" && evt.d) {
							reasoningAccumulated += evt.d;
							setStreamingReasoning(reasoningAccumulated);
						} else if (evt.t === "t" && evt.d) {
							accumulated += evt.d;
							setStreamingText(accumulated);
						}
					} catch {
						// Fallback: treat as plain text chunk
						accumulated += line;
						setStreamingText(accumulated);
					}
				};

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) applyEvent(line);
				}
				if (buffer) applyEvent(buffer);

				if (accumulated.trim() || reasoningAccumulated.trim()) {
					// Idempotent fallback: server finalizes on completion, client save is safe.
					await send({
						clientUuid: assistantClientUuid,
						threadId,
						role: "assistant",
						content: accumulated,
						reasoning: reasoningAccumulated.trim() || undefined,
						userId: currentUserId ?? undefined,
					});
				}
				void setThreadStreaming({ threadId, isLive: false });
				setStreamingText("");
				setStreamingReasoning("");
			} catch (e) {
				console.error(e);
				setStreamingText("");
				setStreamingReasoning("");
			} finally {
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
			setBusy,
			setInput,
			isOwner,
			currentUserId,
			setThreadStreaming,
			pendingInitialMessage,
			setPendingInitialMessage,
		],
	);
	const autoSentRef = React.useRef(false);
	const resumedRef = React.useRef(false);
	React.useEffect(() => {
		if (
			pendingAutoSend &&
			isOwner &&
			messages !== undefined &&
			!autoSentRef.current
		) {
			autoSentRef.current = true;
			setPendingAutoSend(false);
			void handleSubmit(undefined, false);
		}
	}, [pendingAutoSend, isOwner, messages, handleSubmit, setPendingAutoSend]);

	// Resume an in-flight stream after a reconnect/reload.
	React.useEffect(() => {
		if (!thread?.isLive || !thread.currentStreamId || resumedRef.current)
			return;
		if (busy || sendingRef.current) return;
		resumedRef.current = true;
		setStreamingText("");
		setStreamingReasoning("");
		setThinkingOpen(false);
		(async () => {
			const assistantClientUuid = `${thread.currentStreamId}:assistant`;
			try {
				const params = new URLSearchParams({
					threadId,
					...(currentUserId ? { userId: currentUserId } : {}),
				});
				const res = await fetch(
					`/api/chat/${thread.currentStreamId}/stream?${params.toString()}`,
				);
				if (res.status === 204) {
					void setThreadStreaming({ threadId, isLive: false });
					return;
				}
				if (!res.ok || !res.body) {
					void setThreadStreaming({ threadId, isLive: false });
					return;
				}
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let accumulated = "";
				let reasoningAccumulated = "";
				let buffer = "";
				const applyEvent = (line: string) => {
					if (!line.trim()) return;
					try {
						const evt = JSON.parse(line) as { t?: string; d?: string };
						if (evt.t === "r" && evt.d) {
							reasoningAccumulated += evt.d;
							setStreamingReasoning(reasoningAccumulated);
						} else if (evt.t === "t" && evt.d) {
							accumulated += evt.d;
							setStreamingText(accumulated);
						}
					} catch {
						accumulated += line;
						setStreamingText(accumulated);
					}
				};
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) applyEvent(line);
				}
				if (buffer) applyEvent(buffer);

				if (accumulated.trim() || reasoningAccumulated.trim()) {
					await send({
						clientUuid: assistantClientUuid,
						threadId,
						role: "assistant",
						content: accumulated,
						reasoning: reasoningAccumulated.trim() || undefined,
						userId: currentUserId ?? undefined,
					});
				}
				void setThreadStreaming({ threadId, isLive: false });
				setStreamingText("");
				setStreamingReasoning("");
			} catch (e) {
				console.error(e);
				void setThreadStreaming({ threadId, isLive: false });
			}
		})();
	}, [
		thread?.isLive,
		thread?.currentStreamId,
		busy,
		threadId,
		send,
		currentUserId,
		setThreadStreaming,
	]);

	// Scrolling/follow behavior is handled by MessageScroller (autoScroll + defaultScrollPosition).

	if (isPending || currentUserId === null || thread === undefined) {
		return (
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				Loading…
			</div>
		);
	}
	if (!thread || !canView) {
		return (
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				This thread is private.
			</div>
		);
	}

	const displayMessages = (() => {
		const source = (messages ?? cachedMessages ?? []) as Array<{
			_id: string;
			role: string;
			content: string;
			reasoning?: string;
		}>;
		const list = [...source] as Array<{
			_id: string;
			role: string;
			content: string;
			reasoning?: string;
			_optimistic?: boolean;
		}>;
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
	})();

	const isStreaming = Boolean(
		(busy || pendingAutoSend) && (streamingReasoning || streamingText),
	);
	const isThinkingOnly = Boolean(
		(busy || pendingAutoSend) && !streamingText && !streamingReasoning,
	);

	return (
		<div className="relative flex-1 min-h-0">
			<MessageScrollerProvider autoScroll defaultScrollPosition="end">
				<MessageScroller className="absolute inset-0">
					<MessageScrollerViewport className="px-4 py-6 pb-36">
						<MessageScrollerContent className="mx-auto w-full max-w-3xl gap-6">
							{displayMessages.map(
								(m: {
									_id: string;
									role: string;
									content: string;
									reasoning?: string;
									_optimistic?: boolean;
								}) => {
									const isUser = m.role === "user";
									const isAssistant = m.role === "assistant";
									const isEditing = editingId === m._id;
									const isThinkingOpen = Boolean(openThinkingIds[m._id]);
									const isCopied = copiedId === m._id;
									return (
										<MessageScrollerItem
											key={m._id}
											messageId={m._id}
											scrollAnchor={isUser}
											className={cn(
												"flex w-full",
												isUser ? "justify-end" : "justify-start",
											)}
										>
											<Message
												align={isUser ? "end" : "start"}
												className={cn(
													isUser
														? "w-fit max-w-[85%] flex-col items-end gap-1 sm:max-w-[75%]"
														: "w-full max-w-none flex-col items-start gap-1",
												)}
											>
												{isUser && isEditing ? (
													<div className="flex w-full flex-col gap-2">
														<textarea
															value={editingText}
															onChange={(e) => setEditingText(e.target.value)}
															className="min-h-10 w-full resize-none rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none"
														/>
														<div className="flex justify-end gap-2">
															<Button
																type="button"
																size="xs"
																variant="ghost"
																onClick={() => {
																	setEditingId(null);
																	setEditingText("");
																}}
															>
																Cancel
															</Button>
															<Button
																type="button"
																size="xs"
																onClick={async () => {
																	if (!editingText.trim()) return;
																	await updateMessage({
																		messageId: m._id as Id<"messages">,
																		content: editingText.trim(),
																	});
																	setEditingId(null);
																	setEditingText("");
																}}
															>
																Save
															</Button>
														</div>
													</div>
												) : (
													<>
														<MessageContent
															className={
																isUser
																	? "select-text rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap"
																	: "select-text w-full text-sm"
															}
														>
															{isAssistant && m.reasoning ? (
																<div className="mb-2 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
																	<button
																		type="button"
																		className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
																		onClick={() => toggleThinking(m._id)}
																		aria-expanded={isThinkingOpen}
																	>
																		{isThinkingOpen ? (
																			<ChevronDownIcon className="size-3.5" />
																		) : (
																			<ChevronRightIcon className="size-3.5" />
																		)}
																		<span>Thinking</span>
																	</button>
																	{isThinkingOpen ? (
																		<div className="max-h-48 overflow-y-auto border-t border-border/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
																			{m.reasoning}
																		</div>
																	) : null}
																</div>
															) : null}
															{isAssistant ? (
																<Streamdown
																	plugins={{ code, math }}
																	mode="static"
																	codeBlockMaxHeight={0}
																	className="max-w-none w-full"
																>
																	{m.content}
																</Streamdown>
															) : (
																m.content
															)}
														</MessageContent>
														<div
															className={cn(
																"mt-1 flex items-center gap-1 transition-all duration-200",
																isUser
																	? "justify-end opacity-0 group-hover/message:opacity-100 focus-within:opacity-100"
																	: "justify-start",
															)}
														>
															{isUser && !m._optimistic ? (
																<>
																	<Button
																		type="button"
																		size="icon-xs"
																		variant="ghost"
																		aria-label="Retry"
																		className="text-muted-foreground hover:text-foreground"
																		onClick={() => void handleSubmit(m.content)}
																	>
																		<RotateCcwIcon className="size-3" />
																	</Button>
																	<Button
																		type="button"
																		size="icon-xs"
																		variant="ghost"
																		aria-label="Edit"
																		className="text-muted-foreground hover:text-foreground"
																		onClick={() => {
																			setEditingId(m._id);
																			setEditingText(m.content);
																		}}
																	>
																		<PencilIcon className="size-3" />
																	</Button>
																</>
															) : null}
															{(m.content || "").trim() ? (
																<Button
																	type="button"
																	size="icon-xs"
																	variant="ghost"
																	aria-label={isCopied ? "Copied" : "Copy"}
																	className={cn(
																		"text-muted-foreground transition-all duration-200 hover:text-foreground",
																		isCopied && "scale-110 text-foreground",
																	)}
																	onClick={() =>
																		void copyText(m._id, m.content)
																	}
																>
																	{isCopied ? (
																		<CheckIcon className="size-3" />
																	) : (
																		<CopyIcon className="size-3" />
																	)}
																</Button>
															) : null}
														</div>
													</>
												)}
											</Message>
										</MessageScrollerItem>
									);
								},
							)}
							{isStreaming ? (
								<MessageScrollerItem
									messageId="__streaming__"
									className="flex w-full justify-start"
								>
									<Message
										align="start"
										className="w-full max-w-none flex-col items-start gap-1"
									>
										<MessageContent className="select-text w-full text-sm">
											{streamingReasoning ? (
												<div className="mb-2 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
													<button
														type="button"
														className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
														onClick={() => setThinkingOpen((v) => !v)}
														aria-expanded={thinkingOpen}
													>
														{thinkingOpen ? (
															<ChevronDownIcon className="size-3.5" />
														) : (
															<ChevronRightIcon className="size-3.5" />
														)}
														<span>Thinking</span>
														{!streamingText ? (
															<span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70" />
														) : null}
													</button>
													{thinkingOpen ? (
														<div className="max-h-48 overflow-y-auto border-t border-border/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
															{streamingReasoning}
														</div>
													) : null}
												</div>
											) : null}
											{streamingText ? (
												<Streamdown
													plugins={{ code, math }}
													mode="static"
													codeBlockMaxHeight={0}
													className="max-w-none w-full"
												>
													{streamingText}
												</Streamdown>
											) : null}
										</MessageContent>
									</Message>
								</MessageScrollerItem>
							) : null}
							{isThinkingOnly ? (
								<MessageScrollerItem
									messageId="__thinking__"
									className="flex w-full justify-start"
								>
									<div className="text-xs text-muted-foreground">Thinking…</div>
								</MessageScrollerItem>
							) : null}
						</MessageScrollerContent>
					</MessageScrollerViewport>
					<MessageScrollerButton />
				</MessageScroller>
			</MessageScrollerProvider>
			<div className="absolute -bottom-5 left-0 right-0 w-full px-4 py-4 bg-transparent z-30">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
					{isOwner ? (
						<ChatInput
							value={input}
							onChange={setInput}
							onSubmit={() => void handleSubmit()}
							disabled={busy}
							model={selectedModel}
							onModelChange={setSelectedModel}
						/>
					) : (
						<div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
							This is a shared thread. You can view it, but only the owner can
							chat.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
