import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, ChevronDownIcon } from "lucide-react";
import * as React from "react";
import { ChatInput } from "#/components/chat/chat-input";
import { ChatMessageItem } from "#/components/chat/chat-message";
import { StreamingMessage } from "#/components/chat/streaming-message";
import { RouteErrorComponent } from "#/components/route-error";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
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
import { agentPhases } from "#/lib/agent/progress";

export const Route = createFileRoute("/_chat/thread/$threadId")({
	loader: async ({ params }) => {
		return { threadId: params.threadId };
	},
	component: RouteComponent,
	errorComponent: RouteErrorComponent,
});

function RouteComponent() {
	const { threadId: rawThreadId } = Route.useParams();
	const threadId = rawThreadId as string;

	const chat = useThreadChat(threadId);
	const {
		thread,
		canView,
		isOwner,
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
		selectedModel,
		setSelectedModel,
		handleSubmit,
	} = chat;

	const viewportRef = React.useRef<HTMLDivElement>(null);
	const followStreamRef = React.useRef(true);
	const [showScrollButton, setShowScrollButton] = React.useState(false);

	React.useEffect(() => {
		if (!canView) return;
		const el = viewportRef.current;
		if (!el) return;
		const check = () => {
			const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 96;
			setShowScrollButton(!atBottom);
		};
		const onScroll = () => {
			followStreamRef.current =
				el.scrollTop + el.clientHeight >= el.scrollHeight - 96;
			check();
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		check();
		const observer = new ResizeObserver(check);
		observer.observe(el);
		if (el.firstElementChild) observer.observe(el.firstElementChild);
		return () => {
			observer.disconnect();
			el.removeEventListener("scroll", onScroll);
		};
	}, [canView]);

	React.useEffect(() => {
		if (!followStreamRef.current) return;
		const frame = requestAnimationFrame(() => {
			const viewport = viewportRef.current;
			if (viewport && followStreamRef.current)
				viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
		});
		return () => cancelAnimationFrame(frame);
	}, [streamingText, streamingReasoning]);

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
		streamingReasoning || streamingText || streamingToolCalls.length > 0,
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
					<MessageScrollerViewport
						ref={viewportRef}
						className="px-4 py-6 pb-36"
					>
						<MessageScrollerContent className="mx-auto w-full max-w-3xl gap-6">
							{chatError ? (
								<Alert variant="destructive">
									<AlertCircle aria-hidden="true" />
									<AlertTitle>Response could not be completed</AlertTitle>
									<AlertDescription>
										<p className="break-words">{chatError}</p>
									</AlertDescription>
								</Alert>
							) : null}
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
									status={agentPhases[agentPhase]}
									streamingReasoning={streamingReasoning}
									streamingToolCalls={streamingToolCalls}
								/>
							) : null}
							{isThinkingOnly ? (
								<MessageScrollerItem
									messageId="__thinking__"
									className="flex w-full justify-start"
								>
									<output
										className="text-xs text-muted-foreground"
										aria-live="polite"
									>
										<span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-primary" />
										{agentPhases[agentPhase]}
									</output>
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
									if (el)
										el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
