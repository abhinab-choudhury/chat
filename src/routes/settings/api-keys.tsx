import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { SettingsLayout } from "#/components/settings/settings-layout";
import { useModelStore } from "#/store/model-store";

export const Route = createFileRoute("/settings/api-keys")({
	component: ApiKeysSettings,
});

function ApiKeysSettings() {
	const geminiApiKey = useModelStore((s) => s.geminiApiKey);
	const setGeminiApiKey = useModelStore((s) => s.setGeminiApiKey);
	const [draft, setDraft] = React.useState(geminiApiKey);

	React.useEffect(() => {
		setDraft(geminiApiKey);
	}, [geminiApiKey]);

	return (
		<SettingsLayout
			title="API Keys"
			description="Manage your own API keys (BYOK). Server keys are used as fallback."
		>
			<Card>
				<CardHeader>
					<CardTitle>Gemini API key</CardTitle>
					<CardDescription>
						Used for all Gemini models. Leave empty to use the server key.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="gemini-key">API key</Label>
						<Input
							id="gemini-key"
							type="password"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder="AIza..."
							className="font-mono"
						/>
					</div>
					<div className="flex justify-end">
						<Button
							disabled={draft === geminiApiKey}
							onClick={() => setGeminiApiKey(draft.trim())}
						>
							Save
						</Button>
					</div>
				</CardContent>
			</Card>
		</SettingsLayout>
	);
}
