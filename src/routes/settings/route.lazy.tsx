import { createLazyFileRoute, Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

export const Route = createLazyFileRoute("/settings")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="mx-auto w-full max-w-2xl px-4 py-8">
			<h1 className="mb-6 text-2xl font-bold tracking-tight">Settings</h1>
			<div className="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Profile</CardTitle>
						<CardDescription>Manage your account details.</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild variant="outline" className="w-full">
							<Link to="/settings/profile">Open</Link>
						</Button>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Models</CardTitle>
						<CardDescription>Choose your default AI model.</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild variant="outline" className="w-full">
							<Link to="/settings/models">Open</Link>
						</Button>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Usage</CardTitle>
						<CardDescription>View your usage statistics.</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild variant="outline" className="w-full">
							<Link to="/settings/usage">Open</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
