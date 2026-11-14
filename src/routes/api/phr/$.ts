import { createFileRoute } from "@tanstack/react-router";

const POSTHOG_HOST =
	process.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

function filterHeaders(headers: Headers): Record<string, string> {
	const filtered: Record<string, string> = {};
	for (const [key, value] of headers.entries()) {
		if (key.toLowerCase() !== "host") {
			filtered[key] = value;
		}
	}
	return filtered;
}

async function proxy(request: Request, method: string): Promise<Response> {
	const url = new URL(request.url);
	const targetUrl = `${POSTHOG_HOST}${url.pathname.replace("/api/phr", "")}${url.search}`;

	const body =
		method === "GET" || method === "OPTIONS"
			? undefined
			: await request.arrayBuffer();

	const response = await fetch(targetUrl, {
		method,
		headers: filterHeaders(request.headers),
		body,
	});

	const responseBody = await response.arrayBuffer();

	const responseHeaders = Object.fromEntries(
		Array.from(response.headers.entries()).filter(
			([key]) =>
				key.toLowerCase() !== "content-length" &&
				key.toLowerCase() !== "content-encoding",
		),
	);

	const headers: Record<string, string> = {
		...responseHeaders,
		"Access-Control-Allow-Origin": request.headers.get("origin") || "*",
		"Access-Control-Allow-Credentials": "true",
	};

	if (method === "OPTIONS") {
		headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
		headers["Access-Control-Allow-Headers"] =
			"Content-Type, Authorization, Accept, Accept-Language, Content-Encoding";
	}

	return new Response(responseBody, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export const Route = createFileRoute("/api/phr/$")({
	server: {
		handlers: {
			GET: async ({ request }) => proxy(request, "GET"),
			POST: async ({ request }) => proxy(request, "POST"),
			OPTIONS: async ({ request }) => proxy(request, "OPTIONS"),
		},
	},
});
