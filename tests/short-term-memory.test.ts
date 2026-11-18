import assert from "node:assert/strict";
import test from "node:test";
import {
	selectShortTermMemory,
	shortTermWindow,
} from "../src/lib/memory/short-term";

test("window evicts oldest entries and retains stable keys in chronological order", () => {
	const rows = Array.from({ length: 25 }, (_, i) => ({
		id: `m${25 - i}`,
		role: "user",
		content: `message ${25 - i}`,
	}));
	const window = shortTermWindow(rows);
	assert.equal(Object.keys(window).length, 20);
	assert.equal(Object.keys(window)[0], "m6");
	assert.equal(window.m5, undefined);
	assert.equal(window.m25.value, "message 25");
});
test("window enforces character budget and excludes non-conversation roles", () => {
	const window = shortTermWindow([
		{ id: "system", role: "system", content: "hidden" },
		{ id: "new", role: "user", content: "a".repeat(20000) },
		{ id: "old", role: "assistant", content: "b".repeat(10000) },
		{ id: "evicted", role: "user", content: "oldest" },
	]);
	assert.equal(window.system, undefined);
	assert.equal(window.old.value.length, 4000);
	assert.equal(window.evicted, undefined);
});
test("request selection retains immediate context and relevant older entries only", () => {
	const window = shortTermWindow(
		Array.from({ length: 8 }, (_, i) => ({
			id: `m${8 - i}`,
			role: "user",
			content: i === 6 ? "project uses postgres" : "unrelated",
		})),
	);
	const selected = selectShortTermMemory(window, "Which postgres version?");
	assert.deepEqual(Object.keys(selected), ["m2", "m5", "m6", "m7", "m8"]);
});
