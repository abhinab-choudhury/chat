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
	/** True when the Convex agent bridge is configured. */
	memoryAvailable: boolean;
}
