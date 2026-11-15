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

const APP_TITLE = env.VITE_APP_TITLE ?? ".Chat";
const APP_DESCRIPTION = "Chat application which believes on BYOK";
/** Absolute origin so crawlers get fully-qualified og:url / og:image values. */
const APP_URL = (env.VITE_APP_URL ?? "https://chat.abhinab.tech").replace(
	/\/$/,
	"",
);
const OG_IMAGE = `${APP_URL}/og_image.png`;

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
				title: APP_TITLE,
			},
			{
				name: "description",
				content: APP_DESCRIPTION,
			},

			// Open Graph — used by Facebook, LinkedIn, Discord, Slack,
			// Mastodon and Bluesky.
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: APP_TITLE },
			{ property: "og:title", content: APP_TITLE },
			{ property: "og:description", content: APP_DESCRIPTION },
			{ property: "og:url", content: `${APP_URL}/` },
			{ property: "og:image", content: OG_IMAGE },
			{ property: "og:image:type", content: "image/png" },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ property: "og:image:alt", content: APP_DESCRIPTION },
			{ property: "og:locale", content: "en_US" },

			// X / Twitter
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: APP_TITLE },
			{ name: "twitter:description", content: APP_DESCRIPTION },
			{ name: "twitter:url", content: `${APP_URL}/` },
			{ name: "twitter:image", content: OG_IMAGE },
			{ name: "twitter:image:alt", content: APP_DESCRIPTION },
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "icon",
				href: "/favicon-32.png",
				sizes: "32x32",
				type: "image/png",
			},
			{
				rel: "icon",
				href: "/favicon-16.png",
				sizes: "16x16",
				type: "image/png",
			},
			{
				rel: "apple-touch-icon",
				href: "/apple-touch-icon.png",
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
