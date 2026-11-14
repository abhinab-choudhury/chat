import type {
	SearchAdapter,
	SearchAdapterConfig,
	SearchOptions,
	SearchResult
} from "./types";

interface BraveSearchResponse {
	web?: {
		results: Array<{
			title: string;
			url: string;
			description?: string;
		}>;
	};
}

export class BraveSearchAdapter implements SearchAdapter {
	readonly name = "brave" as const;
	private config: SearchAdapterConfig & {
		country?: string;
		searchLang?: string;
		safesearch?: "off" | "moderate" | "strict";
	};

	constructor(config: SearchAdapterConfig) {
		this.config = {
			baseUrl: "https://api.search.brave.com/res/v1/web/search",
			country: "US",
			searchLang: "en",
			safesearch: "moderate",
			...config,
		};
	}

	async search(
		query: string,
		options: SearchOptions = {},
	): Promise<SearchResult[]> {
		const { limit = 5 } = options;

		const params = new URLSearchParams({
			q: query,
			count: Math.min(limit, 20).toString(),
			country: this.config.country ?? "US",
			search_lang: this.config.searchLang ?? "en",
			safesearch: this.config.safesearch ?? "moderate",
		});

		try {
			const response = await fetch(`${this.config.baseUrl}?${params}`, {
				method: "GET",
				headers: {
					Accept: "application/json",
					"X-Subscription-Token": this.config.apiKey,
				},
			});

			if (!response.ok) {
				throw new Error(
					`Brave search failed: ${response.status} ${response.statusText}`,
				);
			}

			const data = (await response.json()) as BraveSearchResponse;

			if (!data.web?.results) {
				return [];
			}

			return data.web.results.map((item) => ({
				url: item.url,
				title: item.title,
				description: item.description || "",
			}));
		} catch (error) {
			console.error("Brave search error:", error);
			throw new Error(
				`Failed to search with Brave: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}
}
