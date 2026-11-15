/**
 * Keyboard shortcut definitions and matching helpers.
 *
 * Combinations are stored as canonical strings such as `mod+k` or
 * `mod+shift+o`, where `mod` means Ctrl on Windows/Linux and ⌘ on macOS.
 */

export type ShortcutAction = "search" | "newChat";

export type ShortcutBindings = Record<ShortcutAction, string>;

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
	search: "Search chats",
	newChat: "Start a new chat",
};

export const SHORTCUT_ACTIONS: ShortcutAction[] = ["search", "newChat"];

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
	search: "mod+k",
	// Ctrl+N is reserved by every major browser (opens a new window), so the
	// default avoids it. Users can rebind this in Settings → Features.
	newChat: "mod+shift+o",
};

/**
 * Combos the browser intercepts before the page sees them. Keydown events for
 * these never fire, so binding them would silently do nothing.
 */
const RESERVED_COMBOS = new Set([
	"mod+n",
	"mod+t",
	"mod+w",
	"mod+r",
	"mod+shift+r",
	"mod+l",
	"mod+q",
	"mod+shift+q",
	"mod+shift+n",
	"mod+shift+t",
	"mod+shift+w",
	"mod+tab",
	"mod+shift+tab",
]);

const CODE_KEYS: Record<string, string> = {
	Space: "space",
	Slash: "/",
	Backslash: "\\",
	Comma: ",",
	Period: ".",
	Semicolon: ";",
	Quote: "'",
	BracketLeft: "[",
	BracketRight: "]",
	Minus: "-",
	Equal: "=",
	Backquote: "`",
	ArrowUp: "arrowup",
	ArrowDown: "arrowdown",
	ArrowLeft: "arrowleft",
	ArrowRight: "arrowright",
	Enter: "enter",
	Backspace: "backspace",
	Delete: "delete",
	Tab: "tab",
};

const KEY_LABELS: Record<string, string> = {
	mod: "Ctrl",
	shift: "Shift",
	alt: "Alt",
	space: "Space",
	arrowup: "↑",
	arrowdown: "↓",
	arrowleft: "←",
	arrowright: "→",
	enter: "↵",
	delete: "Del",
	tab: "Tab",
};

function normalizeKey(event: KeyboardEvent): string | null {
	const code = event.code;
	if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
	if (/^Digit[0-9]$/.test(code)) return code.slice(5);
	if (/^F([1-9]|1[0-2])$/.test(code)) return code.toLowerCase();
	return CODE_KEYS[code] ?? null;
}

/**
 * Turns a keydown event into a canonical combo, or null when the event is not
 * usable as a global shortcut (no modifier, modifier-only press, etc.).
 */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
	if (!event.metaKey && !event.ctrlKey && !event.altKey) return null;

	const key = normalizeKey(event);
	if (!key) return null;

	const parts: string[] = [];
	if (event.metaKey || event.ctrlKey) parts.push("mod");
	if (event.shiftKey) parts.push("shift");
	if (event.altKey) parts.push("alt");
	parts.push(key);

	return parts.join("+");
}

/** Key caps to render for a combo. */
export function shortcutKeys(combo: string): string[] {
	return combo.split("+").map((part) => KEY_LABELS[part] ?? part.toUpperCase());
}

export function shortcutDisplay(combo: string): string {
	return shortcutKeys(combo).join(" + ");
}

export function isReservedShortcut(combo: string): boolean {
	return RESERVED_COMBOS.has(combo);
}

/** Returns an error message when a combo cannot be used, or null when it can. */
export function validateShortcut(
	combo: string,
	action: ShortcutAction,
	bindings: ShortcutBindings,
): string | null {
	if (isReservedShortcut(combo)) {
		return `${shortcutDisplay(combo)} is reserved by the browser. Pick another combination.`;
	}

	const other = SHORTCUT_ACTIONS.find((item) => item !== action);
	if (other && bindings[other] === combo) {
		return `Already used by “${SHORTCUT_LABELS[other]}”.`;
	}

	return null;
}
