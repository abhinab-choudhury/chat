import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";
import { MemoizedMarkdown } from "#/components/memoized-markdown";
import { assistantProseClass } from "#/components/chat/prose";
import { Message, MessageContent } from "#/components/ui/message";
import { MessageScrollerItem } from "#/components/ui/message-scroller";

interface StreamingMessageProps {
	streamingText: string;
	streamingReasoning: string;
}

/**
 * The live, in-progress assistant bubble: streaming reasoning ("Thinking")
 * and streaming text with a blinking caret.
 */
export function StreamingMessage({
	streamingText,
	streamingReasoning,
}: StreamingMessageProps) {
	const [thinkingOpen, setThinkingOpen] = React.useState(false);

	return (
		<MessageScrollerItem
			messageId="__streaming__"
			className="flex w-full justify-start"
		>
			<Message align="start" className="w-full max-w-none flex-col items-start gap-1">
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
						<div className={assistantProseClass}>
							<MemoizedMarkdown content={streamingText} id="__streaming__" />
							<span
								aria-hidden="true"
								className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse rounded-full bg-primary/70 align-baseline"
							/>
						</div>
					) : null}
				</MessageContent>
			</Message>
		</MessageScrollerItem>
	);
}
