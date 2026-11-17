import type { PublicUserSettings } from "./user-settings-types";

/** Credentials stay on the server; browser requests receive availability only. */
export async function getProviderConfig() {
	const geminiKey = process.env.GEMINI_API_KEY?.trim() || null;
	const searchKey = process.env.SERPER_API_KEY?.trim() || null;
	return {
		geminiKey,
		openaiKey: process.env.OPENAI_API_KEY?.trim() || null,
		search: searchKey
			? { provider: "serper" as const, apiKey: searchKey, options: {} }
			: null,
	};
}

export async function getPublicUserSettings(): Promise<PublicUserSettings> {
	const { geminiKey, openaiKey, search } = await getProviderConfig();
	return {
		hasGeminiKey: Boolean(geminiKey),
		hasOpenAIKey: Boolean(openaiKey),
		defaultSearchProvider: search ? "serper" : null,
		searchProviders: [{ id: "serper", configured: Boolean(search) }],
		memoryAvailable: true,
	};
}
