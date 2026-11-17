import assert from "node:assert/strict";
import test from "node:test";
import {
	ChatTransportError,
	createChatResponseStream,
} from "../src/lib/agent/transport";
import { consumeChatStream } from "../src/lib/stream-reader";

const encoder = new TextEncoder();
function upstream(text = "Reviewed answer") {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(
				encoder.encode(`${JSON.stringify({ t: "t", d: text })}\n{"t":"e"}\n`),
			);
			controller.close();
		},
	});
}

test("progress flushes before upstream and resume registration finish", async () => {
	let resolveResume!: (value: null) => void;
	let resolveUpstream!: (value: ReadableStream<Uint8Array>) => void;
	const response = createChatResponseStream(
		() =>
			new Promise((resolve) => {
				resolveUpstream = resolve;
			}),
		() =>
			new Promise((resolve) => {
				resolveResume = resolve;
			}),
	);
	const reader = response.getReader();
	const first = await reader.read();
	assert.match(new TextDecoder().decode(first.value), /preparing/);
	resolveResume(null);
	resolveUpstream(upstream());
	let output = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		output += new TextDecoder().decode(value);
	}
	assert.match(output, /Reviewed answer/);
	reader.releaseLock();
});

test("resume failure falls back to direct response", async () => {
	const response = createChatResponseStream(
		async () => upstream(),
		async () => {
			throw new Error("Redis offline");
		},
	);
	const result = await consumeChatStream(response, {
		onText: () => {},
		onReasoning: () => {},
	});
	assert.equal(result.text, "Reviewed answer");
});

test("unexpected server errors never expose internal details", async () => {
	const response = createChatResponseStream(async () => {
		throw new Error("database password=secret");
	});
	await assert.rejects(
		consumeChatStream(response, { onText: () => {}, onReasoning: () => {} }),
		(error) =>
			error instanceof Error &&
			!error.message.includes("secret") &&
			/Unable to complete/.test(error.message),
	);
	const publicResponse = createChatResponseStream(async () => {
		throw new ChatTransportError("Please configure your provider key.");
	});
	await assert.rejects(
		consumeChatStream(publicResponse, {
			onText: () => {},
			onReasoning: () => {},
		}),
		/Please configure your provider key/,
	);
});

test("disconnect cancels delivery but lets upstream work finish", async () => {
	let resolveUpstream!: (value: ReadableStream<Uint8Array>) => void;
	let finished!: () => void;
	const completed = new Promise<void>((resolve) => {
		finished = resolve;
	});
	const response = createChatResponseStream(
		() =>
			new Promise((resolve) => {
				resolveUpstream = resolve;
			}),
	);
	const reader = response.getReader();
	await reader.read();
	await reader.cancel();
	resolveUpstream(
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode('{"t":"e"}\n'));
				controller.close();
				finished();
			},
		}),
	);
	await completed;
	reader.releaseLock();
});
