import type { WebSearchToolCall } from "#/lib/search/types";

export interface StreamCallbacks {
	/** Called with the accumulated text so far, on every text chunk. */
	onText: (accumulated: string) => void;
	/** Called with the accumulated reasoning so far, on every reasoning chunk. */
	onReasoning: (accumulated: string) => void;
	/** Called with the accumulated web-search tool calls on every tool event. */
	onToolCalls?: (calls: WebSearchToolCall[]) => void;
}

export interface StreamResult {
	text: string;
	reasoning: string;
	toolCalls: WebSearchToolCall[];
}

interface ChatStreamEvent {
	t?: string;
	d?: string;
}

/** Merge a tool event into the accumulated list: a "done" call replaces its
 * matching pending "loading" call (same query); anything else is appended. */
function mergeToolCall(
	calls: WebSearchToolCall[],
	call: WebSearchToolCall,
): WebSearchToolCall[] {
	if (call.state === "done") {
		const index = calls.findIndex(
			(c) => c.state === "loading" && c.query === call.query,
		);
		if (index !== -1) {
			const next = [...calls];
			next[index] = call;
			return next;
		}
	}
	return [...calls, call];
}

/**
 * Consumes the app's newline-delimited chat event stream (`{ t, d }` JSON
 * lines) and reports accumulated text/reasoning/tool calls via callbacks.
 * Shared by the send path and the resume path so both stay in sync.
 */
export async function consumeChatStream(
	body: ReadableStream<Uint8Array>,
	callbacks: StreamCallbacks,
): Promise<StreamResult> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let text = "";
	let reasoning = "";
	let toolCalls: WebSearchToolCall[] = [];
	let buffer = "";

	const applyEvent = (line: string) => {
		if (!line.trim()) return;
		try {
			const evt = JSON.parse(line) as ChatStreamEvent;
			if (evt.t === "r" && evt.d) {
				reasoning += evt.d;
				callbacks.onReasoning(reasoning);
			} else if (evt.t === "t" && evt.d) {
				text += evt.d;
				callbacks.onText(text);
			} else if (evt.t === "tool" && evt.d) {
				try {
					const call = JSON.parse(evt.d) as WebSearchToolCall;
					toolCalls = mergeToolCall(toolCalls, call);
					callbacks.onToolCalls?.(toolCalls);
				} catch {
					// Ignore malformed tool payloads.
				}
			}
		} catch {
			// Fallback: treat unparseable lines as plain text chunks.
			text += line;
			callbacks.onText(text);
		}
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) applyEvent(line);
	}
	if (buffer) applyEvent(buffer);

	return { text, reasoning, toolCalls };
}
