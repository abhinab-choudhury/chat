import * as React from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

interface RenameThreadDialogProps {
	open: boolean;
	initialTitle: string;
	onOpenChange: (open: boolean) => void;
	onRename: (title: string) => void;
}

export function RenameThreadDialog({
	open,
	initialTitle,
	onOpenChange,
	onRename,
}: RenameThreadDialogProps) {
	const [title, setTitle] = React.useState(initialTitle);

	React.useEffect(() => {
		if (open) setTitle(initialTitle);
	}, [open, initialTitle]);

	const trimmed = title.trim();

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!trimmed) return;
		onRename(trimmed);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Rename thread</DialogTitle>
						<DialogDescription>
							Choose a new title for this conversation.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2 py-4">
						<Label htmlFor="thread-title">Title</Label>
						<Input
							id="thread-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							autoFocus
							maxLength={120}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!trimmed}>
							Save
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
