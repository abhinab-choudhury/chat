import { SendIcon } from "lucide-react";
import * as React from "react";

import { Button } from "#/components/ui/button";
import { Kbd, KbdGroup } from "#/components/ui/kbd";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";

interface ChatModel {
	id: string;
	label: string;
}

interface ChatInputProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	placeholder?: string;
	disabled?: boolean;
	models?: ChatModel[];
	model?: string;
	onModelChange?: (model: string) => void;
}

const DEFAULT_MODELS: ChatModel[] = [
	{ id: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen" },
	{ id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
	{ id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
	{ id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
	{ id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
];

export function ChatInput({
	value,
	onChange,
	onSubmit,
	placeholder = "Type your message...",
	disabled = false,
	models = DEFAULT_MODELS,
	model,
	onModelChange,
}: ChatInputProps) {
	const [internalModel, setInternalModel] = React.useState(
		model ?? models[0]?.id ?? "",
	);
	const selectedModel = model ?? internalModel;

	const handleModelChange = (next: string) => {
		if (onModelChange) onModelChange(next);
		else setInternalModel(next);
	};
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
				className="max-h-30 min-h-15 w-full resize-none border-0 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			/>
			<div className="mt-1 flex items-center justify-between gap-2">
				<span className="text-xs text-muted-foreground">
					<KbdGroup>
						<Kbd>Enter</Kbd>
					</KbdGroup>{" "}
					to send,{" "}
					<KbdGroup>
						<Kbd>Shift</Kbd>+<Kbd>Enter</Kbd>
					</KbdGroup>{" "}
					for new line
				</span>
				<div className="flex flex-row gap-2">
					<Select
						value={selectedModel}
						onValueChange={handleModelChange}
						disabled={disabled}
					>
						<SelectTrigger className="h-9 w-45 rounded-xl text-xs font-medium">
							<SelectValue placeholder="Model" />
						</SelectTrigger>
						<SelectContent className="mb-15">
							{models.map((m) => (
								<SelectItem key={m.id} value={m.id}>
									{m.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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
		</div>
	);
}
