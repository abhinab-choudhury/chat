import { create } from "zustand";
import type { SearchProviderType } from "#/lib/search/types";
import { getUserSettings } from "#/lib/user-settings.functions";
import type { PublicUserSettings } from "#/lib/user-settings-types";

type SettingsStatus = "idle" | "loading" | "ready" | "error";

interface UserSettingsState {
	status: SettingsStatus;
	settings: PublicUserSettings | null;
	error: string | null;
	/** Loads (or reloads) the current user's BYOK configuration. */
	refresh: () => Promise<PublicUserSettings | null>;
	/** Applies a settings payload returned by a save mutation. */
	apply: (settings: PublicUserSettings) => void;
	clear: () => void;
}

export const useUserSettingsStore = create<UserSettingsState>((set, get) => ({
	status: "idle",
	settings: null,
	error: null,
	refresh: async () => {
		if (get().status === "loading") return get().settings;
		set({ status: "loading", error: null });
		try {
			const settings = await getUserSettings();
			set({ status: "ready", settings, error: null });
			return settings;
		} catch (error) {
			set({
				status: "error",
				error:
					error instanceof Error ? error.message : "Unable to load settings",
			});
			return null;
		}
	},
	apply: (settings) => set({ status: "ready", settings, error: null }),
	clear: () => set({ status: "idle", settings: null, error: null }),
}));

export function useHasSearchProvider(): boolean {
	return useUserSettingsStore((state) =>
		Boolean(
			state.settings?.defaultSearchProvider &&
				state.settings.searchProviders.some(
					(provider) =>
						provider.id === state.settings?.defaultSearchProvider &&
						provider.configured,
				),
		),
	);
}

export function useHasGeminiKey(): boolean {
	return useUserSettingsStore((state) => Boolean(state.settings?.hasGeminiKey));
}

export function getSearchProviderStatus(
	settings: PublicUserSettings | null,
	provider: SearchProviderType,
) {
	return settings?.searchProviders.find((item) => item.id === provider);
}
