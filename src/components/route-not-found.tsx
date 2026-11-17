import { Link } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";
import { Button } from "#/components/ui/button";

export function RouteNotFoundComponent() {
	return (
		<section
			className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground"
			aria-labelledby="not-found-title"
		>
			<FileQuestion
				aria-hidden="true"
				className="size-10 text-muted-foreground"
			/>
			<h1 id="not-found-title" className="text-xl font-semibold">
				Page not found
			</h1>
			<p className="max-w-md text-sm text-muted-foreground">
				This page may have moved, or the link may be incorrect.
			</p>
			<Button asChild variant="outline">
				<Link to="/">Back to chat</Link>
			</Button>
		</section>
	);
}
