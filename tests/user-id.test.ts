import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentUserId, readUserIdFromCookie } from "../src/lib/user-id";

test("browser identity repairs legacy IDs and remains usable without local storage", () => {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	const previousDocument = Object.getOwnPropertyDescriptor(
		globalThis,
		"document",
	);
	let storedId = "dev-user";
	const document = { cookie: "" };
	const storage = {
		getItem: () => storedId,
		setItem: (_key: string, value: string) => {
			storedId = value;
		},
	};
	try {
		Object.defineProperty(globalThis, "window", {
			value: { localStorage: storage },
			configurable: true,
		});
		Object.defineProperty(globalThis, "document", {
			value: document,
			configurable: true,
		});
		const repaired = getCurrentUserId();
		assert.match(repaired, /^anon-/);
		assert.equal(storedId, repaired);
		assert.equal(readUserIdFromCookie(document.cookie), repaired);
		storage.getItem = () => {
			throw new Error("Storage blocked");
		};
		storage.setItem = () => {
			throw new Error("Storage blocked");
		};
		assert.equal(getCurrentUserId(), repaired);
		document.cookie = "";
		assert.equal(getCurrentUserId(), repaired);
		assert.equal(readUserIdFromCookie(document.cookie), repaired);
	} finally {
		if (previousWindow)
			Object.defineProperty(globalThis, "window", previousWindow);
		else Reflect.deleteProperty(globalThis, "window");
		if (previousDocument)
			Object.defineProperty(globalThis, "document", previousDocument);
		else Reflect.deleteProperty(globalThis, "document");
	}
});
