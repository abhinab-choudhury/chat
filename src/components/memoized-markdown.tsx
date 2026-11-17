import { math } from "@streamdown/math";
import type * as React from "react";
import { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import "katex/dist/katex.min.css";
import {
	CodeBlock,
	CodeBlockActions,
	CodeBlockContent,
	CodeBlockCopyButton,
	CodeBlockHeader,
	CodeBlockLine,
	CodeBlockTitle,
} from "#/components/ui/code-block";
import { useHighlightedCode } from "#/hooks/use-highlighted-code";
import { prepareMathMarkdown } from "#/lib/math-markdown";

const plugins = { math };

// Mounted only for fenced code blocks so the highlighting hook is not used
// for inline code.
function MarkdownCodeBlock({
	text,
	language,
}: {
	text: string;
	language: string;
}) {
	const lines = useHighlightedCode(text, language);

	return (
		<CodeBlock className="my-3">
			<CodeBlockHeader>
				<CodeBlockTitle>
					<span className="text-xs font-medium">{language}</span>
				</CodeBlockTitle>
				<CodeBlockActions>
					<CodeBlockCopyButton value={text} />
				</CodeBlockActions>
			</CodeBlockHeader>
			<CodeBlockContent wrap lineNumbers>
				{lines.map((line, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: code lines are positional and static
					<CodeBlockLine key={index}>{line}</CodeBlockLine>
				))}
			</CodeBlockContent>
		</CodeBlock>
	);
}

function MarkdownCode({
	className,
	children,
	"data-block": isFencedBlock,
	node: _node,
	...props
}: React.ComponentProps<"code"> & { "data-block"?: string; node?: unknown }) {
	const match = /language-(\w+)/.exec(className || "");
	const text = String(children).replace(/\n$/, "");
	const isBlock = isFencedBlock || Boolean(match) || text.includes("\n");

	if (!isBlock) {
		return (
			<code
				className="rounded-md border border-border/40 bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em]"
				{...props}
			>
				{children}
			</code>
		);
	}

	return <MarkdownCodeBlock text={text} language={match?.[1] ?? "code"} />;
}

const components = {
	code: MarkdownCode,
};

export const MemoizedMarkdown = memo(
	({
		content,
		isStreaming = false,
	}: {
		content: string;
		id: string;
		isStreaming?: boolean;
	}) => {
		const markdown = useMemo(
			() => prepareMathMarkdown(content, isStreaming),
			[content, isStreaming],
		);
		return (
			<Streamdown
				className="chat-markdown min-w-0"
				plugins={plugins}
				components={components}
				mode={isStreaming ? "streaming" : "static"}
				isAnimating={isStreaming}
				parseIncompleteMarkdown={isStreaming}
			>
				{markdown}
			</Streamdown>
		);
	},
);
MemoizedMarkdown.displayName = "MemoizedMarkdown";
