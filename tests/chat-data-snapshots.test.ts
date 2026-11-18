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

test("thread refresh preserves order and references until actual activity changes", async () => {
	const { mergeThreadSnapshot } = await import("../src/lib/chat-data");
	const thread = (id: string, updatedAt: number): Thread => ({
		_id: id,
		title: id,
		userId: "browser",
		createdAt: 1,
		updatedAt,
	});
	const previous = [thread("a", 20), thread("b", 10)];
	assert.equal(
		mergeThreadSnapshot(previous, [{ ...previous[0] }], "a"),
		previous,
	);
	assert.equal(
		mergeThreadSnapshot(previous, previous.map((t) => ({ ...t })).reverse()),
		previous,
	);
	const changed = mergeThreadSnapshot(
		previous,
		[{ ...previous[1], updatedAt: 30 }],
		"b",
	);
	assert.deepEqual(
		changed.map((t) => t._id),
		["b", "a"],
	);
	assert.equal(changed[1], previous[0]);
	assert.deepEqual(
		mergeThreadSnapshot([], [thread("b", 10), thread("a", 10)]).map(
			(t) => t._id,
		),
		["a", "b"],
	);
	assert.deepEqual(
		mergeThreadSnapshot(previous, [], "a").map((t) => t._id),
		["b"],
	);
});
