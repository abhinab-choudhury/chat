// Generation and review share a deadline; leave time for saving and proxy cleanup.
export const AGENT_LIMITS = {
	draftMs: 180_000,
	totalMs: 240_000,
	transportMs: 260_000,
	runExpiryMs: 300_000,
	maxOutputTokens: 8_000,
} as const;
