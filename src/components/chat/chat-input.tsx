import { GlobeIcon, SendIcon } from "lucide-react";
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
import { type ChatModel, DEFAULT_MODELS } from "#/lib/models";
import { cn } from "#/lib/utils";
import { useModelStore } from "#/store/model-store";
import { useHasSearchProvider } from "#/store/user-settings-store";

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

function modelSupportsReasoning(modelId: string, models: ChatModel[]): boolean {
	const m = models.find((x) => x.id === modelId);
	if (m?.abilities) {
		return (
			m.abilities.includes("reasoning") ||
			m.abilities.includes("effort_control")
		);
	}
	return (
		/hydrogen|thinking|reason/i.test(modelId) ||
		modelId.includes("gemini-2.5") ||
		modelId.includes("gemini-3")
	);
}

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

	// Web search toggle lives in the model store so it persists across the
	// home screen and thread views (master-gated by Settings > AI Options).
	const toolsEnabled = useModelStore((s) => s.toolsEnabled);
	const webSearchEnabled = useModelStore((s) =>
		s.enabledTools.includes("web_search"),
	);
	const hasSearchProvider = useHasSearchProvider();
	const toggleWebSearch = useModelStore((s) => s.toggleTool);
	const reasoningEffort = useModelStore((s) => s.reasoningEffort);
	const setReasoningEffort = useModelStore((s) => s.setReasoningEffort);
	const thinkingSupported = modelSupportsReasoning(selectedModel, models);
	const displayEffort = thinkingSupported ? reasoningEffort : "off";

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
		<div className="w-full rounded-b-none rounded-2xl border border-border/50 bg-card/60 p-2 shadow-sm backdrop-blur-md">
			<textarea
				autoFocus
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
				<div className="flex items-center gap-2">
					<Button
						type="button"
						size="icon"
						variant="ghost"
						aria-label={
							webSearchEnabled ? "Disable web search" : "Enable web search"
						}
						title={
							!hasSearchProvider
								? "Web search is not configured on this server"
								: !toolsEnabled
									? "Enable tools in Settings → AI Options first"
									: webSearchEnabled
										? "Web search enabled"
										: "Enable web search"
						}
						disabled={disabled || !toolsEnabled || !hasSearchProvider}
						className={cn(
							"size-8 shrink-0 rounded-xl",
							webSearchEnabled &&
								"bg-primary text-primary-foreground hover:bg-primary/90",
						)}
						onClick={() => toggleWebSearch("web_search")}
					>
						<GlobeIcon className="size-4" />
					</Button>
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
				</div>
				<div className="flex flex-row gap-2">
					<Select
						value={displayEffort}
						onValueChange={(v) =>
							setReasoningEffort(v as "off" | "low" | "medium" | "high")
						}
						disabled={disabled || !thinkingSupported}
					>
						<SelectTrigger className="h-9 w-24 sm:w-28 rounded-xl text-xs font-medium">
							<SelectValue placeholder="Reasoning" />
						</SelectTrigger>
						<SelectContent className="mb-10">
							<SelectItem value="off">Off</SelectItem>
							<SelectItem value="low">Low</SelectItem>
							<SelectItem value="medium">Medium</SelectItem>
							<SelectItem value="high">High</SelectItem>
						</SelectContent>
					</Select>
					<Select
						value={selectedModel}
						onValueChange={handleModelChange}
						disabled={disabled}
					>
						<SelectTrigger className="h-9 w-32 sm:w-45 rounded-xl text-xs font-medium">
							<SelectValue placeholder="Model" />
						</SelectTrigger>
						<SelectContent className="mb-10">
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
