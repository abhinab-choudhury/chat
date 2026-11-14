import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, CopyIcon } from "lucide-react";
import * as React from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

const codeBlockVariants = cva(
	"group/code-block relative w-full overflow-hidden rounded-xl border text-foreground shadow-xs",
	{
		variants: {
			variant: {
				default:
					"border-border/50 bg-muted/40 dark:border-transparent dark:bg-card/60",
				destructive:
					"border-destructive/30 bg-destructive/5 text-foreground dark:bg-destructive/10",
			},
			size: {
				default: "text-sm",
				sm: "text-xs",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function CodeBlock({
	className,
	variant = "default",
	size = "default",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof codeBlockVariants>) {
	return (
		<div
			data-slot="code-block"
			data-variant={variant}
			data-size={size}
			className={cn(codeBlockVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

function CodeBlockHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="code-block-header"
			className={cn(
				"flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2 text-muted-foreground backdrop-blur-[1px] dark:bg-muted/20",
				"**:data-[slot=code-block-title]:min-w-0 **:data-[slot=code-block-title]:flex-1",
				className,
			)}
			{...props}
		/>
	);
}

function CodeBlockTitle({
	className,
	children,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="code-block-title"
			className={cn("flex min-w-0 items-center gap-2 truncate", className)}
			{...props}
		>
			{children}
		</div>
	);
}

function CodeBlockActions({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="code-block-actions"
			className={cn(
				"ml-auto flex shrink-0 items-center gap-1",
				"group-has-[>[data-slot=code-block-header]]/code-block:static",
				"group-not-has-[>[data-slot=code-block-header]]/code-block:absolute group-not-has-[>[data-slot=code-block-header]]/code-block:right-2 group-not-has-[>[data-slot=code-block-header]]/code-block:top-2 group-not-has-[>[data-slot=code-block-header]]/code-block:z-10",
				"group-not-has-[>[data-slot=code-block-header]]/code-block:opacity-0 group-not-has-[>[data-slot=code-block-header]]/code-block:transition-opacity",
				"group-hover/code-block:opacity-100 group-focus-within/code-block:opacity-100 [@media(hover:none)]:opacity-100",
				className,
			)}
			{...props}
		/>
	);
}

function CodeBlockCopyButton({
	value,
	className,
	onCopy,
	...props
}: Omit<React.ComponentProps<typeof Button>, "children"> & {
	value: string;
	onCopy?: () => void;
}) {
	const [copied, setCopied] = React.useState(false);

	const handleCopy = React.useCallback(async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			onCopy?.();
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			// ignore clipboard errors
		}
	}, [onCopy, value]);

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label={copied ? "Copied" : "Copy"}
			className={cn("text-muted-foreground", className)}
			onClick={handleCopy}
			{...props}
		>
			{copied ? (
				<CheckIcon className="size-3.5" />
			) : (
				<CopyIcon className="size-3.5" />
			)}
			<span className="sr-only" aria-live="polite">
				{copied ? "Copied" : "Copy"}
			</span>
		</Button>
	);
}

type CodeBlockContentProps = Omit<React.ComponentProps<"pre">, "children"> & {
	children: React.ReactNode;
	wrap?: boolean;
	lineNumbers?: boolean;
	startLine?: number;
	tabIndex?: number;
};

function splitLines(value: string) {
	const lines = value.split("\n");
	if (lines.length > 1 && lines[lines.length - 1] === "") {
		lines.pop();
	}
	return lines;
}

function CodeBlockContent({
	children,
	className,
	wrap = false,
	lineNumbers = false,
	startLine = 1,
	tabIndex = 0,
	...props
}: CodeBlockContentProps) {
	const content = React.useMemo(() => {
		if (typeof children === "string") {
			const lines = splitLines(children);
			return lines.map((line, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: code lines are positional and static
				<CodeBlockLine key={index}>{line.length ? line : " "}</CodeBlockLine>
			));
		}
		if (Array.isArray(children)) {
			return children;
		}
		return children;
	}, [children]);

	const lineArray = React.Children.toArray(content);
	const numbered = lineNumbers ? lineArray : null;

	return (
		<pre
			data-slot="code-block-content"
			dir="ltr"
			tabIndex={tabIndex}
			className={cn(
				"scroll-fade-x overflow-x-auto p-4 font-mono leading-relaxed outline-none",
				"text-[13px] bg-card text-foreground/90 selection:bg-primary/20 dark:text-foreground/85",
				"group-data-[size=sm]/code-block:p-3 group-data-[size=sm]/code-block:text-xs",
				wrap &&
					"scroll-fade-y overflow-x-hidden whitespace-pre-wrap wrap-break-word",
				className,
			)}
			{...props}
		>
			<code
				className={cn(
					"grid min-w-full",
					numbered &&
						"grid-cols-[auto_minmax(0,1fr)] [counter-reset:line_calc(var(--start-line,1)-1)]",
				)}
				style={
					numbered
						? ({ ["--start-line" as string]: startLine } as React.CSSProperties)
						: undefined
				}
			>
				{lineArray.map((child, index) => {
					if (!numbered) return child;
					const key =
						React.isValidElement(child) && child.key != null
							? child.key
							: index;
					return (
						<React.Fragment key={key}>
							<span
								aria-hidden="true"
								className="select-none pr-4 text-right text-muted-foreground/45 [counter-increment:line] before:content-[counter(line)]"
							/>
							{child}
						</React.Fragment>
					);
				})}
			</code>
		</pre>
	);
}

const lineVariants = cva("block min-h-lh rounded-sm px-0", {
	variants: {
		variant: {
			default: "",
			added:
				"-mx-4 bg-emerald-500/10 px-4 text-emerald-700 ring-1 ring-inset ring-emerald-500/15 dark:text-emerald-300",
			removed:
				"-mx-4 bg-red-500/10 px-4 text-red-700 ring-1 ring-inset ring-red-500/15 dark:text-red-300",
			highlighted:
				"-mx-4 bg-primary/8 px-4 ring-1 ring-inset ring-primary/10 dark:bg-primary/12",
		},
	},
	defaultVariants: {
		variant: "default",
	},
});

function CodeBlockLine({
	className,
	variant = "default",
	children,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof lineVariants>) {
	const marker = variant === "added" ? "+" : variant === "removed" ? "−" : null;
	return (
		<span
			data-slot="code-block-line"
			data-variant={variant}
			className={cn(
				lineVariants({ variant }),
				marker && "grid grid-cols-[1ch_minmax(0,1fr)] gap-2",
				className,
			)}
			{...props}
		>
			{marker ? (
				<>
					<span aria-hidden="true" className="select-none opacity-70">
						{marker}
					</span>
					<span>{children}</span>
				</>
			) : (
				children
			)}
		</span>
	);
}

function CodeBlockFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="code-block-footer"
			className={cn(
				"flex items-center border-t border-border/60 bg-muted/20 px-3 py-2",
				className,
			)}
			{...props}
		/>
	);
}

export {
	CodeBlock,
	CodeBlockActions,
	CodeBlockContent,
	CodeBlockCopyButton,
	CodeBlockFooter,
	CodeBlockHeader,
	CodeBlockLine,
	CodeBlockTitle,
};
