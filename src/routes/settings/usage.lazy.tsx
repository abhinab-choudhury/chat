import { createLazyFileRoute } from "@tanstack/react-router";

import { useQuery } from "convex/react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { SettingsLayout } from "#/components/settings/settings-layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { useSession } from "#/hooks/auth-hooks";
import { api } from "../../../convex/_generated/api";

export const Route = createLazyFileRoute("/settings/usage")({
	component: UsageSettings,
});

function UsageSettings() {
	const { user, isPending } = useSession();
	const usage = useQuery(
		api.messages.getUserUsage,
		user?.id ? { userId: user.id } : "skip",
	);

	if (!isPending && !user) {
		return (
			<SettingsLayout
				title="Usage"
				description="Track your conversations and message activity."
			>
				<p className="text-sm text-muted-foreground">
					Sign in to view your usage.
				</p>
			</SettingsLayout>
		);
	}

	const daily = usage?.daily ?? [];
	const totalMessages = usage?.totalMessages ?? 0;
	const totalThreads = usage?.totalThreads ?? 0;
	const userMessages = usage?.userMessages ?? 0;
	const assistantMessages = usage?.assistantMessages ?? 0;

	return (
		<SettingsLayout
			title="Usage"
			description="Track your conversations and message activity."
		>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Conversations</CardDescription>
						<CardTitle className="text-2xl">{totalThreads}</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Total messages</CardDescription>
						<CardTitle className="text-2xl">{totalMessages}</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Your messages</CardDescription>
						<CardTitle className="text-2xl">{userMessages}</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Assistant replies</CardDescription>
						<CardTitle className="text-2xl">{assistantMessages}</CardTitle>
					</CardHeader>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Messages over the last 7 days</CardTitle>
					<CardDescription>
						Daily message activity across all your conversations.
					</CardDescription>
				</CardHeader>
				<CardContent className="h-72">
					{isPending || (user && usage === undefined) ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Loading usage…
						</div>
					) : daily.every((d) => d.messages === 0) ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							No activity in the last 7 days.
						</div>
					) : (
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={daily}>
								<CartesianGrid
									strokeDasharray="3 3"
									stroke="var(--border)"
									vertical={false}
								/>
								<XAxis
									dataKey="name"
									stroke="var(--muted-foreground)"
									tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
									axisLine={{ stroke: "var(--border)" }}
									tickLine={{ stroke: "var(--border)" }}
								/>
								<YAxis
									stroke="var(--muted-foreground)"
									tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
									axisLine={{ stroke: "var(--border)" }}
									tickLine={{ stroke: "var(--border)" }}
									allowDecimals={false}
								/>
								<Tooltip
									cursor={{ fill: "var(--accent)" }}
									contentStyle={{
										backgroundColor: "var(--card)",
										border: "1px solid var(--border)",
										borderRadius: "0.5rem",
										color: "var(--card-foreground)",
									}}
									labelStyle={{ color: "var(--card-foreground)" }}
								/>
								<Bar
									dataKey="messages"
									fill="var(--primary)"
									radius={[4, 4, 0, 0]}
								/>
							</BarChart>
						</ResponsiveContainer>
					)}
				</CardContent>
			</Card>
		</SettingsLayout>
	);
}
