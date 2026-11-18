import { parseChatEvent, parseToolCall } from "./agent/events";
import type { AgentPhase } from "./agent/progress";
import type { WebSearchToolCall } from "./search/types";

export interface StreamCallbacks {
	onStatus?: (phase: AgentPhase) => void;
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

/** Merge a tool event into the accumulated list: a "done" call replaces its
 * matching pending call (by toolCallId when present, else same query);
 * anything else is appended. */
function mergeToolCall(
	calls: WebSearchToolCall[],
	call: WebSearchToolCall,
): WebSearchToolCall[] {
	if (call.state === "done") {
		const index = calls.findIndex(
			(c) =>
				c.state === "loading" &&
				c.query === call.query &&
				(!call.id || c.id === call.id),
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

	let completed = false;
	const applyEvent = (line: string) => {
		if (!line.trim()) return;
		const evt = parseChatEvent(line);
		if (evt.t === "err")
			throw new Error(evt.d || "The response could not be completed.");
		if (evt.t === "e") {
			completed = true;
			return;
		}
		if (evt.t === "status") callbacks.onStatus?.(evt.d);
		else if (evt.t === "r" && evt.d) {
			reasoning += evt.d;
			callbacks.onReasoning(reasoning);
		} else if (evt.t === "replace") {
			text = evt.d;
			callbacks.onText(text);
		} else if (evt.t === "t" && evt.d) {
			text += evt.d;
			callbacks.onText(text);
		} else if (evt.t === "tool" && evt.d) {
			const call = parseToolCall(evt.d);
			toolCalls = mergeToolCall(toolCalls, call);
			callbacks.onToolCalls?.(toolCalls);
		}
	};
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				applyEvent(line);
				if (completed) break;
			}
			if (completed) {
				// The terminal event, not a socket close, defines successful completion.
				void reader.cancel().catch(() => {});
				break;
			}
		}
		buffer += decoder.decode();
		if (!completed && buffer) applyEvent(buffer);
		if (!completed)
			throw new Error("The response was interrupted. Please retry.");
	} finally {
		void reader.cancel().catch(() => {});
		reader.releaseLock();
	}

	return { text, reasoning, toolCalls };
}
