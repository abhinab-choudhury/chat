import assert from "node:assert/strict";
import test from "node:test";
import { checkCitations } from "../src/lib/agent/validation";
import { consumeChatStream } from "../src/lib/stream-reader";

function stream(events: unknown[]) {
	return new ReadableStream<Uint8Array>({
		start(c) {
			const bytes = new TextEncoder().encode(
				`${events.map((e) => JSON.stringify(e)).join("\n")}\n`,
			);
			for (let i = 0; i < bytes.length; i += 3)
				c.enqueue(bytes.slice(i, i + 3));
			c.close();
		},
	});
}
test("progress precedes answer; fragmented Unicode is preserved", async () => {
	const seen: string[] = [];
	const result = await consumeChatStream(
		stream([
			{ t: "status", d: "validating" },
			{ t: "t", d: "Checked ✓" },
			{ t: "e" },
		]),
		{
			onText: (s) => seen.push(s),
			onReasoning: () => {},
			onStatus: (s) => seen.push(s),
		},
	);
	assert.deepEqual(seen, ["validating", "Checked ✓"]);
	assert.equal(result.text, "Checked ✓");
});
test("errors and premature EOF cannot be silently saved as success", async () => {
	const callbacks = { onText: () => {}, onReasoning: () => {} };
	await assert.rejects(
		consumeChatStream(stream([{ t: "err", d: "Review failed" }]), callbacks),
		/Review failed/,
	);
	await assert.rejects(
		consumeChatStream(stream([{ t: "status", d: "validating" }]), callbacks),
		/interrupted/,
	);
});
test("fabricated citations are rejected", () => {
	const urls = new Set(["https://example.com/pricing"]);
	assert.equal(
		checkCitations("[Price](https://example.com/pricing)", urls),
		true,
	);
	assert.equal(
		checkCitations("[Price](https://invented.example)", urls),
		false,
	);
});

test("malformed event payloads fail without being rendered as text", async () => {
	const callbacks = {
		onText: () => assert.fail("Malformed text was rendered"),
		onReasoning: () => {},
	};
	for (const event of [
		null,
		{ t: "t", d: { secret: true } },
		{ t: "status", d: "invented" },
		{
			t: "tool",
			d: '{"query":"q","state":"done","results":[{"url":"javascript:alert(1)","title":"x","description":""}]}',
		},
	]) {
		await assert.rejects(
			consumeChatStream(stream([event, { t: "e" }]), callbacks),
			/Invalid chat/,
		);
	}
});
test("terminal event completes even if upstream keeps the connection open", async () => {
	let cancelled = false;
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('{"t":"e"}\n'));
		},
		cancel() {
			cancelled = true;
		},
	});
	await consumeChatStream(body, { onText: () => {}, onReasoning: () => {} });
	assert.equal(cancelled, true);
});
