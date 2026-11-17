export const EMBEDDING_MODEL = "qwen3-embedding:0.6b";
export const EMBEDDING_DIMENSIONS = 1024;
const cache = new Map<string, Promise<number[]>>();
let tail: Promise<unknown> = Promise.resolve();
/** Local-only embedding traffic, serialized and coalesced. No Gemini fallback. */
export async function embedText(
	value: string,
	query = false,
	fetcher: typeof fetch = fetch,
) {
	const input =
		(query
			? "Instruct: Given a search query, retrieve relevant past conversations\nQuery: "
			: "") + value.slice(0, 16000);
	const key = `${process.env.OLLAMA_BASE_URL || "http://localhost:11434"}:${input}`;
	const existing = cache.get(key);
	if (existing) return existing;
	const work = tail
		.catch(() => {})
		.then(async () => {
			const response = await fetcher(
				`${(process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "")}/api/embed`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: EMBEDDING_MODEL,
						input,
						truncate: true,
						keep_alive: "5m",
					}),
					signal: AbortSignal.timeout(30000),
				},
			);
			if (!response.ok) throw new Error("Local Ollama embeddings unavailable");
			const payload = (await response.json()) as { embeddings?: number[][] };
			const vector = payload.embeddings?.[0];
			if (
				!vector ||
				vector.length !== EMBEDDING_DIMENSIONS ||
				vector.some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
				!vector.some((n) => n !== 0)
			)
				throw new Error("Invalid Ollama embedding");
			return vector;
		});
	tail = work;
	const oldest = cache.keys().next().value;
	if (cache.size >= 128 && oldest) cache.delete(oldest);
	cache.set(key, work);
	work.catch(() => {
		cache.delete(key);
	});
	return work;
}
