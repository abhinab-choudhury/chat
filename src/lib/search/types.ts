export type SearchProviderType = "serper";

export interface SearchResult {
	url: string;
	title: string;
	description: string;
	content?: string;
	markdown?: string;
}

export interface SearchOptions {
	signal?: AbortSignal;
	limit?: number;
	scrapeContent?: boolean;
	formats?: string[];
}

export interface SearchAdapter {
	readonly name: SearchProviderType;
	search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface SearchAdapterConfig {
	apiKey: string;
	baseUrl?: string;
}

/**
 * Trimmed result shape used for stream events, UI rendering and persistence
 * (heavy scraped content/markdown is only consumed by the model itself).
 */
export interface WebSearchResultSummary {
	url: string;
	title: string;
	description: string;
}

/** One web_search tool invocation, as streamed to the client and persisted. */
export interface WebSearchToolCall {
	/** AI SDK toolCallId, when known. */
	id?: string;
	query: string;
	state: "loading" | "done";
	results?: WebSearchResultSummary[];
	error?: string;
}

/** Tool data persisted alongside an assistant message. */
export interface WebSearchToolData {
	memories?: {
		id: string;
		threadId: string;
		question: string;
		questionAt: number;
	}[];
	validation?: {
		status: "supported" | "qualified" | "blocked";
		note: string;
		checkedAt: number;
	};
	webSearches: WebSearchToolCall[];
}

export function summarizeResults(
	results: SearchResult[],
): WebSearchResultSummary[] {
	return (results ?? []).map((r) => ({
		url: r.url,
		title: r.title,
		description: r.description,
	}));
}
