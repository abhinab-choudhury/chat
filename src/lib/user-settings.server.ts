import { eq } from "drizzle-orm";

import { db } from "#/database";
import { type UserSettingsRow, userSettings } from "#/database/chat-settings";
import {
	isSearchProviderType,
	SEARCH_PROVIDER_IDS,
} from "#/lib/search/provider-catalog";
import type { SearchProviderType } from "#/lib/search/types";
import {
	encryptSecret,
	secretHint,
	tryDecryptSecret,
} from "#/lib/secrets.server";
import type {
	PublicSearchProviderStatus,
	PublicUserSettings,
} from "#/lib/user-settings-types";

export type { PublicSearchProviderStatus, PublicUserSettings };

export interface DecryptedSearchConfig {
	provider: SearchProviderType;
	apiKey: string;
	options: Record<string, string>;
}

export interface DecryptedUserSettings {
	geminiKey: string | null;
	search: DecryptedSearchConfig | null;
}

function isMemoryConfigured(): boolean {
	return Boolean(
		process.env.AGENT_BRIDGE_SECRET?.trim() &&
			process.env.VITE_CONVEX_SITE_URL?.trim(),
	);
}

function normalizeSearchKeys(
	value: Record<string, string> | null | undefined,
): Record<string, string> {
	if (!value) return {};
	const next: Record<string, string> = {};
	for (const [key, secret] of Object.entries(value)) {
		if (isSearchProviderType(key) && typeof secret === "string" && secret) {
			next[key] = secret;
		}
	}
	return next;
}

function resolveDefaultProvider(
	row: UserSettingsRow,
	keys: Record<string, string>,
): SearchProviderType | null {
	if (isSearchProviderType(row.defaultSearchProvider)) {
		if (keys[row.defaultSearchProvider]) return row.defaultSearchProvider;
	}
	return (
		(SEARCH_PROVIDER_IDS.find((provider) => keys[provider]) as
			| SearchProviderType
			| undefined) ?? null
	);
}

export async function getOrCreateSettingsRow(
	userId: string,
): Promise<UserSettingsRow> {
	const existing = await db
		.select()
		.from(userSettings)
		.where(eq(userSettings.userId, userId))
		.limit(1);
	if (existing[0]) return existing[0];

	const inserted = await db
		.insert(userSettings)
		.values({ userId })
		.onConflictDoNothing()
		.returning();
	if (inserted[0]) return inserted[0];

	const [row] = await db
		.select()
		.from(userSettings)
		.where(eq(userSettings.userId, userId))
		.limit(1);
	return row;
}

export async function getPublicUserSettings(
	userId: string,
): Promise<PublicUserSettings> {
	const row = await getOrCreateSettingsRow(userId);
	const keys = normalizeSearchKeys(row.searchKeys);
	const geminiKey = tryDecryptSecret(row.geminiKey);

	return {
		onboardingCompleted: row.onboardingCompleted,
		hasGeminiKey: Boolean(geminiKey),
		geminiKeyHint: geminiKey ? secretHint(geminiKey) : null,
		defaultSearchProvider: resolveDefaultProvider(row, keys),
		searchProviders: SEARCH_PROVIDER_IDS.map((id) => {
			const key = tryDecryptSecret(keys[id]);
			return {
				id,
				configured: Boolean(key),
				keyHint: key ? secretHint(key) : null,
			};
		}),
		memoryAvailable: isMemoryConfigured(),
	};
}

export async function getDecryptedUserSettings(
	userId: string,
): Promise<DecryptedUserSettings> {
	const row = await getOrCreateSettingsRow(userId);
	const keys = normalizeSearchKeys(row.searchKeys);
	const provider = resolveDefaultProvider(row, keys);
	const apiKey = provider ? tryDecryptSecret(keys[provider]) : null;

	return {
		geminiKey: tryDecryptSecret(row.geminiKey),
		search:
			provider && apiKey
				? {
						provider,
						apiKey,
						options: row.searchOptions?.[provider] ?? {},
					}
				: null,
	};
}

export async function saveGeminiKey(
	userId: string,
	apiKey: string | null,
): Promise<void> {
	const row = await getOrCreateSettingsRow(userId);
	await db
		.update(userSettings)
		.set({
			geminiKey: apiKey ? encryptSecret(apiKey) : null,
			updatedAt: new Date(),
		})
		.where(eq(userSettings.userId, row.userId));
}

export interface SaveSearchProviderInput {
	provider: SearchProviderType;
	apiKey?: string | null;
	options?: Record<string, string>;
	clear?: boolean;
}

export async function saveSearchProvider(
	userId: string,
	input: SaveSearchProviderInput,
): Promise<void> {
	const row = await getOrCreateSettingsRow(userId);
	const keys = normalizeSearchKeys(row.searchKeys);
	const options = { ...(row.searchOptions ?? {}) };

	if (input.clear) {
		delete keys[input.provider];
		delete options[input.provider];
	} else {
		const trimmed = input.apiKey?.trim();
		if (trimmed) keys[input.provider] = encryptSecret(trimmed);
		if (input.options) options[input.provider] = input.options;
	}

	// Only make this provider the default when it has a usable key.
	const defaultSearchProvider = keys[input.provider]
		? input.provider
		: resolveDefaultProvider(
				{ ...row, defaultSearchProvider: row.defaultSearchProvider },
				keys,
			);

	await db
		.update(userSettings)
		.set({
			searchKeys: keys,
			searchOptions: options,
			defaultSearchProvider,
			updatedAt: new Date(),
		})
		.where(eq(userSettings.userId, row.userId));
}

export async function selectSearchProvider(
	userId: string,
	provider: SearchProviderType,
): Promise<void> {
	const row = await getOrCreateSettingsRow(userId);
	const keys = normalizeSearchKeys(row.searchKeys);
	if (!keys[provider]) {
		throw new Error("Add an API key for this provider first.");
	}
	await db
		.update(userSettings)
		.set({ defaultSearchProvider: provider, updatedAt: new Date() })
		.where(eq(userSettings.userId, row.userId));
}

export async function setOnboardingCompleted(
	userId: string,
	completed: boolean,
): Promise<void> {
	await getOrCreateSettingsRow(userId);
	await db
		.update(userSettings)
		.set({ onboardingCompleted: completed, updatedAt: new Date() })
		.where(eq(userSettings.userId, userId));
}
