import assert from "node:assert/strict";
import test from "node:test";
import { errorMetadata } from "../src/lib/agent/logging";

test("provider diagnostics exclude prompts, keys, response bodies and nested messages", () => {
	const cause = Object.assign(new Error("private prompt and API key"), {
		name: "AI_APICallError",
		statusCode: 429,
		isRetryable: true,
		requestBodyValues: { prompt: "private" },
		responseBody: "private",
	});
	const error = new Error("private output", { cause });
	assert.deepEqual(errorMetadata(error), {
		errorType: "Error",
		cause1Type: "AI_APICallError",
		cause1Status: 429,
		cause1Retryable: true,
	});
	cause.cause = error;
	assert.doesNotThrow(() => errorMetadata(error));
	assert.deepEqual(errorMetadata("private string"), {
		errorType: "UnknownError",
	});
});
