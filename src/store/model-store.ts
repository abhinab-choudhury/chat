import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
	DEFAULT_SHORTCUTS,
	type ShortcutAction,
	type ShortcutBindings,
} from "#/lib/shortcuts";

export interface ChatModel {
	id: string;
	label: string;
	abilities?: string[];
	supportsDisablingReasoning?: boolean;
}

export const DEFAULT_MODELS: ChatModel[] = [
	{
		id: "gemini-4-hydrogen",
		label: "Gemini 4 Hydrogen",
		abilities: ["reasoning", "function_calling", "effort_control"],
		supportsDisablingReasoning: true,
	},
	{
		id: "gemini-3.8-flash",
		label: "Gemini 3.8 Flash",
		abilities: ["reasoning", "function_calling", "effort_control"],
		supportsDisablingReasoning: true,
	},
	{
		id: "gemini-3.6-flash",
		label: "Gemini 3.6 Flash",
		abilities: ["reasoning", "function_calling", "effort_control"],
		supportsDisablingReasoning: true,
	},
	{
		id: "gemini-3.5-flash-lite",
		label: "Gemini 3.5 Flash-Lite",
		abilities: ["function_calling"],
		supportsDisablingReasoning: true,
	},
	{
		id: "gemini-3.1-flash-lite",
		label: "Gemini 3.1 Flash-Lite",
		abilities: ["function_calling"],
		supportsDisablingReasoning: true,
	},
];

export const DEFAULT_SELECTED_MODEL = "gemini-3.5-flash-lite";

export type ReasoningEffort = "off" | "low" | "medium" | "high";

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";

type McpOverrides = Record<string, Record<string, boolean>>;

export interface ModelStoreState {
	selectedModel: string;
	availableModels: ChatModel[];
	reasoningEffort: ReasoningEffort;
	enabledTools: string[];
	toolsEnabled: boolean;
	webSearchEnabled: boolean;
	webSearchLimit: number;
	webSearchScrape: boolean;
	memoryEnabled: boolean;
	keyboardShortcutsEnabled: boolean;
	shortcuts: ShortcutBindings;
	defaultMcpOverrides: Record<string, boolean>;
	mcpOverrides: McpOverrides;
}

export interface ModelStoreActions {
	setSelectedModel: (model: string) => void;
	setAvailableModels: (models: ChatModel[]) => void;
	setReasoningEffort: (effort: ReasoningEffort) => void;
	setEnabledTools: (tools: string[]) => void;
	toggleTool: (tool: string) => void;
	setToolsEnabled: (enabled: boolean) => void;
	setWebSearchEnabled: (enabled: boolean) => void;
	setWebSearchLimit: (limit: number) => void;
	setWebSearchScrape: (scrape: boolean) => void;
	setMemoryEnabled: (enabled: boolean) => void;
	setKeyboardShortcutsEnabled: (enabled: boolean) => void;
	setShortcut: (action: ShortcutAction, combo: string) => void;
	resetShortcuts: () => void;
	setDefaultMcpOverride: (server: string, enabled: boolean) => void;
	setMcpOverride: (threadId: string, server: string, enabled: boolean) => void;
	getMcpOverrides: (threadId: string) => Record<string, boolean>;
	getEffectiveMcpOverrides: (threadId?: string) => Record<string, boolean>;
	clearMcpOverrides: (threadId: string) => void;
	clearAllMcpOverrides: () => void;
	reset: () => void;
}

export type ModelStore = ModelStoreState & ModelStoreActions;

const initialState: ModelStoreState = {
	selectedModel: DEFAULT_SELECTED_MODEL,
	availableModels: DEFAULT_MODELS,
	reasoningEffort: DEFAULT_REASONING_EFFORT,
	enabledTools: [],
	toolsEnabled: true,
	webSearchEnabled: true,
	webSearchLimit: 5,
	webSearchScrape: true,
	memoryEnabled: true,
	keyboardShortcutsEnabled: true,
	shortcuts: DEFAULT_SHORTCUTS,
	defaultMcpOverrides: {},
	mcpOverrides: {},
};

