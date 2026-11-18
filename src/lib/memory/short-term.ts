export interface ShortTermMessage {
	id: string;
	role: string;
	content: string;
}
export const SHORT_TERM_WINDOW = 20;
export const SHORT_TERM_BUDGET = 24000;

/** Input is newest first. Keys remain stable as the conversation window slides. */
export function shortTermWindow(rows: ShortTermMessage[]) {
	const entries: Record<string, { role: "user" | "assistant"; value: string }> =
		{};
	let remaining = SHORT_TERM_BUDGET;
	for (const row of rows.slice(0, SHORT_TERM_WINDOW)) {
		if (row.role !== "user" && row.role !== "assistant") continue;
		if (!remaining) break;
		entries[row.id] = {
			role: row.role,
			value: row.content.slice(0, remaining),
		};
		remaining -= entries[row.id].value.length;
	}
	return Object.fromEntries(Object.entries(entries).reverse());
}

/** Always retain immediate context; include older window entries when query terms match. */
export function selectShortTermMemory(
	window: ReturnType<typeof shortTermWindow>,
	query: string,
) {
	const entries = Object.entries(window);
	const terms = query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
	return Object.fromEntries(
		entries.filter(
			([, entry], index) =>
				index >= entries.length - 4 ||
				terms.some((term) => entry.value.toLowerCase().includes(term)),
		),
	);
}
