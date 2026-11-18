export const EMBEDDING_MODEL = "qwen3-embedding:0.6b";
export const EMBEDDING_DIMENSIONS = 1024;
export const EMBEDDING_CHUNK_CHARS = 1000;
const cache = new Map<string, Promise<number[]>>();
let tail: Promise<unknown> = Promise.resolve();

/** Bound each local inference request without dropping the end of long messages. */
export function embeddingChunks(value: string) {
	const points = Array.from(value);
	const chunks: string[] = [];
	for (let i = 0; i < points.length; i += EMBEDDING_CHUNK_CHARS)
		chunks.push(points.slice(i, i + EMBEDDING_CHUNK_CHARS).join(""));
	return chunks.length ? chunks : [""];
}

function embedChunk(input: string, fetcher: typeof fetch): Promise<number[]> {
	const base = (
		process.env.OLLAMA_BASE_URL || "http://localhost:11434"
	).replace(/\/$/, "");
	const key = `${base}:${input}`;
	const existing = cache.get(key);
	if (existing) return existing;
	const work = tail
		.catch(() => {})
		.then(async () => {
			const response = await fetcher(`${base}/api/embed`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: EMBEDDING_MODEL,
					input,
					truncate: false,
					keep_alive: "5m",
				}),
				signal: AbortSignal.timeout(120000),
			});
			if (!response.ok)
				throw new Error(
					`Local Ollama embeddings unavailable (${response.status})`,
				);
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

/** Length-weighted pooling preserves one episode vector using every chunk. */
export async function embedText(
	value: string,
	query = false,
	fetcher: typeof fetch = fetch,
) {
	const chunks = embeddingChunks(value);
	const pooled = Array<number>(EMBEDDING_DIMENSIONS).fill(0);
	for (const chunk of chunks) {
		const input =
			(query
				? "Instruct: Given a search query, retrieve relevant past conversations\nQuery: "
				: "") + chunk;
		const vector = await embedChunk(input, fetcher);
		const magnitude = Math.hypot(...vector);
		const weight = Math.max(1, Array.from(chunk).length);
		for (let i = 0; i < pooled.length; i++)
			pooled[i] += (vector[i] / magnitude) * weight;
	}
	const magnitude = Math.hypot(...pooled);
	if (!magnitude) throw new Error("Invalid pooled embedding");
	return pooled.map((n) => n / magnitude);
}
