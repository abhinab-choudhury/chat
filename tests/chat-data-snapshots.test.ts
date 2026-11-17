import assert from "node:assert/strict";
import test from "node:test";
import {
	type Message,
	selectMessages,
	selectThreads,
	type Thread,
} from "../src/lib/chat-data";

test("empty chat snapshots stay stable across reads and unrelated store updates", () => {
	const empty = { threadsByUser: {}, messagesByThread: {} };
	const threads = selectThreads(empty, "new-browser");
	const messages = selectMessages(empty, "new-thread");
	for (let i = 0; i < 10; i++) {
		assert.equal(selectThreads(empty, "new-browser"), threads);
		assert.equal(selectMessages(empty, "new-thread"), messages);
	}
	assert.equal(selectThreads(empty, null), threads);
	assert.equal(selectMessages(empty, undefined), messages);
	assert.equal(
		selectThreads({ threadsByUser: { other: [] } }, "new-browser"),
		threads,
	);
	assert.equal(
		selectMessages({ messagesByThread: { other: [] } }, "new-thread"),
		messages,
	);
});

test("chat snapshots expose stored data and change reference when it changes", () => {
	const threads: Thread[] = [
		{
			_id: "thread",
			title: "Hello",
			userId: "browser",
			createdAt: 1,
			updatedAt: 1,
		},
	];
	const messages: Message[] = [
		{
			_id: "message",
			threadId: "thread",
			role: "user",
			content: "Hello",
			createdAt: 1,
		},
	];
	assert.equal(
		selectThreads({ threadsByUser: { browser: threads } }, "browser"),
		threads,
	);
	assert.equal(
		selectMessages({ messagesByThread: { thread: messages } }, "thread"),
		messages,
	);
	assert.notEqual(
		selectThreads({ threadsByUser: { browser: [...threads] } }, "browser"),
		threads,
	);
	assert.notEqual(
		selectMessages({ messagesByThread: { thread: [...messages] } }, "thread"),
		messages,
	);
});