export const useModelStore = create<ModelStore>()(
	persist(
		(set, get) => ({
			...initialState,

			setSelectedModel: (selectedModel) => set({ selectedModel }),

			setAvailableModels: (availableModels) => set({ availableModels }),

			setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),

			setEnabledTools: (enabledTools) => set({ enabledTools }),

			toggleTool: (tool) =>
				set((state) => ({
					enabledTools: state.enabledTools.includes(tool)
						? state.enabledTools.filter((t) => t !== tool)
						: [...state.enabledTools, tool],
				})),

			setToolsEnabled: (toolsEnabled) => set({ toolsEnabled }),

			setWebSearchEnabled: (webSearchEnabled) => set({ webSearchEnabled }),
			setWebSearchLimit: (webSearchLimit) => set({ webSearchLimit }),
			setWebSearchScrape: (webSearchScrape) => set({ webSearchScrape }),
			setMemoryEnabled: (memoryEnabled) => set({ memoryEnabled }),
			setKeyboardShortcutsEnabled: (keyboardShortcutsEnabled) =>
				set({ keyboardShortcutsEnabled }),
			setShortcut: (action, combo) =>
				set((state) => ({
					shortcuts: { ...state.shortcuts, [action]: combo },
				})),
			resetShortcuts: () => set({ shortcuts: DEFAULT_SHORTCUTS }),

			setDefaultMcpOverride: (server, enabled) =>
				set((state) => ({
					defaultMcpOverrides: {
						...state.defaultMcpOverrides,
						[server]: enabled,
					},
				})),

			setMcpOverride: (threadId, server, enabled) =>
				set((state) => ({
					mcpOverrides: {
						...state.mcpOverrides,
						[threadId]: {
							...(state.mcpOverrides[threadId] ?? {}),
							[server]: enabled,
						},
					},
				})),

			getMcpOverrides: (threadId) => get().mcpOverrides[threadId] ?? {},

			getEffectiveMcpOverrides: (threadId) => {
				const state = get();
				if (!threadId) return { ...state.defaultMcpOverrides };
				return {
					...state.defaultMcpOverrides,
					...(state.mcpOverrides[threadId] ?? {}),
				};
			},

			clearMcpOverrides: (threadId) =>
				set((state) => {
					const mcpOverrides = { ...state.mcpOverrides };
					delete mcpOverrides[threadId];
					return { mcpOverrides };
				}),

			clearAllMcpOverrides: () => set({ mcpOverrides: {} }),

			reset: () => set({ ...initialState }),
		}),
		{
			name: "model-storage",
			storage: createJSONStorage(() => localStorage),
			version: 3,
			migrate: (persisted: unknown) => {
				// BYOK secrets moved to encrypted server-side storage; drop any
				// plaintext keys left behind by older browser builds.
				const p = { ...((persisted ?? {}) as Record<string, unknown>) };
				delete p.geminiApiKey;
				delete p.webSearchProvider;
				delete p.webSearchApiKey;
				delete p.supermemoryApiKey;
				delete p.onboardingCompleted;
				return p;
			},
			partialize: (state) => ({
				selectedModel: state.selectedModel,
				reasoningEffort: state.reasoningEffort,
				enabledTools: state.enabledTools,
				toolsEnabled: state.toolsEnabled,
				webSearchEnabled: state.webSearchEnabled,
				webSearchLimit: state.webSearchLimit,
				webSearchScrape: state.webSearchScrape,
				memoryEnabled: state.memoryEnabled,
				keyboardShortcutsEnabled: state.keyboardShortcutsEnabled,
				shortcuts: state.shortcuts,
				defaultMcpOverrides: state.defaultMcpOverrides,
				mcpOverrides: state.mcpOverrides,
			}),
		},
	),
);

export const modelStore = useModelStore;
export default useModelStore;
