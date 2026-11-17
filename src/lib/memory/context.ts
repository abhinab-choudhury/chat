/** Bound model context while retaining IDs and explicitly marking excerpt truncation. */
export function episodeExcerpt<T extends Record<string, unknown>>(record: T) {
	const old = record.evidence as
		| { evidence?: Record<string, unknown>[] }
		| undefined;
	const sources = Array.isArray(old?.evidence) ? old.evidence : [];
	const result = {
		...record,
		question:
			typeof record.question === "string"
				? record.question.slice(0, 6000)
				: record.question,
		answer:
			typeof record.answer === "string"
				? record.answer.slice(0, 6000)
				: record.answer,
		evidence: {
			evidence: sources.slice(0, 5).map((s) => ({
				url: String(s.url ?? "").slice(0, 1000),
				title: String(s.title ?? "").slice(0, 200),
				description: String(s.description ?? "").slice(0, 500),
				content: String(s.content ?? "").slice(0, 500),
				retrievedAt: s.retrievedAt,
			})),
		},
		excerpt: true,
	};
	return result;
}
