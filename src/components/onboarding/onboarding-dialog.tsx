import * as React from "react";
import { Key, Sparkles } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useModelStore } from "#/store/model-store";

export function OnboardingDialog({
	open,
	onComplete,
}: {
	open: boolean;
	onComplete: () => void;
}) {
	const geminiApiKey = useModelStore((s) => s.geminiApiKey);
	const setGeminiApiKey = useModelStore((s) => s.setGeminiApiKey);
	const setOnboardingCompleted = useModelStore((s) => s.setOnboardingCompleted);

	const [key, setKey] = React.useState(geminiApiKey);

	React.useEffect(() => {
		setKey(geminiApiKey);
	}, [geminiApiKey]);

	const handleSave = () => {
		setGeminiApiKey(key.trim());
		setOnboardingCompleted(true);
		onComplete();
	};

	const handleSkip = () => {
		setOnboardingCompleted(true);
		onComplete();
	};

	return (
		<Dialog open={open} onOpenChange={() => {}}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles className="size-5 text-primary" />
						Welcome to .Chat
					</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Bring your own Gemini API key to use your own quota. You can also rely on
						the server key if one is configured. Get a free key at
						aistudio.google.com.
					</p>
					<div className="space-y-2">
						<Label htmlFor="gemini-key">Gemini API key</Label>
						<Input
							id="gemini-key"
							type="password"
							value={key}
							onChange={(e) => setKey(e.target.value)}
							placeholder="AIza..."
							className="font-mono"
						/>
					</div>
					<div className="flex justify-end gap-2">
						<Button variant="ghost" onClick={handleSkip}>
							Skip
						</Button>
						<Button onClick={handleSave}>
							<Key className="size-4" />
							Save & continue
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
