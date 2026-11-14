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
import { MemoizedMarkdown } from "#/components/memoized-markdown";
import { assistantProseClass } from "#/components/chat/prose";
import type { ChatMessage } from "#/hooks/use-thread-chat";
import { cn } from "#/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { Message, MessageContent } from "#/components/ui/message";
import { MessageScrollerItem } from "#/components/ui/message-scroller";

interface ChatMessageItemProps {
	message: ChatMessage;
	/** Called with the message content when the user hits retry. */
	onRetry: (content: string) => void;
}

/**
 * A single persisted message bubble: content, thinking block, hover actions
 * (retry / edit / copy) and inline editing. All transient UI state (editing,
 * copy feedback, thinking expansion) is local to this item.
 */
export function ChatMessageItem({ message, onRetry }: ChatMessageItemProps) {
	const updateMessage = useMutation(api.messages.updateMessage);

	const isUser = message.role === "user";
	const isAssistant = message.role === "assistant";
	const optimistic = Boolean(message._optimistic);

	const [editing, setEditing] = React.useState(false);
	const [editingText, setEditingText] = React.useState("");
	const [thinkingOpen, setThinkingOpen] = React.useState(false);
	const [copied, setCopied] = React.useState(false);

	const copyText = React.useCallback(async () => {
		try {
			await navigator.clipboard.writeText(message.content);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1200);
		} catch (e) {
			console.error(e);
		}
	}, [message.content]);

	const saveEdit = async () => {
		const trimmed = editingText.trim();
		if (!trimmed) return;
		await updateMessage({
			messageId: message._id as Id<"messages">,
			content: trimmed,
		});
		setEditing(false);
		setEditingText("");
	};

	return (
		<MessageScrollerItem
			messageId={message._id}
			scrollAnchor={isUser}
			className={cn(
				"group/message flex w-full",
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
				{isUser && editing ? (
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
									setEditing(false);
									setEditingText("");
								}}
							>
								Cancel
							</Button>
							<Button type="button" size="xs" onClick={() => void saveEdit()}>
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
							{isAssistant && message.reasoning ? (
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
									</button>
									{thinkingOpen ? (
										<div className="max-h-48 overflow-y-auto border-t border-border/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
											{message.reasoning}
										</div>
									) : null}
								</div>
							) : null}
							{isAssistant ? (
								<div className={assistantProseClass}>
									<MemoizedMarkdown
										content={message.content}
										id={message._id}
									/>
								</div>
							) : (
								message.content
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
							{isUser && !optimistic ? (
								<>
									<Button
										type="button"
										size="icon-xs"
										variant="ghost"
										aria-label="Retry"
										className="text-muted-foreground hover:text-foreground"
										onClick={() => onRetry(message.content)}
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
											setEditing(true);
											setEditingText(message.content);
										}}
									>
										<PencilIcon className="size-3" />
									</Button>
								</>
							) : null}
							{(message.content || "").trim() ? (
								<Button
									type="button"
									size="icon-xs"
									variant="ghost"
									aria-label={copied ? "Copied" : "Copy"}
									className={cn(
										"text-muted-foreground transition-all duration-200 hover:text-foreground",
										copied && "scale-110 text-foreground",
									)}
									onClick={() => void copyText()}
								>
									{copied ? (
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
}
