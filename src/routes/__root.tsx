import { PostHogProvider } from "@posthog/react";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ConvexProvider } from "convex/react";
import { ThemeProvider } from "next-themes";
import { RouteErrorComponent } from "#/components/route-error";
import { env } from "#/env";
import { OnboardingGate } from "../components/onboarding/onboarding-gate";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import { convexClient } from "../lib/convex";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	errorComponent: RouteErrorComponent,
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: env.VITE_APP_TITLE ?? ".Chat",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	const posthogKey = env.VITE_POSTHOG_KEY;
	const posthogHost = env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

	const inner = (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			<TooltipProvider>
				{convexClient ? (
					<ConvexProvider client={convexClient}>
						{children}
						<OnboardingGate />
						<Toaster />
					</ConvexProvider>
				) : (
					<>
						{children}
						<OnboardingGate />
						<Toaster />
					</>
				)}
			</TooltipProvider>
		</ThemeProvider>
	);

	const content = posthogKey ? (
		<PostHogProvider
			apiKey={posthogKey}
			options={{
				api_host: posthogHost,
				defaults: "2026-08-30",
				capture_exceptions: true,
			}}
		>
			{inner}
			<TanStackDevtools
				config={{
					position: "bottom-right",
				}}
				plugins={[
					{
						name: "Tanstack Router",
						render: <TanStackRouterDevtoolsPanel />,
					},
					TanStackQueryDevtools,
				]}
			/>
			<Scripts />
		</PostHogProvider>
	) : (
		<>
			{inner}
			<TanStackDevtools
				config={{
					position: "bottom-right",
				}}
				plugins={[
					{
						name: "Tanstack Router",
						render: <TanStackRouterDevtoolsPanel />,
					},
					TanStackQueryDevtools,
				]}
			/>
			<Scripts />
		</>
	);

	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="antialiased">{content}</body>
		</html>
	);
}
