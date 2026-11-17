import { createFileRoute } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
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
import { cn } from "#/lib/utils";
import { DEFAULT_MODELS, useModelStore } from "#/store/model-store";

export const Route = createFileRoute("/settings/models")({
	component: ModelsSettings,
});

function ModelsSettings() {
	const selectedModel = useModelStore((s) => s.selectedModel);
	const setSelectedModel = useModelStore((s) => s.setSelectedModel);
	const [draft, setDraft] = React.useState(selectedModel);

	React.useEffect(() => {
		setDraft(selectedModel);
	}, [selectedModel]);

	return (
		<SettingsLayout
			title="Models"
			description="Choose Gemini or OpenAI for answers and tool calling."
		>
			<Card>
				<CardHeader>
					<CardTitle>Default model</CardTitle>
					<CardDescription>
						GPT-5.6 Luna is the inexpensive testing default. Configure
						OPENAI_API_KEY or GEMINI_API_KEY on the server for the selected
						provider.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					{DEFAULT_MODELS.map((m) => (
						<button
							key={m.id}
							type="button"
							onClick={() => setDraft(m.id)}
							className={cn(
								"flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent",
								draft === m.id && "border-primary bg-accent",
							)}
						>
							<span className="font-medium">{m.label}</span>
							{draft === m.id && <CheckIcon className="size-4 text-primary" />}
						</button>
					))}
					<div className="flex justify-end pt-2">
						<Button
							disabled={draft === selectedModel}
							onClick={() => setSelectedModel(draft)}
						>
							Save
						</Button>
					</div>
				</CardContent>
			</Card>
		</SettingsLayout>
	);
}
