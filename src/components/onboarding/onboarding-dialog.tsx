import {
	ArrowLeft,
	ArrowRight,
	Brain,
	CheckCircle2,
	Command,
	ExternalLink,
	Folder,
	Globe,
	History,
	Key,
	Loader2,
	Paperclip,
	PencilLine,
	Sparkles,
	Zap,
} from "lucide-react";
import * as React from "react";

import { GeminiIcon } from "#/components/brand-icons";
import { SearchProviderIcon } from "#/components/search/search-provider-icon";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { SEARCH_PROVIDER_CATALOG } from "#/lib/search/provider-catalog";
import type { SearchProviderType } from "#/lib/search/types";
import {
	completeOnboarding,
	saveGeminiApiKey,
	saveSearchApiKey,
} from "#/lib/user-settings.functions";
import { cn } from "#/lib/utils";
import { useUserSettingsStore } from "#/store/user-settings-store";

const FEATURE_HIGHLIGHTS = [
	{ icon: Globe, label: "Real-time web search" },
	{ icon: History, label: "Resumable streams" },
	{ icon: Brain, label: "Reasoning control" },
	{ icon: Folder, label: "Chat folders" },
	{ icon: Paperclip, label: "Attachments" },
	{ icon: PencilLine, label: "Edit & regenerate" },
	{ icon: Command, label: "Keyboard shortcuts" },
];

const STEPS = ["Welcome", "AI provider", "Web search", "Ready"] as const;

interface OnboardingDialogProps {
	open: boolean;
	onComplete: () => void;
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
	const settings = useUserSettingsStore((state) => state.settings);
	const status = useUserSettingsStore((state) => state.status);
	const apply = useUserSettingsStore((state) => state.apply);
	const storeError = useUserSettingsStore((state) => state.error);

	const [step, setStep] = React.useState(0);
	const [geminiDraft, setGeminiDraft] = React.useState("");
	const [providerDraft, setProviderDraft] = React.useState<
		SearchProviderType | ""
	>("");
	const [searchKeys, setSearchKeys] = React.useState<Record<string, string>>(
		{},
	);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const settingsRef = React.useRef(settings);
	settingsRef.current = settings;

	// Reset transient state every time the dialog opens.
	React.useEffect(() => {
		if (!open) return;
		setStep(0);
		setError(null);
		setGeminiDraft("");
		setSearchKeys({});
		setProviderDraft(settingsRef.current?.defaultSearchProvider ?? "");
	}, [open]);

	// Adopt the saved default if settings load after the dialog opened.
	React.useEffect(() => {
		if (!open || !settings) return;
		setProviderDraft(
			(current) => current || settings.defaultSearchProvider || "",
		);
	}, [open, settings]);

	const totalSteps = STEPS.length;
	const hasGeminiKey = Boolean(settings?.hasGeminiKey);
	const geminiReady = hasGeminiKey || geminiDraft.trim().length > 0;

	const selectedProvider = providerDraft
		? SEARCH_PROVIDER_CATALOG.find((item) => item.id === providerDraft)
		: null;
	const providerStatus = providerDraft
		? settings?.searchProviders.find((item) => item.id === providerDraft)
		: null;
	const providerReady =
		!providerDraft ||
		Boolean(providerStatus?.configured) ||
		Boolean(searchKeys[providerDraft]?.trim());

	const next = () =>
		setStep((current) => Math.min(current + 1, totalSteps - 1));
	const prev = () => setStep((current) => Math.max(current - 1, 0));

