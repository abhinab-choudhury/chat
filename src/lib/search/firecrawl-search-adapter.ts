import type {
	SearchAdapter,
	SearchAdapterConfig,
	SearchOptions,
	SearchResult
} from "./types";

interface FirecrawlSearchResponse {
	success: boolean;
	data: Array<{
		url: string;
		title: string;
		description: string;
		markdown?: string;
		content?: string;
	}>;
}

export class FirecrawlSearchAdapter implements SearchAdapter {
	readonly name = "firecrawl" as const;
	private config: SearchAdapterConfig;

	constructor(config: SearchAdapterConfig) {
		this.config = {
			baseUrl: "https://api.firecrawl.dev",
			...config,
		};
	}

	async search(
		query: string,
		options: SearchOptions = {},
	): Promise<SearchResult[]> {
		const { limit = 5, scrapeContent = false, formats = [] } = options;

		const requestBody: Record<string, unknown> = {
			query,
			limit,
		};

		if (scrapeContent || formats.length > 0) {
			requestBody.scrapeOptions = {
				formats: formats.length > 0 ? formats : ["markdown", "links"],
			};
		}

		try {
			const response = await fetch(`${this.config.baseUrl}/v1/search`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.config.apiKey}`,
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				throw new Error(
					`Firecrawl search failed: ${response.status} ${response.statusText}`,
				);
			}

			const data = (await response.json()) as FirecrawlSearchResponse;

			if (!data.success) {
				throw new Error("Firecrawl search returned unsuccessful response");
			}

			return (data.data ?? []).map((item) => ({
				url: item.url,
				title: item.title,
				description: item.description,
				content: item.content,
				markdown: item.markdown,
			}));
		} catch (error) {
			console.error("Firecrawl search error:", error);
			throw new Error(
				`Failed to search with Firecrawl: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}
}
