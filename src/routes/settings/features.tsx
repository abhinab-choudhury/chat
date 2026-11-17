import { createFileRoute, Link } from "@tanstack/react-router";
import { RotateCcwIcon } from "lucide-react";
import * as React from "react";
import { SettingsLayout } from "#/components/settings/settings-layout";
import { ShortcutRecorder } from "#/components/settings/shortcut-recorder";
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
import { Kbd } from "#/components/ui/kbd";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { SEARCH_PROVIDER_CATALOG } from "#/lib/search/provider-catalog";
import {
	DEFAULT_SHORTCUTS,
	SHORTCUT_ACTIONS,
	SHORTCUT_LABELS,
} from "#/lib/shortcuts";
import { useModelStore } from "#/store/model-store";
import { useUserSettingsStore } from "#/store/user-settings-store";

export const Route = createFileRoute("/settings/features")({
	component: FeaturesSettings,
});

function FeaturesSettings() {
	const settings = useUserSettingsStore((state) => state.settings);
	const refreshSettings = useUserSettingsStore((state) => state.refresh);
	const webSearchEnabled = useModelStore((s) => s.webSearchEnabled);
	const setWebSearchEnabled = useModelStore((s) => s.setWebSearchEnabled);
	const webSearchLimit = useModelStore((s) => s.webSearchLimit);
	const setWebSearchLimit = useModelStore((s) => s.setWebSearchLimit);
	const webSearchScrape = useModelStore((s) => s.webSearchScrape);
	const setWebSearchScrape = useModelStore((s) => s.setWebSearchScrape);
	const memoryEnabled = useModelStore((s) => s.memoryEnabled);
	const setMemoryEnabled = useModelStore((s) => s.setMemoryEnabled);
	const keyboardShortcutsEnabled = useModelStore(
		(s) => s.keyboardShortcutsEnabled,
	);
	const setKeyboardShortcutsEnabled = useModelStore(
		(s) => s.setKeyboardShortcutsEnabled,
	);
	const shortcuts = useModelStore((s) => s.shortcuts);
	const resetShortcuts = useModelStore((s) => s.resetShortcuts);

	const [draftLimit, setDraftLimit] = React.useState(webSearchLimit);
	React.useEffect(() => setDraftLimit(webSearchLimit), [webSearchLimit]);
	React.useEffect(() => {
		void refreshSettings();
	}, [refreshSettings]);

	const activeSearchProvider = settings?.defaultSearchProvider;
	const activeSearchProviderName = activeSearchProvider
		? (SEARCH_PROVIDER_CATALOG.find(
				(provider) => provider.id === activeSearchProvider,
			)?.name ?? activeSearchProvider)
		: null;
	const memoryAvailable = Boolean(settings?.memoryAvailable);

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
						{activeSearchProviderName ? (
							<Badge variant="secondary" className="ml-2 align-middle">
								{activeSearchProviderName}
							</Badge>
						) : (
							<span className="mt-2 block">
								No provider configured.{" "}
								<Link
									to="/settings/web-search"
									className="text-primary hover:underline"
								>
									Add one in Web Search settings
								</Link>
								.
							</span>
						)}
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
						Let the assistant recall context from past conversations.
						{memoryAvailable ? (
							<Badge variant="secondary" className="ml-2 align-middle">
								Enabled by server
							</Badge>
						) : (
							<span className="mt-2 block">
								Optional. Not configured on this server.
							</span>
						)}
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
							disabled={!memoryAvailable}
						/>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Keyboard shortcuts</CardTitle>
					<CardDescription>
						Jump to search or start a new chat without leaving the keyboard.
						Click a combination and press new keys to change it.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<Label htmlFor="kb-shortcuts" className="text-sm font-medium">
							Enable keyboard shortcuts
						</Label>
						<Switch
							id="kb-shortcuts"
							checked={keyboardShortcutsEnabled}
							onCheckedChange={setKeyboardShortcutsEnabled}
						/>
					</div>
					<ul
						className={
							keyboardShortcutsEnabled
								? "space-y-3 border-t pt-4"
								: "space-y-3 border-t pt-4 opacity-50"
						}
					>
						{SHORTCUT_ACTIONS.map((action) => (
							<li
								key={action}
								className="flex items-center justify-between gap-4 text-sm"
							>
								<span className="text-muted-foreground">
									{SHORTCUT_LABELS[action]}
								</span>
								<ShortcutRecorder
									action={action}
									disabled={!keyboardShortcutsEnabled}
								/>
							</li>
						))}
					</ul>
					<div className="flex items-center justify-between gap-4 border-t pt-4">
						<p className="text-xs text-muted-foreground">
							Use ⌘ instead of Ctrl on macOS. Combinations the browser reserves
							(like <Kbd>Ctrl</Kbd>+<Kbd>N</Kbd>, which opens a new window) are
							rejected.
						</p>
						<Button
							variant="outline"
							size="sm"
							onClick={resetShortcuts}
							disabled={
								JSON.stringify(shortcuts) === JSON.stringify(DEFAULT_SHORTCUTS)
							}
						>
							<RotateCcwIcon className="size-3.5" />
							Reset
						</Button>
					</div>
				</CardContent>
			</Card>
		</SettingsLayout>
	);
}
