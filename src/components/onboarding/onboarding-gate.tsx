import * as React from "react";
import { useSession } from "#/hooks/auth-hooks";
import { useModelStore } from "#/store/model-store";
import { OnboardingDialog } from "./onboarding-dialog";

export function OnboardingGate() {
	const { user, isPending } = useSession();
	const onboardingCompleted = useModelStore((s) => s.onboardingCompleted);
	const [open, setOpen] = React.useState(false);

	React.useEffect(() => {
		if (!isPending && user && !onboardingCompleted) {
			setOpen(true);
		} else {
			setOpen(false);
		}
	}, [isPending, user, onboardingCompleted]);

	if (isPending || !user) return null;

	return (
		<OnboardingDialog
			open={open}
			onComplete={() => setOpen(false)}
		/>
	);
}
