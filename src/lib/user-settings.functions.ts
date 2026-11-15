import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from "#/lib/auth";
import { isSearchProviderType } from "#/lib/search/provider-catalog";
import type { SearchProviderType } from "#/lib/search/types";

async function requireUserId(): Promise<string> {
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });
	const userId = session?.user?.id;
	if (!userId) {
		throw new Error("Unauthorized");
	}
	return userId;
}

export const getUserSettings = createServerFn({ method: "GET" }).handler(
	async () => {
		const userId = await requireUserId();
		const { getPublicUserSettings } = await import(
			"#/lib/user-settings.server"
		);
		return await getPublicUserSettings(userId);
	},
);

interface SaveKeyInput {
	apiKey?: string;
	clear?: boolean;
}

export const saveGeminiApiKey = createServerFn({ method: "POST" })
	.validator((data: SaveKeyInput) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const { saveGeminiKey, getPublicUserSettings } = await import(
			"#/lib/user-settings.server"
		);
		const apiKey = data.clear ? null : data.apiKey?.trim() || null;
		if (!data.clear && !apiKey) {
			throw new Error("Enter a Gemini API key.");
		}
		await saveGeminiKey(userId, apiKey);
		return await getPublicUserSettings(userId);
	});

export const saveSearchApiKey = createServerFn({ method: "POST" })
	.validator(
		(data: {
			provider: SearchProviderType;
			apiKey?: string;
			options?: Record<string, string>;
			clear?: boolean;
		}) => data,
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		if (!isSearchProviderType(data.provider)) {
			throw new Error("Unknown search provider.");
		}
		const { saveSearchProvider, getPublicUserSettings } = await import(
			"#/lib/user-settings.server"
		);
		await saveSearchProvider(userId, {
			provider: data.provider,
			apiKey: data.apiKey?.trim() || null,
			options: data.options,
			clear: data.clear,
		});
		const settings = await getPublicUserSettings(userId);
		const configured = settings.searchProviders.find(
			(provider) => provider.id === data.provider,
		)?.configured;
		if (!data.clear && !configured) {
			throw new Error("Enter an API key for this search provider.");
		}
		return settings;
	});

export const selectSearchApiProvider = createServerFn({ method: "POST" })
	.validator((data: { provider: SearchProviderType }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		if (!isSearchProviderType(data.provider)) {
			throw new Error("Unknown search provider.");
		}
		const { selectSearchProvider, getPublicUserSettings } = await import(
			"#/lib/user-settings.server"
		);
		await selectSearchProvider(userId, data.provider);
		return await getPublicUserSettings(userId);
	});

export const completeOnboarding = createServerFn({ method: "POST" })
	.validator((data: { completed?: boolean }) => data)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const { setOnboardingCompleted, getPublicUserSettings } = await import(
			"#/lib/user-settings.server"
		);
		await setOnboardingCompleted(userId, data.completed ?? true);
		return await getPublicUserSettings(userId);
	});
