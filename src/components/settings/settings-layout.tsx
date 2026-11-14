import type { ReactNode } from "react";

interface SettingsLayoutProps {
	title: string;
	description: string;
	action?: ReactNode;
	children: ReactNode;
}

export function SettingsLayout({
	title,
	description,
	action,
	children,
}: SettingsLayoutProps) {
	return (
		<div className="mx-auto max-w-4xl space-y-8">
			<div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			{children}
		</div>
	);
}
