import assert from "node:assert/strict";
import test from "node:test";
import {
	getProviderConfig,
	getPublicUserSettings,
} from "../src/lib/user-settings.server";

test("environment credentials stay server-side and missing keys disable capabilities", async () => {
	const previousOpenAI = process.env.OPENAI_API_KEY;
	const previousGemini = process.env.GEMINI_API_KEY;
	const previousSerper = process.env.SERPER_API_KEY;
	try {
		process.env.GEMINI_API_KEY = " private-gemini-test-key ";
		process.env.OPENAI_API_KEY = " private-openai-test-key ";
		process.env.SERPER_API_KEY = " private-serper-test-key ";
		const config = await getProviderConfig();
		assert.equal(config.openaiKey, "private-openai-test-key");
		assert.equal(config.geminiKey, "private-gemini-test-key");
		assert.equal(config.search?.apiKey, "private-serper-test-key");
		assert.equal(config.search?.provider, "serper");
		const status = await getPublicUserSettings();
		assert.equal(status.hasGeminiKey, true);
		assert.equal(status.hasOpenAIKey, true);
		assert.equal(status.defaultSearchProvider, "serper");
		assert.doesNotMatch(JSON.stringify(status), /private-|apiKey|geminiKey/);
		delete process.env.OPENAI_API_KEY;
		delete process.env.GEMINI_API_KEY;
		process.env.SERPER_API_KEY = " ";
		assert.deepEqual(await getProviderConfig(), {
			geminiKey: null,
			openaiKey: null,
			search: null,
		});
		const missing = await getPublicUserSettings();
		assert.equal(missing.hasGeminiKey, false);
		assert.equal(missing.defaultSearchProvider, null);
		assert.equal(missing.searchProviders[0].configured, false);
	} finally {
		if (previousOpenAI === undefined) delete process.env.OPENAI_API_KEY;
		else process.env.OPENAI_API_KEY = previousOpenAI;
		if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
		else process.env.GEMINI_API_KEY = previousGemini;
		if (previousSerper === undefined) delete process.env.SERPER_API_KEY;
		else process.env.SERPER_API_KEY = previousSerper;
	}
});
