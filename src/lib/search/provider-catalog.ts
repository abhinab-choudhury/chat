import type { SearchProviderType } from "./types";

export interface SearchProviderInfo {
	id: SearchProviderType;
	name: string;
	description: string;
	placeholder: string;
	docsUrl: string;
	icon: SearchProviderType;
}

export const SEARCH_PROVIDER_CATALOG: SearchProviderInfo[] = [
	{
		id: "tavily",
		name: "Tavily",
		description:
			"AI-optimized search with chunked, source-aware results. Great general-purpose choice.",
		placeholder: "tvly-...",
		docsUrl: "https://app.tavily.com/home",
		icon: "tavily",
	},
	{
		id: "brave",
		name: "Brave Search",
		description:
			"Fast, privacy-first results from Brave's independent web index.",
		placeholder: "BSA...",
		docsUrl: "https://api-dashboard.search.brave.com/app/keys",
		icon: "brave",
	},
	{
		id: "firecrawl",
		name: "Firecrawl",
		description:
			"Search plus full-page scraping and clean markdown extraction.",
		placeholder: "fc-...",
		docsUrl: "https://www.firecrawl.dev/app/api-keys",
		icon: "firecrawl",
	},
	{
		id: "serper",
		name: "Serper",
		description:
			"Google-backed results with knowledge-graph enrichment and page scraping.",
		placeholder: "Your Serper API key",
		docsUrl: "https://serper.dev/api-key",
		icon: "serper",
	},
];

export const SEARCH_PROVIDER_IDS = SEARCH_PROVIDER_CATALOG.map(
	(provider) => provider.id,
);

export function isSearchProviderType(
	value: unknown,
): value is SearchProviderType {
	return (
		typeof value === "string" &&
		(SEARCH_PROVIDER_IDS as string[]).includes(value)
	);
}

export function getSearchProviderInfo(
	id: SearchProviderType,
): SearchProviderInfo {
	return (
		SEARCH_PROVIDER_CATALOG.find((provider) => provider.id === id) ??
		SEARCH_PROVIDER_CATALOG[0]
	);
}
