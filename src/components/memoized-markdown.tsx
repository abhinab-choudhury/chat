import type { Schema } from "hast-util-sanitize";
import { marked } from "marked";
import type * as React from "react";
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
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

const sanitizeSchema: Schema = {
	tagNames: [
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"p",
		"blockquote",
		"ul",
		"ol",
		"li",
		"strong",
		"em",
		"del",
		"code",
		"pre",
		"hr",
		"br",
		"a",
		"img",
		"table",
		"thead",
		"tbody",
		"tr",
		"th",
		"td",
		"span",
	],
	attributes: {
		"*": ["className", "id", "data-theme", "style"],
		a: ["href", "title", "target", "rel"],
		img: ["src", "alt", "title", "width", "height"],
		span: ["className", "style"],
	},
	protocols: { href: ["http", "https", "mailto"], src: ["http", "https"] },
};

function parseMarkdownIntoBlocks(markdown: string): string[] {
	const tokens = marked.lexer(markdown);
	return tokens.map((token) => token.raw);
}

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
	...props
}: React.ComponentProps<"code">) {
	const match = /language-(\w+)/.exec(className || "");
	const text = String(children).replace(/\n$/, "");
	const isBlock = Boolean(match) || text.includes("\n");

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

const MemoizedMarkdownBlock = memo(
	({ content }: { content: string }) => (
		<ReactMarkdown
			remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
			rehypePlugins={[
				[rehypeSanitize, sanitizeSchema],
				[rehypeKatex, { output: "html" }],
			]}
			components={{ code: MarkdownCode }}
		>
			{content}
		</ReactMarkdown>
	),
	(prev, next) => prev.content === next.content,
);

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

export const MemoizedMarkdown = memo(
	({ content, id }: { content: string; id: string }) => {
		const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);
		return (
			<>
				{blocks.map((block, index) => (
					<MemoizedMarkdownBlock content={block} key={`${id}-block_${index}`} />
				))}
			</>
		);
	},
);

MemoizedMarkdown.displayName = "MemoizedMarkdown";
