import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { SettingsLayout } from "#/components/settings/settings-layout";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { cn } from "#/lib/utils";
import { type ReasoningEffort, useModelStore } from "#/store/model-store";

export const Route = createFileRoute("/settings/ai-options")({
	component: AiOptionsSettings,
});

const EFFORTS: {
	value: ReasoningEffort;
	label: string;
	description: string;
}[] = [
	{ value: "off", label: "Off", description: "No extended reasoning." },
	{
		value: "low",
		label: "Low",
		description: "Light reasoning for quick answers.",
	},
	{
		value: "medium",
		label: "Medium",
		description: "Balanced reasoning (default).",
	},
	{
		value: "high",
		label: "High",
		description: "Deep reasoning for complex tasks.",
	},
];

function AiOptionsSettings() {
	const reasoningEffort = useModelStore((s) => s.reasoningEffort);
	const setReasoningEffort = useModelStore((s) => s.setReasoningEffort);
	const toolsEnabled = useModelStore((s) => s.toolsEnabled);
	const setToolsEnabled = useModelStore((s) => s.setToolsEnabled);

	const [draftEffort, setDraftEffort] =
		React.useState<ReasoningEffort>(reasoningEffort);

	React.useEffect(() => {
		setDraftEffort(reasoningEffort);
	}, [reasoningEffort]);

	return (
		<SettingsLayout
			title="AI Options"
			description="Tune how the assistant reasons and uses tools."
		>
			<Card>
				<CardHeader>
					<CardTitle>Reasoning effort</CardTitle>
					<CardDescription>
						Control how much the model thinks before answering.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					{EFFORTS.map((e) => (
						<button
							key={e.value}
							type="button"
							onClick={() => setDraftEffort(e.value)}
							className={cn(
								"flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent",
								draftEffort === e.value && "border-primary bg-accent",
							)}
						>
							<div>
								<div className="font-medium">{e.label}</div>
								<div className="text-xs text-muted-foreground">
									{e.description}
								</div>
							</div>
						</button>
					))}
					<div className="flex justify-end pt-2">
						<Button
							disabled={draftEffort === reasoningEffort}
							onClick={() => setReasoningEffort(draftEffort)}
						>
							Save
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Tools</CardTitle>
					<CardDescription>
						Enable or disable tool usage for new conversations.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between">
						<Label htmlFor="tools-enabled" className="text-sm font-medium">
							Enable tools
						</Label>
						<Switch
							id="tools-enabled"
							checked={toolsEnabled}
							onCheckedChange={setToolsEnabled}
						/>
					</div>
				</CardContent>
			</Card>
		</SettingsLayout>
	);
}
