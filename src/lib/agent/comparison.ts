export interface ComparisonClaim {
	baselineEpisodeId: string | null;
	historicalClaim: string | null;
	currentEvidenceUrls: string[];
	verdict: string;
}
/** Host-enforced minimum provenance; a reviewer still needs to assess actual support. */
export function validateComparisons(
	claims: ComparisonClaim[],
	memories: Map<string, Record<string, unknown>>,
	allowed: Set<string>,
) {
	for (const claim of claims) {
		const baseline = claim.baselineEpisodeId
			? memories.get(claim.baselineEpisodeId)
			: undefined;
		if (claim.baselineEpisodeId && !baseline)
			throw new Error("Invalid baseline reference");
		if (claim.currentEvidenceUrls.some((url) => !allowed.has(url)))
			throw new Error("Invalid evidence reference");
		if (
			["unable to verify", "prior answer unsupported"].includes(claim.verdict)
		)
			continue;
		if (
			!baseline ||
			!claim.currentEvidenceUrls.length ||
			!claim.historicalClaim ||
			typeof baseline.answer !== "string" ||
			!baseline.answer.includes(claim.historicalClaim)
		)
			throw new Error(
				"Comparison lacks a quoted historical baseline or current evidence",
			);
		const prior = baseline.evidence as { evidence?: unknown[] } | null;
		if (claim.verdict === "changed" && !prior?.evidence?.length)
			throw new Error("A change requires dated historical support");
	}
}
