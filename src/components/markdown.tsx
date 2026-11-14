import { FileCodeIcon } from "lucide-react";
import mermaid from "mermaid";
import { useTheme } from "next-themes";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

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

import "katex/dist/katex.min.css";

interface MarkdownProps {
	content: string;
	className?: string;
}

function MermaidBlock({ code }: { code: string }) {
	const { resolvedTheme } = useTheme();
	const ref = React.useRef<HTMLDivElement>(null);
	const [svg, setSvg] = React.useState<string>("");
	React.useEffect(() => {
		let cancelled = false;
		const id = `mermaid-${Math.random().toString(36).slice(2)}`;
		const theme = resolvedTheme === "dark" ? "dark" : "default";
		mermaid.initialize({ startOnLoad: false, theme });
		mermaid
			.render(id, code)
			.then(({ svg }) => {
				if (!cancelled) setSvg(svg);
			})
			.catch(() => {
				if (!cancelled) setSvg(`<pre>${code}</pre>`);
			});
		return () => {
			cancelled = true;
		};
	}, [code, resolvedTheme]);
	return (
		<div
			ref={ref}
			className="my-2 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid output
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}

function MarkdownCodeBlock({
	code,
	language,
}: {
	code: string;
	language?: string;
}) {
	const lang = language || "text";
	const lines = useHighlightedCode(code, lang);

	return (
		<CodeBlock className="my-2">
			<CodeBlockHeader>
				<CodeBlockTitle>
					<FileCodeIcon className="size-4 text-muted-foreground" />
					<span className="truncate">{lang}</span>
				</CodeBlockTitle>
				<CodeBlockActions>
					<CodeBlockCopyButton value={code} />
				</CodeBlockActions>
			</CodeBlockHeader>
			<CodeBlockContent lineNumbers>
				{lines.map((line, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: code lines are positional and static
					<CodeBlockLine key={index}>{line}</CodeBlockLine>
				))}
			</CodeBlockContent>
		</CodeBlock>
	);
}

export function Markdown({ content, className }: MarkdownProps) {
	return (
		<div
			className={
				"prose prose-sm dark:prose-invert max-w-none " +
				"prose-headings:font-semibold prose-headings:tracking-tight " +
				"prose-p:leading-relaxed prose-p:my-2 " +
				"prose-pre:my-0 prose-pre:rounded-lg prose-pre:border-0 " +
				"prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none " +
				"prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 " +
				"prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-4 prose-blockquote:italic " +
				"prose-table:my-3 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 " +
				(className ?? "")
			}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkMath]}
				rehypePlugins={[rehypeRaw, rehypeKatex]}
				components={{
					pre({ children }) {
						const arr = React.Children.toArray(children);
						const codeEl = arr.find(
							(
								child,
							): child is React.ReactElement<{
								className?: string;
								children?: React.ReactNode;
							}> => {
								if (!React.isValidElement(child)) return false;
								if (child.type === "code") return true;
								const props = child.props as { className?: string };
								return (
									typeof props.className === "string" &&
									props.className.includes("language-")
								);
							},
						);
						if (!codeEl) {
							return <pre>{children}</pre>;
						}
						const className = codeEl.props.className || "";
						const match = /language-(\w+)/.exec(className);
						const code = String(codeEl.props.children ?? "").replace(/\n$/, "");
						if (match?.[1] === "mermaid") {
							return <MermaidBlock code={code} />;
						}
						return <MarkdownCodeBlock language={match?.[1]} code={code} />;
					},
					code({ className, children, ...props }) {
						return (
							<code className={className} {...props}>
								{children}
							</code>
						);
					},
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
