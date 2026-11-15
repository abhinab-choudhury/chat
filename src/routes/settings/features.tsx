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
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { useModelStore } from "#/store/model-store";

export const Route = createFileRoute("/settings/features")({
	component: FeaturesSettings,
});

function FeaturesSettings() {
	const webSearchEnabled = useModelStore((s) => s.webSearchEnabled);
	const setWebSearchEnabled = useModelStore((s) => s.setWebSearchEnabled);
	const webSearchLimit = useModelStore((s) => s.webSearchLimit);
	const setWebSearchLimit = useModelStore((s) => s.setWebSearchLimit);
	const webSearchScrape = useModelStore((s) => s.webSearchScrape);
	const setWebSearchScrape = useModelStore((s) => s.setWebSearchScrape);
	const memoryEnabled = useModelStore((s) => s.memoryEnabled);
	const setMemoryEnabled = useModelStore((s) => s.setMemoryEnabled);

	const [draftLimit, setDraftLimit] = React.useState(webSearchLimit);
	React.useEffect(() => setDraftLimit(webSearchLimit), [webSearchLimit]);

	return (
		<SettingsLayout
			title="Features"
			description="Toggle optional capabilities like web search and memory."
		>
			<Card>
				<CardHeader>
					<CardTitle>Web search</CardTitle>
					<CardDescription>
						Allow the assistant to search the web for up-to-date information.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<Label htmlFor="ws-enabled" className="text-sm font-medium">
							Enable web search
						</Label>
						<Switch
							id="ws-enabled"
							checked={webSearchEnabled}
							onCheckedChange={setWebSearchEnabled}
						/>
					</div>
					<div className="flex items-center justify-between gap-4">
						<Label htmlFor="ws-limit" className="text-sm font-medium">
							Result limit
						</Label>
						<Input
							id="ws-limit"
							type="number"
							min={1}
							max={20}
							value={draftLimit}
							onChange={(e) => setDraftLimit(Number(e.target.value))}
							className="w-20"
						/>
					</div>
					<div className="flex justify-end">
						<Button
							disabled={draftLimit === webSearchLimit}
							onClick={() => setWebSearchLimit(draftLimit)}
						>
							Save
						</Button>
					</div>
					<div className="flex items-center justify-between">
						<Label htmlFor="ws-scrape" className="text-sm font-medium">
							Scrape page content
						</Label>
						<Switch
							id="ws-scrape"
							checked={webSearchScrape}
							onCheckedChange={setWebSearchScrape}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Memory layer</CardTitle>
					<CardDescription>
						Let the assistant recall context from past conversations via
						Supermemory.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between">
						<Label htmlFor="mem-enabled" className="text-sm font-medium">
							Enable memory layer
						</Label>
						<Switch
							id="mem-enabled"
							checked={memoryEnabled}
							onCheckedChange={setMemoryEnabled}
						/>
					</div>
				</CardContent>
			</Card>
		</SettingsLayout>
	);
}