import * as React from "react";
import { Kbd, KbdGroup } from "#/components/ui/kbd";
import {
	SHORTCUT_LABELS,
	type ShortcutAction,
	shortcutFromEvent,
	shortcutKeys,
	validateShortcut,
} from "#/lib/shortcuts";
import { cn } from "#/lib/utils";
import { useModelStore } from "#/store/model-store";

interface ShortcutRecorderProps {
	action: ShortcutAction;
	disabled?: boolean;
}

/**
 * Click, then press a new key combination. The capture-phase listener swallows
 * the keys while recording so global shortcuts (and the browser) do not react
 * to what is being typed.
 */
export function ShortcutRecorder({ action, disabled }: ShortcutRecorderProps) {
	const bindings = useModelStore((state) => state.shortcuts);
	const setShortcut = useModelStore((state) => state.setShortcut);

	const [recording, setRecording] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!recording) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();

			if (event.key === "Escape") {
				setRecording(false);
				setError(null);
				return;
			}

			const combo = shortcutFromEvent(event);
			if (!combo) return;

			const message = validateShortcut(combo, action, bindings);
			if (message) {
				setError(message);
				return;
			}

			setShortcut(action, combo);
			setRecording(false);
			setError(null);
		};

		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [recording, action, bindings, setShortcut]);

	const combo = bindings[action];

	return (
		<div className="flex flex-col items-end gap-1">
			<button
				type="button"
				disabled={disabled}
				aria-label={`Change shortcut for ${SHORTCUT_LABELS[action]}`}
				onClick={() => {
					setError(null);
					setRecording((current) => !current);
				}}
				onBlur={() => setRecording(false)}
				className={cn(
					"inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
					recording && "border-ring ring-2 ring-ring/50",
				)}
			>
				{recording ? (
					<span className="text-muted-foreground">Press keys…</span>
				) : (
					<KbdGroup>
						{shortcutKeys(combo).map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
				)}
			</button>
			{error ? (
				<span className="max-w-56 text-right text-[11px] leading-tight text-destructive">
					{error}
				</span>
			) : null}
		</div>
	);
}
