import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";
import { assistantProseClass } from "#/components/chat/prose";
import { WebSearchResults } from "#/components/chat/web-search-results";
import { MemoizedMarkdown } from "#/components/memoized-markdown";
import { Message, MessageContent } from "#/components/ui/message";
import { MessageScrollerItem } from "#/components/ui/message-scroller";
import type { WebSearchToolCall } from "#/lib/search/types";

interface StreamingMessageProps {
	status?: string;
	streamingText: string;
	streamingReasoning: string;
	streamingToolCalls?: WebSearchToolCall[];
}

/**
 * The live, in-progress assistant bubble: streaming reasoning ("Thinking")
 * and streaming text with a blinking caret, plus live web-search activity.
 */
export function StreamingMessage({
	status,
	streamingText,
	streamingReasoning,
	streamingToolCalls,
}: StreamingMessageProps) {
	const [thinkingOpen, setThinkingOpen] = React.useState(true);

	return (
		<MessageScrollerItem
			messageId="__streaming__"
			className="flex w-full justify-start"
			style={{ contentVisibility: "visible", containIntrinsicSize: "none" }}
		>
			<Message
				align="start"
				className="w-full max-w-none flex-col items-start gap-1"
			>
				<MessageContent className="select-text w-full text-sm">
					{status && !streamingText ? (
						<output
							aria-live="polite"
							className="mb-2 text-xs text-muted-foreground"
						>
							{status}
						</output>
					) : null}
					{(streamingToolCalls ?? []).map((call) => (
						<WebSearchResults key={call.id ?? call.query} call={call} />
					))}
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
								<div className="max-h-48 overflow-y-auto border-t border-border/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
									<MemoizedMarkdown
										content={streamingReasoning}
										id="__streaming_reasoning__"
										isStreaming={!streamingText}
									/>
								</div>
							) : null}
						</div>
					) : null}
					{streamingText ? (
						<div className={assistantProseClass}>
							<MemoizedMarkdown
								content={streamingText}
								id="__streaming__"
								isStreaming
							/>
							<span
								aria-hidden="true"
								className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse rounded-full bg-primary/70 align-baseline"
							/>
						</div>
					) : null}
				</MessageContent>
			</Message>
		</MessageScrollerItem>
	);
}
