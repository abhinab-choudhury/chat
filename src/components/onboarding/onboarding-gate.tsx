import * as React from "react";
import { useSession } from "#/hooks/auth-hooks";
import { useUserSettingsStore } from "#/store/user-settings-store";
import { OnboardingDialog } from "./onboarding-dialog";

export function OnboardingGate() {
	const { user, isPending } = useSession();
	const status = useUserSettingsStore((state) => state.status);
	const settings = useUserSettingsStore((state) => state.settings);
	const refresh = useUserSettingsStore((state) => state.refresh);
	const clear = useUserSettingsStore((state) => state.clear);
	const [open, setOpen] = React.useState(false);

	React.useEffect(() => {
		if (user?.id) {
			void refresh();
		} else {
			clear();
		}
	}, [user?.id, refresh, clear]);

	React.useEffect(() => {
		if (isPending || !user) {
			setOpen(false);
			return;
		}
		if (status === "loading" || status === "idle") return;
		if (status === "error") {
			setOpen(true);
			return;
		}
		const needsSetup =
			!settings?.onboardingCompleted || !settings?.hasGeminiKey;
		setOpen(needsSetup);
	}, [isPending, user, status, settings]);

	if (isPending || !user) return null;

	return <OnboardingDialog open={open} onComplete={() => setOpen(false)} />;
}
