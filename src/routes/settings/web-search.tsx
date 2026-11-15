import { createFileRoute } from "@tanstack/react-router";
import {
	CheckCircle2,
	ExternalLink,
	Globe,
	Key,
	Loader2,
	Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { SearchProviderIcon } from "#/components/search/search-provider-icon";
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
import { SEARCH_PROVIDER_CATALOG } from "#/lib/search/provider-catalog";
import type { SearchProviderType } from "#/lib/search/types";
import {
	saveSearchApiKey,
	selectSearchApiProvider,
} from "#/lib/user-settings.functions";
import { useUserSettingsStore } from "#/store/user-settings-store";

export const Route = createFileRoute("/settings/web-search")({
	component: WebSearchSettings,
});

function WebSearchSettings() {
	const settings = useUserSettingsStore((state) => state.settings);
	const status = useUserSettingsStore((state) => state.status);
	const refresh = useUserSettingsStore((state) => state.refresh);
	const apply = useUserSettingsStore((state) => state.apply);

	const [drafts, setDrafts] = React.useState<Record<string, string>>({});
	const [busy, setBusy] = React.useState<string | null>(null);

	const providerName = (provider: SearchProviderType) =>
		SEARCH_PROVIDER_CATALOG.find((item) => item.id === provider)?.name ??
		provider;
	const activeProviderName = settings?.defaultSearchProvider
		? providerName(settings.defaultSearchProvider)
		: null;

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleSave = async (provider: SearchProviderType) => {
		setBusy(provider);
		try {
			const next = await saveSearchApiKey({
				data: {
					provider,
					apiKey: drafts[provider]?.trim() || undefined,
				},
			});
			apply(next);
			setDrafts((current) => ({ ...current, [provider]: "" }));
			toast.success(
				`${providerName(provider)} is now the default search provider`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save the key",
			);
		} finally {
			setBusy(null);
		}
	};

	const handleSelect = async (provider: SearchProviderType) => {
		setBusy(provider);
		try {
			const next = await selectSearchApiProvider({ data: { provider } });
			apply(next);
			toast.success(`Using ${providerName(provider)} for web search`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not select provider",
			);
		} finally {
			setBusy(null);
		}
	};

	const handleClear = async (provider: SearchProviderType) => {
		setBusy(provider);
		try {
			const next = await saveSearchApiKey({
				data: { provider, clear: true },
			});
			apply(next);
			setDrafts((current) => ({ ...current, [provider]: "" }));
			toast.success(`${providerName(provider)} key removed`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not remove the key",
			);
		} finally {
			setBusy(null);
		}
	};

	const loading = status === "loading" && !settings;

	return (
		<SettingsLayout
			title="Web Search"
			description="Choose the provider that powers the web_search tool. Only one provider is active at a time; you can store keys for several and switch whenever you like."
		>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Globe className="size-5" />
						Active provider
					</CardTitle>
					<CardDescription>
						{activeProviderName
							? `Requests currently use ${activeProviderName}. Toggle the globe in the chat composer to enable search for a message.`
							: "No search provider is active yet. Add a key below, then enable the globe toggle in the chat composer."}
					</CardDescription>
				</CardHeader>
			</Card>

			<div className="grid gap-4">
				{SEARCH_PROVIDER_CATALOG.map((provider) => {
					const providerStatus = settings?.searchProviders.find(
						(item) => item.id === provider.id,
					);
					const isActive =
						settings?.defaultSearchProvider === provider.id &&
						providerStatus?.configured;
					const configured = Boolean(providerStatus?.configured);
					const isBusy = busy === provider.id;

					return (
						<Card key={provider.id}>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<span className="flex size-8 items-center justify-center rounded-lg border bg-muted/20">
										<SearchProviderIcon
											provider={provider.id}
											className="size-5"
										/>
									</span>
									{provider.name}
									{isActive ? (
										<Badge variant="secondary" className="ml-auto gap-1">
											<CheckCircle2 className="size-3" />
											Active
										</Badge>
									) : configured ? (
										<Badge variant="outline" className="ml-auto">
											Saved {providerStatus?.keyHint ?? ""}
										</Badge>
									) : (
										<Badge variant="outline" className="ml-auto">
											Not configured
										</Badge>
									)}
								</CardTitle>
								<CardDescription className="flex items-center gap-2">
									<span>{provider.description}</span>
									<a
										href={provider.docsUrl}
										target="_blank"
										rel="noreferrer"
										className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
									>
										Get a key
										<ExternalLink className="size-3" />
									</a>
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor={`${provider.id}-key`}>API key</Label>
									<Input
										id={`${provider.id}-key`}
										type="password"
										autoComplete="off"
										value={drafts[provider.id] ?? ""}
										onChange={(event) =>
											setDrafts((current) => ({
												...current,
												[provider.id]: event.target.value,
											}))
										}
										placeholder={
											configured
												? "Paste a new key to rotate"
												: provider.placeholder
										}
										className="font-mono"
										disabled={loading}
									/>
								</div>
								<div className="flex flex-wrap justify-end gap-2">
									{configured ? (
										<>
											<Button
												variant="outline"
												onClick={() => void handleClear(provider.id)}
												disabled={isBusy}
											>
												<Trash2 className="size-4" />
												Remove
											</Button>
											{!isActive ? (
												<Button
													variant="secondary"
													onClick={() => void handleSelect(provider.id)}
													disabled={isBusy}
												>
													Use this provider
												</Button>
											) : null}
										</>
									) : null}
									<Button
										onClick={() => void handleSave(provider.id)}
										disabled={
											isBusy || (!configured && !drafts[provider.id]?.trim())
										}
									>
										{isBusy ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<Key className="size-4" />
										)}
										{isBusy
											? "Saving…"
											: configured
												? "Save key"
												: "Save & use"}
									</Button>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</SettingsLayout>
	);
}
