import { createFileRoute } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import * as React from "react";
import { ChatMessageItem } from "#/components/chat/chat-message";
import { ChatInput } from "#/components/chat/chat-input";
import { StreamingMessage } from "#/components/chat/streaming-message";
import { RouteErrorComponent } from "#/components/route-error";
import { Button } from "#/components/ui/button";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import { useThreadChat } from "#/hooks/use-thread-chat";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/_chat/thread/$threadId")({
	// SSR-friendly route boundary: validates params and enables streamed shell rendering.
	// Authenticated Convex data is reconciled client-side via reactive queries; public
	// prefetch/SSR can be layered here with server-side Convex fetching when safe.
	loader: async ({ params }) => {
		return { threadId: params.threadId };
	},
	component: RouteComponent,
	errorComponent: RouteErrorComponent,
});

function RouteComponent() {
	const { threadId: rawThreadId } = Route.useParams();
	const threadId = rawThreadId as Id<"threads">;

	const chat = useThreadChat(threadId);
	const {
		isPending,
		currentUserId,
		thread,
		canView,
		isOwner,
		displayMessages,
		input,
		setInput,
		busy,
		pendingAutoSend,
		streamingText,
		streamingReasoning,
		streamingToolCalls,
		selectedModel,
		setSelectedModel,
		handleSubmit,
	} = chat;

	const viewportRef = React.useRef<HTMLDivElement>(null);
	const [showScrollButton, setShowScrollButton] = React.useState(false);

	React.useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;
		const check = () => {
			const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 96;
			setShowScrollButton(!atBottom);
		};
		el.addEventListener("scroll", check, { passive: true });
		check();
		return () => el.removeEventListener("scroll", check);
	}, [displayMessages]);

	if (isPending) {
		return (
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				Loading…
			</div>
		);
	}

	if (currentUserId === null) {
		return (
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				Please sign in to view this thread.
			</div>
		);
	}

	if (thread === undefined) {
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

	const isStreaming = Boolean(
		(busy || pendingAutoSend) &&
			(streamingReasoning || streamingText || streamingToolCalls.length > 0),
	);
	const isThinkingOnly = Boolean(
		(busy || pendingAutoSend) &&
			!streamingText &&
			!streamingReasoning &&
			streamingToolCalls.length === 0,
	);

	return (
		<div className="relative flex-1 min-h-0">
			<MessageScrollerProvider autoScroll defaultScrollPosition="end">
				<MessageScroller className="absolute inset-0">
					<MessageScrollerViewport ref={viewportRef} className="px-4 py-6 pb-36">
						<MessageScrollerContent className="mx-auto w-full max-w-3xl gap-6">
							{displayMessages.map((m) => (
								<ChatMessageItem
									key={m._id}
									message={m}
									onRetry={(content) => void handleSubmit(content)}
								/>
							))}
							{isStreaming ? (
								<StreamingMessage
									streamingText={streamingText}
									streamingReasoning={streamingReasoning}
									streamingToolCalls={streamingToolCalls}
								/>
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
					{showScrollButton ? (
						<div className="flex justify-end">
							<Button
								type="button"
								variant="secondary"
								size="sm"
								className="rounded-full shadow-md"
								onClick={() => {
									const el = viewportRef.current;
									if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
								}}
							>
								<ChevronDownIcon className="size-4" />
								Scroll to bottom
							</Button>
						</div>
					) : null}
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
