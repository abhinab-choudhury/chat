import assert from "node:assert/strict";
import test from "node:test";
import {
	agentModel,
	requireModelCredentials,
	resolveAgentModel,
} from "../src/lib/agent/provider.server";
import {
	DEFAULT_MODELS,
	DEFAULT_SELECTED_MODEL,
	modelProvider,
} from "../src/lib/models";

test("catalog exposes both tool-calling providers with an inexpensive OpenAI default", () => {
	assert.equal(DEFAULT_SELECTED_MODEL, "gpt-5.6-luna");
	assert.equal(modelProvider(DEFAULT_SELECTED_MODEL), "openai");
	assert.ok(DEFAULT_MODELS.some((m) => modelProvider(m.id) === "gemini"));
	assert.ok(
		DEFAULT_MODELS.every((m) => m.abilities?.includes("function_calling")),
	);
	assert.throws(
		() => modelProvider("https://untrusted.invalid/model"),
		/supported/,
	);
});
test("provider routing uses only the selected credential, with no silent failover", () => {
	const names = [
		"GEMINI_API_KEY",
		"OPENAI_API_KEY",
		"OPENAI_MODEL",
		"GEMINI_MODEL",
	];
	const previous = names.map((name) => process.env[name]);
	try {
		names.forEach((name) => {
			delete process.env[name];
		});
		process.env.OPENAI_API_KEY = "fixture-openai";
		assert.equal(resolveAgentModel().id, "gpt-5.6-luna");
		assert.equal(agentModel().model.provider, "openai.chat");
		assert.equal(agentModel("gpt-5.6-luna").model.modelId, "gpt-5.6-luna");
		assert.throws(
			() => requireModelCredentials("gemini-3.5-flash-lite"),
			/GEMINI_API_KEY/,
		);
		process.env.GEMINI_API_KEY = "fixture-gemini";
		assert.equal(agentModel("gemini-3.5-flash-lite").provider, "gemini");
		delete process.env.OPENAI_API_KEY;
		assert.throws(
			() => requireModelCredentials("gpt-5.6-luna"),
			/OPENAI_API_KEY/,
		);
		assert.equal(resolveAgentModel().provider, "gemini");
	} finally {
		names.forEach((name, i) => {
			if (previous[i] === undefined) delete process.env[name];
			else process.env[name] = previous[i];
		});
	}
});

test("provider errors distinguish quota, access and missing models without leaking responses", async () => {
	const { modelErrorMessage } = await import(
		"../src/lib/agent/provider.server"
	);
	assert.match(
		modelErrorMessage({ statusCode: 429, responseBody: "secret-key" }),
		/API quota/,
	);
	assert.match(modelErrorMessage({ statusCode: 401 }), /API key/);
	assert.match(modelErrorMessage({ statusCode: 404 }), /unavailable/);
	assert.match(modelErrorMessage({ statusCode: 503 }), /overloaded \(503\)/);
	assert.doesNotMatch(
		modelErrorMessage({ statusCode: 503 }),
		/quota|rate limit/,
	);
	assert.doesNotMatch(modelErrorMessage(new Error("secret-key")), /secret-key/);
});

test("rate limiting starts cooldown immediately without sending queued calls or retries", async () => {
	const { createProviderGate } = await import(
		"../src/lib/agent/provider.server"
	);
	let calls = 0;
	const gate = createProviderGate(async () => {
		calls++;
		return new Response("quota", { status: 429 });
	}, 0);
	const first = gate("https://fixture.invalid");
	const queued = gate("https://fixture.invalid");
	const queuedCheck = assert.rejects(
		queued,
		(error: unknown) =>
			!!error &&
			typeof error === "object" &&
			"statusCode" in error &&
			error.statusCode === 429,
	);
	assert.equal((await first).status, 429);
	await queuedCheck;
	assert.equal(calls, 1);
});

test("provider diagnostics identify exhausted quota without logging secrets or consuming SDK body", async () => {
	const { createProviderGate } = await import(
		"../src/lib/agent/provider.server"
	);
	const previousFormat = process.env.LOG_FORMAT;
	process.env.LOG_FORMAT = "json";
	const original = console.warn;
	const records: Record<string, unknown>[] = [];
	console.warn = (line: string) => records.push(JSON.parse(line));
	try {
		const gate = createProviderGate(
			async () =>
				Response.json(
					{ error: { code: "insufficient_quota", message: "secret prompt" } },
					{
						status: 429,
						headers: {
							"x-ratelimit-remaining-tokens": "0",
							authorization: "secret key",
						},
					},
				),
			0,
			"openai",
		);
		const response = await gate("https://fixture.invalid");
		assert.equal(records[0].reason, "insufficient_quota");
		assert.equal(records[0]["x-ratelimit-remaining-tokens"], "0");
		assert.doesNotMatch(JSON.stringify(records), /secret|authorization/);
		assert.equal((await response.json()).error.code, "insufficient_quota");
	} finally {
		console.warn = original;
		if (previousFormat === undefined) delete process.env.LOG_FORMAT;
		else process.env.LOG_FORMAT = previousFormat;
	}
});
