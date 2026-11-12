import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { Button } from "#/components/ui/button";

type Theme = "system" | "light" | "dark";

export function ThemeToggle({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = React.useState(false);

	React.useEffect(() => {
		setMounted(true);
	}, []);

	const current = (mounted ? (theme as Theme) : "system") ?? "system";

	const cycle = () => {
		if (current === "system") setTheme("light");
		else if (current === "light") setTheme("dark");
		else setTheme("system");
	};

	const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
	const label =
		current === "light" ? "Light" : current === "dark" ? "Dark" : "System";

	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			className={className}
			onClick={cycle}
			aria-label={`Theme: ${label}. Click to switch.`}
			title={`Theme: ${label}`}
		>
			<Icon className="size-4" />
			<span className="sr-only">{label}</span>
		</Button>
	);
}
