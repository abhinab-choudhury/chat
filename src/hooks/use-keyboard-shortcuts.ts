import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { shortcutFromEvent } from "#/lib/shortcuts";
import { useModelStore } from "#/store/model-store";
import { useSearchStore } from "#/store/search-store";

/**
 * Global ⌘/Ctrl shortcuts. Mounted once at the chat shell so the handlers are
 * registered in a single place instead of inside the dialogs they open.
 *
 * The bindings come from Settings → Features, so combos the browser reserves
 * (like Ctrl+N) are never bound unless the user explicitly chooses them.
 */
export function useKeyboardShortcuts() {
	const navigate = useNavigate();
	const enabled = useModelStore((state) => state.keyboardShortcutsEnabled);
	const shortcuts = useModelStore((state) => state.shortcuts);

	React.useEffect(() => {
		if (!enabled) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.repeat) return;

			const combo = shortcutFromEvent(event);
			if (!combo) return;

			if (combo === shortcuts.search) {
				event.preventDefault();
				useSearchStore.getState().toggle();
				return;
			}

			if (combo === shortcuts.newChat) {
				event.preventDefault();
				useSearchStore.getState().setOpen(false);
				void navigate({ to: "/" });
			}
		};

		// Capture phase so the shortcuts still fire while focus sits in an
		// input, the command palette, or any widget that stops propagation.
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [enabled, shortcuts, navigate]);
}
