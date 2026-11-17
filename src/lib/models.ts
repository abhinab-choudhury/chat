export type ModelProvider = "gemini" | "openai";
export interface ChatModel {
	id: string;
	label: string;
	abilities?: string[];
	supportsDisablingReasoning?: boolean;
}
export const DEFAULT_SELECTED_MODEL = "gpt-5.6-luna";
export const DEFAULT_MODELS: ChatModel[] = [
	{
		id: "gpt-5.6-luna",
		label: "OpenAI · GPT-5.6 Luna",
		abilities: ["reasoning", "function_calling", "effort_control"],
		supportsDisablingReasoning: true,
	},
	...[
		"gemini-4-hydrogen",
		"gemini-3.8-flash",
		"gemini-3.6-flash",
		"gemini-3.5-flash-lite",
		"gemini-3.1-flash-lite",
	].map((id) => ({
		id,
		label: `Gemini · ${id.replace("gemini-", "")}`,
		abilities: id.includes("lite")
			? ["function_calling"]
			: ["reasoning", "function_calling", "effort_control"],
		supportsDisablingReasoning: true,
	})),
];
export function modelProvider(model: string): ModelProvider {
	if (/^gemini-[a-z0-9.-]+$/i.test(model)) return "gemini";
	if (/^(gpt-[a-z0-9.-]+|o[134](?:-[a-z0-9.-]+)?)$/i.test(model))
		return "openai";
	throw new Error("Choose a supported Gemini or OpenAI model.");
}
