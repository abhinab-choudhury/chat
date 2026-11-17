export const agentPhases = {
	preparing: "Preparing your response…",
	memory: "Loading conversation context…",
	researching: "Researching and drafting…",
	validating: "Checking claims against sources…",
	saving: "Saving your answer…",
	complete: "Complete",
} as const;
export type AgentPhase = keyof typeof agentPhases;
export function isAgentPhase(value: unknown): value is AgentPhase {
	return typeof value === "string" && Object.hasOwn(agentPhases, value);
}
