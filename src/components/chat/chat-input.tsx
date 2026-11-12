import { SendIcon } from "lucide-react";
import * as React from "react";

import { Button } from "#/components/ui/button";

interface ChatInputProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	placeholder?: string;
	disabled?: boolean;
}

export function ChatInput({
	value,
	onChange,
	onSubmit,
	placeholder = "Type your message...",
	disabled = false,
}: ChatInputProps) {
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);

	const resize = React.useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run on value change
	React.useEffect(() => {
		resize();
	}, [value, resize]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (value.trim() && !disabled) onSubmit();
		}
	};

	return (
		<div className="w-full rounded-2xl border border-border bg-card p-2 shadow-sm">
			<textarea
				ref={textareaRef}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				disabled={disabled}
				rows={1}
				className="max-h-50 min-h-10 w-full resize-none border-0 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			/>
			<div className="mt-1 flex justify-end">
				<Button
					type="button"
					size="icon"
					onClick={onSubmit}
					disabled={disabled || !value.trim()}
					aria-label="Send message"
				>
					<SendIcon className="size-4" />
				</Button>
			</div>
		</div>
	);
}
