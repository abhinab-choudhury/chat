import { createLazyFileRoute } from "@tanstack/react-router";

import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

const data = [
	{ name: "Mon", messages: 12 },
	{ name: "Tue", messages: 19 },
	{ name: "Wed", messages: 8 },
	{ name: "Thu", messages: 24 },
	{ name: "Fri", messages: 16 },
	{ name: "Sat", messages: 6 },
	{ name: "Sun", messages: 10 },
];

export const Route = createLazyFileRoute("/settings/usage")({
	component: UsageSettings,
});

function UsageSettings() {
	return (
		<div className="mx-auto w-full max-w-2xl px-4 py-8">
			<h1 className="mb-6 text-2xl font-bold tracking-tight">Usage</h1>
			<Card>
				<CardHeader>
					<CardTitle>Usage overview</CardTitle>
					<CardDescription>
						Track your conversations and token usage.
					</CardDescription>
				</CardHeader>
				<CardContent className="h-72">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={data}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="name" />
							<YAxis />
							<Tooltip />
							<Bar dataKey="messages" fill="#3b82f6" />
						</BarChart>
					</ResponsiveContainer>
				</CardContent>
			</Card>
		</div>
	);
}
