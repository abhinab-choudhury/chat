import type { SearchProviderType } from "./search/types";

export interface PublicSearchProviderStatus {
	id: SearchProviderType;
	configured: boolean;
	keyHint: string | null;
}

export interface PublicUserSettings {
	onboardingCompleted: boolean;
	hasGeminiKey: boolean;
	geminiKeyHint: string | null;
	defaultSearchProvider: SearchProviderType | null;
	searchProviders: PublicSearchProviderStatus[];
	/** True when the server has a Supermemory key configured via env. */
	memoryAvailable: boolean;
}
