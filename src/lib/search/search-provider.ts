import { BraveSearchAdapter } from "./brave-search-adapter";
import { FirecrawlSearchAdapter } from "./firecrawl-search-adapter";
import { isSearchProviderType } from "./provider-catalog";
import { SerperSearchAdapter } from "./serper-search-adapter";
import { TavilySearchAdapter } from "./tavily-search-adapter";
import type {
	SearchAdapter,
	SearchOptions,
	SearchProviderType,
	SearchResult,
} from "./types";

function createAdapter(
	provider: SearchProviderType,
	apiKey: string,
): SearchAdapter {
	switch (provider) {
		case "firecrawl":
			return new FirecrawlSearchAdapter({ apiKey });
		case "brave":
			return new BraveSearchAdapter({ apiKey });
		case "tavily":
			return new TavilySearchAdapter({ apiKey });
		case "serper":
			return new SerperSearchAdapter({ apiKey });
	}
}

/**
 * Factory over the search provider adapters. The provider and key are supplied
 * by the user's encrypted BYOK configuration, so the factory never falls back
 * to server environment variables.
 */
export class SearchProvider {
	private adapter: SearchAdapter;

	constructor(provider: SearchProviderType, apiKey: string) {
		if (!isSearchProviderType(provider)) {
			throw new Error("Unsupported web search provider.");
		}
		const resolvedKey = apiKey?.trim();
		if (!resolvedKey) {
			throw new Error(
				`No ${provider} API key configured. Add one in Settings → Web Search.`,
			);
		}
		this.adapter = createAdapter(provider, resolvedKey);
	}

	async search(
		query: string,
		options: SearchOptions = {},
	): Promise<SearchResult[]> {
		return await this.adapter.search(query, options);
	}
}
