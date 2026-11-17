import { isSearchProviderType } from "./provider-catalog";
import { SerperSearchAdapter } from "./serper-search-adapter";
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
		case "serper":
			return new SerperSearchAdapter({ apiKey });
	}
}

/**
 * Serper search configured with a server-side API key.
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
				`No ${provider} API key configured. Set SERPER_API_KEY on the server.`,
			);
		}
		this.adapter = createAdapter(provider, resolvedKey);
	}

	async search(
		query: string,
		options: SearchOptions = {},
	): Promise<SearchResult[]> {
		const maxAttempts = 3;
		let lastError: unknown;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				return await this.adapter.search(query, options);
			} catch (error) {
				lastError = error;
				const message = error instanceof Error ? error.message : String(error);
				const isRateLimited =
					/\b429\b/.test(message) ||
					/rate.?limit/i.test(message) ||
					/too many requests/i.test(message);
				if (!isRateLimited || attempt === maxAttempts - 1) throw error;
				const delay = 500 * 2 ** attempt;
				await new Promise((resolve) => setTimeout(resolve, delay));
				if (options.signal?.aborted) throw error;
			}
		}
		throw lastError;
	}
}
