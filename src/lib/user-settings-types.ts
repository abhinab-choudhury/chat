import type { SearchProviderType } from "./search/types";

export interface PublicSearchProviderStatus {
	id: SearchProviderType;
	configured: boolean;
}

export interface PublicUserSettings {
	hasGeminiKey: boolean;
	hasOpenAIKey: boolean;
	defaultSearchProvider: SearchProviderType | null;
	searchProviders: PublicSearchProviderStatus[];
	/** Whether persistent agent memory is available. */
	memoryAvailable: boolean;
}
