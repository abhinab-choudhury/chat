import { createFileRoute } from "@tanstack/react-router";
import { UserIcon } from "lucide-react";
import * as React from "react";
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
import { Separator } from "#/components/ui/separator";
import { useSession } from "#/hooks/auth-hooks";

export const Route = createFileRoute("/settings/profile")({
	component: ProfileSettings,
});

function ProfileSettings() {
	const { data: session } = useSession();
	const user = session?.user;
	const [name, setName] = React.useState(user?.name ?? "");

	React.useEffect(() => {
		setName(user?.name ?? "");
	}, [user]);

	return (
		<div className="mx-auto w-full max-w-2xl px-4 py-8">
			<h1 className="mb-6 text-2xl font-bold tracking-tight">Profile</h1>
			<Card>
				<CardHeader>
					<CardTitle>Personal information</CardTitle>
					<CardDescription>Update your name and avatar.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center gap-4">
						<div className="flex size-16 items-center justify-center rounded-full bg-muted text-2xl font-semibold">
							{user?.name?.charAt(0)?.toUpperCase() ?? <UserIcon />}
						</div>
						<Button variant="outline" size="sm">
							Change avatar
						</Button>
					</div>
					<Separator />
					<div className="grid gap-2">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="email">Email</Label>
						<Input id="email" type="email" value={user?.email ?? ""} disabled />
					</div>
					<div className="flex justify-end">
						<Button>Save changes</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
