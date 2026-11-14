import { Link } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

export function RouteErrorComponent({ error, reset }: ErrorComponentProps) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "An unexpected error occurred.";

	return (
		<div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="text-xl font-semibold">Something went wrong</h1>
			<p className="max-w-md text-sm text-muted-foreground">{message}</p>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={() => reset()}
					className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
				>
					Try again
				</button>
				<Link
					to="/"
					className="rounded-md border px-4 py-2 text-sm"
				>
					Go home
				</Link>
			</div>
		</div>
	);
}
