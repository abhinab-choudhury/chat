import { create } from "zustand";
import { getUserSettings } from "#/lib/user-settings.functions";
import type { PublicUserSettings } from "#/lib/user-settings-types";

type SettingsStatus = "idle" | "loading" | "ready" | "error";

interface UserSettingsState {
	status: SettingsStatus;
	settings: PublicUserSettings | null;
	error: string | null;
	/** Loads server provider availability without exposing credentials. */
	refresh: () => Promise<PublicUserSettings | null>;
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
