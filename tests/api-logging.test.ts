import assert from "node:assert/strict";
import { test } from "node:test";
import { withApiLogging } from "../src/lib/api-logging.server";

test("API logs correlate requests, classify statuses and omit private data", async () => {
	const previousFormat = process.env.LOG_FORMAT;
	process.env.LOG_FORMAT = "json";
	const records: { level: string; data: Record<string, unknown> }[] = [];
	const originals = {
		info: console.info,
		warn: console.warn,
		error: console.error,
	};
	for (const level of ["info", "warn", "error"] as const) {
		console[level] = (value: string) =>
			records.push({ level, data: JSON.parse(value) });
	}
	try {
		const request = new Request(
			"https://example.com/api/chat/private?token=secret",
			{
				method: "POST",
				body: "private prompt",
				headers: { authorization: "secret" },
			},
		);
		for (const status of [200, 400, 500]) {
			const response = new Response("private response", { status });
			assert.equal(
				await withApiLogging(
					"/api/chat/$id",
					async () => response,
				)({ request }),
				response,
			);
			const end = records.at(-1);
			assert.ok(end);
			assert.equal(end.data.event, "request.completed");
			assert.equal(typeof end.data.requestId, "string");
			assert.equal(end.data.status, status);
			assert.equal(
				end.level,
				status === 500 ? "error" : status === 400 ? "warn" : "info",
			);
			assert.equal(typeof end.data.durationMs, "number");
			assert.equal(await response.text(), "private response");
		}
		const error = new Error("private provider error");
		await assert.rejects(
			withApiLogging("/api/chat", async () => {
				throw error;
			})({ request }),
			(caught) => caught === error,
		);
		assert.equal(records.at(-1)?.data.event, "request.failed");
		assert.equal(records.at(-1)?.data.errorType, "Error");
		assert.doesNotMatch(
			JSON.stringify(records),
			/secret|private|authorization/,
		);
	} finally {
		Object.assign(console, originals);
		if (previousFormat === undefined) delete process.env.LOG_FORMAT;
		else process.env.LOG_FORMAT = previousFormat;
	}
});

test("stream opening and asynchronous work share an ID without claiming generation success", async () => {
	const { serverLog } = await import("../src/lib/server-logging");
	const previousFormat = process.env.LOG_FORMAT;
	process.env.LOG_FORMAT = "json";
	const original = console.info;
	const records: Record<string, unknown>[] = [];
	console.info = (line: string) => records.push(JSON.parse(line));
	try {
		await withApiLogging("/api/chat", async () => {
			await Promise.resolve();
			serverLog("info", "provider", "request.completed", { status: 200 });
			return new Response("", {
				headers: { "content-type": "application/x-ndjson" },
			});
		})({ request: new Request("https://example.com/api/chat") });
		assert.equal(records[1].event, "response.opened");
		assert.equal(records[0].requestId, records[1].requestId);
		assert.ok(records[0].requestId);
	} finally {
		console.info = original;
		if (previousFormat === undefined) delete process.env.LOG_FORMAT;
		else process.env.LOG_FORMAT = previousFormat;
	}
});