	const handleFinish = async () => {
		setSaving(true);
		setError(null);
		try {
			let updated = settings;
			if (geminiDraft.trim()) {
				updated = await saveGeminiApiKey({
					data: { apiKey: geminiDraft.trim() },
				});
			}
			if (providerDraft) {
				const existing = updated?.searchProviders.find(
					(item) => item.id === providerDraft,
				);
				const newKey = searchKeys[providerDraft]?.trim();
				if (newKey || existing?.configured) {
					updated = await saveSearchApiKey({
						data: {
							provider: providerDraft,
							apiKey: newKey || undefined,
						},
					});
				}
			}
			updated = await completeOnboarding({ data: { completed: true } });
			if (updated) apply(updated);
			onComplete();
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Could not save your settings.",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={() => {}}>
			<DialogContent className="sm:max-w-2xl" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles className="size-5 text-primary" />
						Welcome to .Chat
					</DialogTitle>
					<DialogDescription>
						Set up your own provider keys. They are encrypted on the server and
						never sent back to your browser.
					</DialogDescription>
				</DialogHeader>

				{step === 0 && (
					<div className="space-y-5">
						<div className="flex flex-col items-center gap-3 text-center">
							<div className="flex size-16 items-center justify-center rounded-2xl border-2 border-primary/20 bg-primary/5">
								<Sparkles className="size-8 text-primary" />
							</div>
							<div className="space-y-1">
								<h3 className="text-xl font-bold">
									Your AI, your keys, your control
								</h3>
								<p className="text-sm text-muted-foreground">
									.Chat is a bring-your-own-key (BYOK) assistant. Connect your
									own Gemini key and, if you want live answers, a web search
									provider. Usage stays on your accounts and quota.
								</p>
							</div>
							<div className="flex flex-wrap justify-center gap-2">
								<Badge variant="secondary">BYOK</Badge>
								<Badge variant="secondary">Gemini</Badge>
								<Badge variant="secondary">Web search</Badge>
								<Badge variant="secondary">Private by default</Badge>
							</div>
						</div>

						<div>
							<p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
								What you get
							</p>
							<div className="flex flex-wrap gap-2">
								{FEATURE_HIGHLIGHTS.map(({ icon: Icon, label }) => (
									<Badge
										key={label}
										variant="secondary"
										className="gap-1.5 py-1"
									>
										<Icon className="size-3.5 text-primary" />
										{label}
									</Badge>
								))}
							</div>
						</div>
					</div>
				)}

				{step === 1 && (
					<div className="space-y-4">
						<div className="flex items-start gap-3">
							<div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/20">
								<GeminiIcon className="size-6" />
							</div>
							<div>
								<h3 className="text-lg font-semibold">Connect Gemini</h3>
								<p className="text-sm text-muted-foreground">
									All chat models run on your Gemini API key. Create a free key
									in Google AI Studio, then paste it below.
								</p>
							</div>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor="onboard-gemini">Gemini API key</Label>
								{hasGeminiKey ? (
									<Badge variant="secondary" className="gap-1">
										<CheckCircle2 className="size-3" />
										Connected {settings?.geminiKeyHint ?? ""}
									</Badge>
								) : (
									<Badge variant="outline">Required</Badge>
								)}
							</div>
							<Input
								id="onboard-gemini"
								type="password"
								autoComplete="off"
								value={geminiDraft}
								onChange={(event) => setGeminiDraft(event.target.value)}
								placeholder={
									hasGeminiKey ? "Replace existing key (optional)" : "AIza..."
								}
								className="font-mono"
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
					</div>
				)}

				{step === 2 && (
					<div className="space-y-4">
						<div>
							<h3 className="text-lg font-semibold">
								Choose a web search tool
							</h3>
							<p className="text-sm text-muted-foreground">
								Web search lets the assistant cite fresh information. Pick one
								provider and add its API key. You can change this later.
							</p>
						</div>

						<div className="grid gap-2 sm:grid-cols-2">
							{SEARCH_PROVIDER_CATALOG.map((provider) => {
								const selected = providerDraft === provider.id;
								const configured = settings?.searchProviders.find(
									(item) => item.id === provider.id,
								)?.configured;
								return (
									<button
										key={provider.id}
										type="button"
										onClick={() => setProviderDraft(provider.id)}
										className={cn(
											"flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent/60",
											selected && "border-primary bg-primary/5",
										)}
									>
										<SearchProviderIcon
											provider={provider.id}
											className="mt-0.5 size-5 shrink-0"
										/>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium">
													{provider.name}
												</span>
												{configured ? (
													<Badge variant="secondary" className="text-[10px]">
														Saved
													</Badge>
												) : null}
											</div>
											<p className="mt-0.5 text-xs text-muted-foreground">
												{provider.description}
											</p>
										</div>
									</button>
								);
							})}
						</div>

						{providerDraft ? (
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-2">
									<Label htmlFor="onboard-search-key">
										{selectedProvider?.name ?? providerDraft} API key
									</Label>
									<Badge variant="outline">Optional</Badge>
								</div>
								<Input
									id="onboard-search-key"
									type="password"
									autoComplete="off"
									value={searchKeys[providerDraft] ?? ""}
									onChange={(event) =>
										setSearchKeys((current) => ({
											...current,
											[providerDraft]: event.target.value,
										}))
									}
									placeholder={
										providerStatus?.configured
											? `Replace saved key ${providerStatus.keyHint ?? ""}`
											: (selectedProvider?.placeholder ?? "Paste API key")
									}
									className="font-mono"
								/>
								<div className="flex items-start justify-between gap-2">
									<p className="text-xs text-muted-foreground">
										You can skip this and add a search key later in Settings →
										Web Search.
									</p>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-7 shrink-0 px-2 text-xs"
										onClick={() => setProviderDraft("")}
									>
										Skip for now
									</Button>
								</div>
							</div>
						) : (
							<p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
								No provider selected. Web search will stay off until you add one
								in Settings → Web Search.
							</p>
						)}
					</div>
				)}

				{step === 3 && (
					<div className="space-y-4">
						<div className="flex flex-col items-center gap-2 text-center">
							<div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
								<Zap className="size-7 text-primary" />
							</div>
							<h3 className="text-xl font-bold">You're all set</h3>
							<p className="text-sm text-muted-foreground">
								Your keys are stored securely and can be updated anytime from
								Settings.
							</p>
						</div>
						<div className="space-y-2">
							<div className="flex items-center justify-between rounded-lg border p-3">
								<span className="text-sm">Gemini model access</span>
								<Badge
									variant={geminiReady ? "secondary" : "destructive"}
									className="gap-1"
								>
									{geminiReady ? (
										<CheckCircle2 className="size-3" />
									) : (
										<Key className="size-3" />
									)}
									{geminiReady ? "Ready" : "Missing key"}
								</Badge>
							</div>
							<div className="flex items-center justify-between rounded-lg border p-3">
								<span className="text-sm">Web search</span>
								<Badge variant="secondary" className="gap-1">
									{providerReady && providerDraft ? "Ready" : "Optional — off"}
								</Badge>
							</div>
						</div>
					</div>
				)}

				{(error || storeError) && (
					<p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
						{error ?? storeError}
					</p>
				)}

				<div className="flex items-center justify-between border-t pt-4">
					{step > 0 ? (
						<Button variant="ghost" size="sm" onClick={prev} disabled={saving}>
							<ArrowLeft className="size-4" />
							Back
						</Button>
					) : (
						<div className="text-xs text-muted-foreground">
							{status === "loading" ? "Loading your settings…" : "Step 1 of 4"}
						</div>
					)}

					<div className="flex gap-1">
						{Array.from({ length: totalSteps }).map((_, index) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length step indicator
								key={index}
								className={cn(
									"h-2 w-2 rounded-full transition-all",
									index === step
										? "w-6 bg-primary"
										: index < step
											? "bg-primary/60"
											: "bg-muted-foreground/20",
								)}
							/>
						))}
					</div>

					{step < totalSteps - 1 ? (
						<Button
							size="sm"
							onClick={next}
							disabled={
								(step === 1 && !geminiReady) || (step === 2 && !providerReady)
							}
						>
							Next
							<ArrowRight className="size-4" />
						</Button>
					) : (
						<Button
							size="sm"
							onClick={() => void handleFinish()}
							disabled={saving || !geminiReady}
						>
							{saving ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Key className="size-4" />
							)}
							{saving ? "Saving…" : "Start chatting"}
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
