import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
	type UseThreadChatResult,
	useThreadChat,
} from "../src/hooks/use-thread-chat";
import { useChatDataStore } from "../src/lib/chat-data";
import { useChatStore } from "../src/store/chat-store";

const cssHook = registerHooks({
	load(url, context, nextLoad) {
		if (url.endsWith(".css"))
			return {
				format: "module",
				source: "export default {}",
				shortCircuit: true,
			};
		return nextLoad(url, context);
	},
});
const { StreamingMessage } = await import(
	"../src/components/chat/streaming-message"
);
const { MessageScrollerProvider } = await import(
	"../src/components/ui/message-scroller"
);
cssHook.deregister();

for (const autoSend of [false, true]) {
	test(`chat streams before completion (${autoSend ? "Strict Mode auto-send" : "manual send"})`, async () => {
		const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
		const originals = new Map<string, PropertyDescriptor | undefined>();
		for (const [key, value] of Object.entries({
			window: dom.window,
			document: dom.window.document,
			navigator: dom.window.navigator,
			IS_REACT_ACT_ENVIRONMENT: true,
		})) {
			originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
			Object.defineProperty(globalThis, key, { value, configurable: true });
		}
		const previousFetch = globalThis.fetch;
		const userId = "anon-streaming-test",
			threadId = "thread-streaming-test";
		dom.window.localStorage.setItem("anon-user-id", userId);
		const thread = {
			_id: threadId,
			userId,
			title: "Test",
			createdAt: 1,
			updatedAt: 1,
		};
		useChatDataStore.setState({
			threadsByUser: { [userId]: [thread] },
			messagesByThread: { [threadId]: [] },
		});
		useChatStore.getState().reset();
		if (autoSend) {
			useChatStore.getState().setPendingAutoSend(true);
			useChatStore.getState().setPendingInitialMessage("hello");
		}
		let controller!: ReadableStreamDefaultController<Uint8Array>;
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				controller = c;
			},
		});
		let chatRequests = 0;
		const signals: (AbortSignal | null | undefined)[] = [];
		globalThis.fetch = async (input, init) => {
			if (String(input) === "/api/chat") {
				chatRequests++;
				signals.push(init?.signal);
				return new Response(stream);
			}
			return Response.json({ threads: [thread], messages: [] });
		};
		let chat!: UseThreadChatResult;
		function Harness() {
			chat = useThreadChat(threadId);
			return createElement(
				MessageScrollerProvider,
				null,
				createElement(StreamingMessage, {
					streamingText: chat.streamingText,
					streamingReasoning: chat.streamingReasoning,
				}),
			);
		}
		const root = createRoot(dom.window.document.getElementById("root")!);
		const emit = (event: object) =>
			controller.enqueue(
				new TextEncoder().encode(JSON.stringify(event) + "\n"),
			);
		try {
			await act(async () => {
				root.render(createElement(StrictMode, null, createElement(Harness)));
			});
			let sending!: Promise<void>;
			await act(async () => {
				if (!autoSend) sending = chat.handleSubmit("hello");
			});
			assert.equal(chatRequests, 1);
			assert.equal(signals[0]?.aborted, false);
			await act(async () => {
				emit({ t: "r", d: "**Checking** the answer" });
			});
			assert.equal(
				dom.window.document.querySelector('[data-streamdown="strong"]')
					?.textContent,
				"Checking",
			);
			assert.equal(
				dom.window.document
					.querySelector("button")
					?.getAttribute("aria-expanded"),
				"true",
			);
			await act(async () => {
				emit({ t: "t", d: "## Hello" });
			});
			assert.equal(
				dom.window.document.querySelector("h2")?.textContent,
				"Hello",
			);
			await act(async () => {
				emit({ t: "t", d: "\n\n**World**" });
			});
			assert.equal(
				dom.window.document.querySelectorAll('[data-streamdown="strong"]')[1]
					?.textContent,
				"World",
			);
			await act(async () => {
				emit({ t: "e" });
				await sending;
			});
		} finally {
			await act(async () => root.unmount());
			globalThis.fetch = previousFetch;
			dom.window.close();
			for (const [key, descriptor] of originals) {
				if (descriptor) Object.defineProperty(globalThis, key, descriptor);
				else Reflect.deleteProperty(globalThis, key);
			}
		}
	});
}
