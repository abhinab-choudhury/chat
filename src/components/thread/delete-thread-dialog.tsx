import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";

interface DeleteThreadDialogProps {
	open: boolean;
	threadTitle?: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function DeleteThreadDialog({
	open,
	threadTitle,
	onOpenChange,
	onConfirm,
}: DeleteThreadDialogProps) {
	const handleConfirm = () => {
		onConfirm();
		onOpenChange(false);
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete thread?</AlertDialogTitle>
					<AlertDialogDescription>
						{threadTitle
							? `“${threadTitle}” and all of its messages will be permanently deleted. This action cannot be undone.`
							: "This thread and all of its messages will be permanently deleted. This action cannot be undone."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						onClick={(e) => {
							e.preventDefault();
							handleConfirm();
						}}
					>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
