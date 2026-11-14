import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { CopyIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import * as React from "react";
import { Streamdown } from "streamdown";
import { ChatInput } from "#/components/chat/chat-input";
import { Markdown } from "#/components/markdown";
import { Button } from "#/components/ui/button";
import { Message, MessageContent } from "#/components/ui/message";
import { useSession } from "#/hooks/auth-hooks";

import { getCurrentUserId } from "#/lib/user-id";
import { useChatStore } from "#/store/chat-store";
import { useModelStore } from "#/store/model-store";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/_chat/thread/$threadId")({
	component: RouteComponent,
});

function RouteComponent() {
	const { threadId: rawThreadId } = Route.useParams();
	const threadId = rawThreadId as Id<"threads">;

	const { user, isPending } = useSession();
	const currentUserId = isPending ? null : (user?.id ?? getCurrentUserId(null));

	const thread = useQuery(api.threads.getThread, {
		threadId,
		userId: currentUserId ?? undefined,
	});
	const canView =
		!!thread &&
		!!currentUserId &&
		(thread.userId === currentUserId || !!thread.isPublic);
	const messages = useQuery(
		api.messages.getMessages,
		canView ? { threadId, userId: currentUserId ?? undefined } : "skip",
	);

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
	const isOwner =
		!!thread && !!currentUserId && thread.userId === currentUserId;

	const [editingId, setEditingId] = React.useState<string | null>(null);
	const [editingText, setEditingText] = React.useState("");

	const scrollRef = React.useRef<HTMLDivElement>(null);
	const sendingRef = React.useRef(false);
	const userAtBottomRef = React.useRef(true);
	const [atBottom, setAtBottom] = React.useState(true);

	const handleScroll = React.useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
		const bottom = distance < 80;
		userAtBottomRef.current = bottom;
		setAtBottom(bottom);
	}, []);

	React.useEffect(() => {
		setThreadId(threadId);
	}, [threadId, setThreadId]);

	const scrollToBottom = React.useCallback((smooth = true) => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
	}, []);

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

				const baseHistory = (messages ?? []).map(
					(m: { role: string; content: string }) => ({
						role: m.role as "user" | "assistant" | "system",
						content: m.content,
					}),
				);
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
				void setThreadStreaming({
					threadId,
					isLive: true,
					streamId,
				});

				setStreamingText("");

				const res = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						messages: history,
						model: selectedModel,
						streamId,
					}),
				});

				if (!res.ok || !res.body) {
					throw new Error(`Chat request failed: ${res.status}`);
				}

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let accumulated = "";
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					accumulated += decoder.decode(value, { stream: true });
					setStreamingText(accumulated);
				}

				setStreamingText("");
				if (accumulated.trim()) {
					await send({
						clientUuid: crypto.randomUUID(),
						threadId,
						role: "assistant",
						content: accumulated,
						userId: currentUserId ?? undefined,
					});
				}
				void setThreadStreaming({ threadId, isLive: false });
			} catch (e) {
				console.error(e);
				setStreamingText("");
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
		(async () => {
			try {
				const res = await fetch(`/api/chat/${thread.currentStreamId}/stream`);
				if (!res.ok || !res.body) {
					void setThreadStreaming({ threadId, isLive: false });
					return;
				}
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let accumulated = "";
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					accumulated += decoder.decode(value, { stream: true });
					setStreamingText(accumulated);
				}
				setStreamingText("");
				if (accumulated.trim()) {
					await send({
						clientUuid: crypto.randomUUID(),
						threadId,
						role: "assistant",
						content: accumulated,
						userId: currentUserId ?? undefined,
					});
				}
				void setThreadStreaming({ threadId, isLive: false });
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

	// Auto-scroll while streaming if user is at bottom.
	React.useEffect(() => {
		if (streamingText && userAtBottomRef.current) {
			scrollToBottom(false);
		}
	}, [streamingText, scrollToBottom]);

	// Scroll to bottom when new messages arrive if at bottom.
	// biome-ignore lint/correctness/useExhaustiveDependencies: trigger on messages change
	React.useEffect(() => {
		if (userAtBottomRef.current) {
			scrollToBottom(false);
		}
	}, [messages, scrollToBottom]);

	React.useEffect(() => {
		handleScroll();
	}, [handleScroll]);

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

	return (
		<div className="relative flex flex-1 flex-col">
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="flex-1 overflow-y-auto px-4 py-6"
			>
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
					{(() => {
						const list = [...(messages ?? [])] as Array<{
							_id: string;
							role: string;
							content: string;
							_optimistic?: boolean;
						}>;
						if (
							pendingInitialMessage &&
							!list.some(
								(m) =>
									m.role === "user" && m.content === pendingInitialMessage,
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
					})().map(
						(m: {
							_id: string;
							role: string;
							content: string;
							_optimistic?: boolean;
						}) => {
							const isUser = m.role === "user";
							const isEditing = editingId === m._id;
							return (
								<Message
									key={m._id}
									align={isUser ? "end" : "start"}
									className={
										isUser
											? "w-fit max-w-[75%] self-end flex-col items-end gap-1"
											: "w-full self-start"
									}
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
										<MessageContent
											className={
												isUser
													? "select-text rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground"
													: "select-text w-full text-sm"
											}
										>
											{m.role === "assistant" ? (
												<Markdown
													content={m.content}
													className="max-w-none w-full"
												/>
											) : (
												m.content
											)}
										</MessageContent>
									)}
									{isUser && !isEditing && (
										<div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100">
											<Button
												type="button"
												size="icon-xs"
												variant="ghost"
												aria-label="Retry"
												onClick={() => void handleSubmit(m.content)}
											>
												<RotateCcwIcon className="size-3" />
											</Button>
											<Button
												type="button"
												size="icon-xs"
												variant="ghost"
												aria-label="Edit"
												onClick={() => {
													setEditingId(m._id);
													setEditingText(m.content);
												}}
											>
												<PencilIcon className="size-3" />
											</Button>
											<Button
												type="button"
												size="icon-xs"
												variant="ghost"
												aria-label="Copy"
												onClick={() => {
													void navigator.clipboard.writeText(m.content);
												}}
											>
												<CopyIcon className="size-3" />
											</Button>
										</div>
									)}
								</Message>
							);
						},
					)}
					{busy && streamingText && (
						<Message align="start" className="w-full self-start">
							<MessageContent className="select-text w-full text-sm">
								<Streamdown
									plugins={{ code, math }}
									mode="static"
									className="max-w-none w-full"
								>
									{streamingText}
								</Streamdown>
							</MessageContent>
						</Message>
					)}
					{(busy || pendingAutoSend) && !streamingText && (
						<div className="self-start text-xs text-muted-foreground">
							Thinking…
						</div>
					)}
				</div>
			</div>
			{!atBottom && (
				<div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center">
					<Button
						type="button"
						size="xs"
						variant="secondary"
						className="pointer-events-auto text-xs"
						onClick={() => scrollToBottom(true)}
					>
						Scroll to bottom
					</Button>
				</div>
			)}
			<div className="sticky bottom-0 z-20 w-full px-4 pb-4">
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
