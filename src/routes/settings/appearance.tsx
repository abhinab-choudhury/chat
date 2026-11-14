import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { SettingsLayout } from "#/components/settings/settings-layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/settings/appearance")({
	component: AppearanceSettings,
});

const THEMES = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
] as const;

function AppearanceSettings() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = React.useState(false);

	React.useEffect(() => {
		setMounted(true);
	}, []);

	const current = mounted ? (theme ?? "system") : "system";

	return (
		<SettingsLayout
			title="Appearance"
			description="Customize how the app looks on your device."
		>
			<Card>
				<CardHeader>
					<CardTitle>Theme</CardTitle>
					<CardDescription>
						Choose between light, dark, or system theme.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						{THEMES.map(({ value, label, icon: Icon }) => (
							<button
								key={value}
								type="button"
								onClick={() => setTheme(value)}
								className={cn(
									"flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-accent",
									current === value && "border-primary bg-accent",
								)}
							>
								<Icon className="size-5" />
								<span className="font-medium">{label}</span>
							</button>
						))}
					</div>
					<div className="space-y-2">
						<Label className="text-sm font-medium text-muted-foreground">
							Current theme
						</Label>
						<p className="text-sm capitalize">{current}</p>
					</div>
				</CardContent>
			</Card>
		</SettingsLayout>
	);
}
