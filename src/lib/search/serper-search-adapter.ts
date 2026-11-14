import type {
	SearchAdapter,
	SearchAdapterConfig,
	SearchOptions,
	SearchResult
} from "./types";

interface SerperSearchResponse {
	organic: Array<{
		title: string;
		link: string;
		snippet: string;
		position: number;
	}>;
	knowledgeGraph?: {
		title: string;
		type: string;
		website: string;
		description: string;
		descriptionLink: string;
	};
}

interface SerperScrapeResponse {
	url: string;
	title: string;
	text: string;
	markdown?: string;
}

const MAX_CONTEXT_WINDOW = 24000; // cap scraped context at 24k chars

export class SerperSearchAdapter implements SearchAdapter {
	readonly name = "serper" as const;
	private config: SearchAdapterConfig & { scrapeUrl?: string };

	constructor(config: SearchAdapterConfig) {
		this.config = {
			baseUrl: "https://google.serper.dev/search",
			scrapeUrl: "https://scrape.serper.dev",
			...config,
		};
	}

	async search(
		query: string,
		options: SearchOptions = {},
	): Promise<SearchResult[]> {
		const { limit = 5, scrapeContent = false } = options;

		try {
			const searchResults = await this.performSearch(query, limit);

			if (!scrapeContent) {
				return searchResults;
			}

			return await this.scrapeAndEnrichResults(searchResults);
		} catch (error) {
			console.error("Serper search error:", error);
			throw new Error(
				`Failed to search with Serper: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	private async performSearch(
		query: string,
		limit: number,
	): Promise<SearchResult[]> {
		const response = await fetch(this.config.baseUrl ?? "", {
			method: "POST",
			headers: {
				"X-API-KEY": this.config.apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				q: query,
				num: Math.min(limit, 10), // Serper typically returns up to 10 results
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Serper search failed: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as SerperSearchResponse;

		if (!data.organic || data.organic.length === 0) {
			return [];
		}

		const results: SearchResult[] = data.organic.map((item) => ({
			url: item.link,
			title: item.title,
			description: item.snippet || "",
		}));

		// Add knowledge graph as first result if available.
		if (data.knowledgeGraph) {
			results.unshift({
				url:
					data.knowledgeGraph.website || data.knowledgeGraph.descriptionLink,
				title: data.knowledgeGraph.title,
				description: data.knowledgeGraph.description,
			});
		}

		return results.slice(0, limit);
	}

	private async scrapeAndEnrichResults(
		results: SearchResult[],
	): Promise<SearchResult[]> {
		const scrapingJobs = results.map((result) =>
			this.scrapeUrl(result.url)
				.then((scrapedContent) => {
					if (scrapedContent) {
						return {
							...result,
							content: scrapedContent.text,
							markdown: scrapedContent.markdown || scrapedContent.text,
						};
					}
					return result;
				})
				.catch((error) => {
					console.warn(`Failed to scrape ${result.url}:`, error);
					return result;
				}),
		);

		const scrapedResults = await Promise.all(scrapingJobs);

		const enrichedResults: SearchResult[] = [];
		let totalContextUsed = 0;

		for (const result of scrapedResults) {
			if (result.content && totalContextUsed < MAX_CONTEXT_WINDOW) {
				const remainingContext = MAX_CONTEXT_WINDOW - totalContextUsed;
				if (result.content.length <= remainingContext) {
					enrichedResults.push(result);
					totalContextUsed += result.content.length;
				} else {
					const truncatedContent = `${result.content.substring(0, remainingContext)}...`;
					enrichedResults.push({
						...result,
						content: truncatedContent,
						markdown: result.markdown
							? `${result.markdown.substring(0, remainingContext)}...`
							: truncatedContent,
					});
					totalContextUsed = MAX_CONTEXT_WINDOW;
				}
			} else {
				const { content: _content, markdown: _markdown, ...rest } = result;
				enrichedResults.push(rest);
			}
		}

		return enrichedResults;
	}

	private async scrapeUrl(url: string): Promise<SerperScrapeResponse | null> {
		try {
			const response = await fetch(this.config.scrapeUrl ?? "", {
				method: "POST",
				headers: {
					"X-API-KEY": this.config.apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ url }),
			});

			if (!response.ok) {
				return null;
			}

			return (await response.json()) as SerperScrapeResponse;
		} catch (error) {
			console.warn(`Failed to scrape URL ${url}:`, error);
			return null;
		}
	}
}
