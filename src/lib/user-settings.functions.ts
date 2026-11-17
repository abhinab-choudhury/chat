import { createServerFn } from "@tanstack/react-start";

export const getUserSettings = createServerFn({ method: "GET" }).handler(
	async () => {
		const { getPublicUserSettings } = await import("./user-settings.server");
		return getPublicUserSettings();
	},
);
