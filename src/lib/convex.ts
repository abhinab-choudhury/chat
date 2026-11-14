import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;

export const convexClient = url ? new ConvexReactClient(url) : null;

export function getConvexClient() {
	if (!convexClient) {
		throw new Error(
			"VITE_CONVEX_URL is not set. Add it to .env.local (see .env.example).",
		);
	}
	return convexClient;
}
