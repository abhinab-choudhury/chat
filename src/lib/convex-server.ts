import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api";

const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;

let client: ConvexHttpClient | null = null;

export function getConvexServerClient() {
	if (!convexUrl) return null;
	if (!client) client = new ConvexHttpClient(convexUrl);
	return client;
}

export { api as convexApi };
