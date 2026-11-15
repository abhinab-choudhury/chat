import { createFileRoute } from "@tanstack/react-router";
import {
	CheckCircle2,
	ExternalLink,
	Key,
	Loader2,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { GeminiIcon } from "#/components/brand-icons";
import { SettingsLayout } from "#/components/settings/settings-layout";
import { Badge } from "#/components/ui/badge";
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
import { saveGeminiApiKey } from "#/lib/user-settings.functions";
import { useUserSettingsStore } from "#/store/user-settings-store";

export const Route = createFileRoute("/settings/api-keys")({
	component: ApiKeysSettings,
});

function ApiKeysSettings() {
	const settings = useUserSettingsStore((state) => state.settings);
	const status = useUserSettingsStore((state) => state.status);
	const refresh = useUserSettingsStore((state) => state.refresh);
	const apply = useUserSettingsStore((state) => state.apply);

	const [geminiDraft, setGeminiDraft] = React.useState("");
	const [savingGemini, setSavingGemini] = React.useState(false);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleSaveGemini = async (apiKey?: string, clear = false) => {
		setSavingGemini(true);
		try {
			const next = await saveGeminiApiKey({
				data: clear ? { clear: true } : { apiKey: apiKey?.trim() ?? "" },
			});
			apply(next);
			setGeminiDraft("");
			toast.success(clear ? "Gemini key removed" : "Gemini key saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save the key",
			);
		} finally {
			setSavingGemini(false);
		}
	};

	const loading = status === "loading" && !settings;

	return (
		<SettingsLayout
			title="AI Provider"
			description="Bring your own model keys. Keys are encrypted before storage and never sent back to the browser."
		>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<GeminiIcon className="size-5" />
						Gemini
						{settings?.hasGeminiKey ? (
							<Badge variant="secondary" className="ml-auto gap-1">
								<CheckCircle2 className="size-3" />
								Configured {settings.geminiKeyHint ?? ""}
							</Badge>
						) : (
							<Badge variant="outline" className="ml-auto">
								Required
							</Badge>
						)}
					</CardTitle>
					<CardDescription>
						Powers every chat model. Create a key in Google AI Studio and paste
						it here.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="gemini-key">API key</Label>
						<Input
							id="gemini-key"
							type="password"
							autoComplete="off"
							value={geminiDraft}
							onChange={(event) => setGeminiDraft(event.target.value)}
							placeholder={
								settings?.hasGeminiKey ? "Paste a new key to rotate" : "AIza..."
							}
							className="font-mono"
							disabled={loading}
						/>
						<a
							href="https://aistudio.google.com/apikey"
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
						>
							Get a Gemini API key
							<ExternalLink className="size-3" />
						</a>
					</div>
					<div className="flex flex-wrap justify-end gap-2">
						{settings?.hasGeminiKey ? (
							<Button
								variant="outline"
								onClick={() => void handleSaveGemini(undefined, true)}
								disabled={savingGemini}
							>
								<Trash2 className="size-4" />
								Remove
							</Button>
						) : null}
						<Button
							onClick={() => void handleSaveGemini(geminiDraft)}
							disabled={savingGemini || !geminiDraft.trim()}
						>
							{savingGemini ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Key className="size-4" />
							)}
							{savingGemini ? "Saving…" : "Save key"}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheck className="size-5" />
						How keys are stored
					</CardTitle>
					<CardDescription>
						Secrets are encrypted with AES-256-GCM on the server. Only a
						non-reversible hint is ever displayed, and chat requests are
						resolved entirely on the server.
					</CardDescription>
				</CardHeader>
			</Card>
		</SettingsLayout>
	);
}
