import { BraveSearchAdapter } from "./brave-search-adapter";
import { FirecrawlSearchAdapter } from "./firecrawl-search-adapter";
import { SerperSearchAdapter } from "./serper-search-adapter";
import { TavilySearchAdapter } from "./tavily-search-adapter";
import type {
	SearchAdapter,
	SearchOptions,
	SearchProviderType,
	SearchResult,
} from "./types";

// Server-side API keys; the first configured provider is used unless
// SEARCH_PROVIDER names one explicitly.
const PROVIDER_ENV_KEYS: Record<SearchProviderType, string> = {
	firecrawl: "FIRECRAWL_API_KEY",
	brave: "BRAVE_API_KEY",
	tavily: "TAVILY_API_KEY",
	serper: "SERPER_API_KEY",
};

const AUTO_DETECT_ORDER: SearchProviderType[] = [
	"tavily",
	"brave",
	"firecrawl",
	"serper",
];

export function getServerSearchProviderType(): SearchProviderType | undefined {
	const explicit = process.env.SEARCH_PROVIDER?.trim() as
		| SearchProviderType
		| undefined;
	if (explicit && explicit in PROVIDER_ENV_KEYS) {
		if (process.env[PROVIDER_ENV_KEYS[explicit]]) return explicit;
		return undefined;
	}
	return AUTO_DETECT_ORDER.find(
		(provider) => process.env[PROVIDER_ENV_KEYS[provider]],
	);
}

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
 * Factory over the search provider adapters. Ported from intern3-chat's
 * SearchProvider: picks the provider, resolves the server-side key, and
 * delegates `search` to the matching adapter.
 */
export class SearchProvider {
	private adapter: SearchAdapter;

	constructor(provider?: SearchProviderType) {
		const resolved = provider ?? getServerSearchProviderType();
		if (!resolved) {
			throw new Error(
				"No web search provider configured. Set one of TAVILY_API_KEY, BRAVE_API_KEY, FIRECRAWL_API_KEY or SERPER_API_KEY (or SEARCH_PROVIDER) on the server.",
			);
		}
		const apiKey = process.env[PROVIDER_ENV_KEYS[resolved]];
		if (!apiKey) {
			throw new Error(`${PROVIDER_ENV_KEYS[resolved]} is not set`);
		}
		this.adapter = createAdapter(resolved, apiKey);
	}

	async search(
		query: string,
		options: SearchOptions = {},
	): Promise<SearchResult[]> {
		return await this.adapter.search(query, options);
	}
}
