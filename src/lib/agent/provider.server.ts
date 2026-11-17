import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { modelProvider } from "../models";

/** One request at a time, including tool continuations and review calls. Intended for one Node process. */
export function createProviderGate(
	fetcher: typeof fetch = fetch,
	intervalMs = 1500,
) {
	let tail: Promise<void> = Promise.resolve();
	let pending = 0;
	let nextAt = 0;
	let cooldown = 0;
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		if (pending >= 8)
			throw new Error("Provider queue is full. Please try again shortly.");
		pending++;
		const previous = tail;
		let release!: () => void;
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			if (Date.now() < cooldown)
				throw new Error(
					"Model provider is busy. Please wait a minute before retrying.",
				);
			const signal = init?.signal;
			const wait = async (ms: number) => {
				if (ms <= 0) return;
				await new Promise<void>((resolve, reject) => {
					const abort = () => {
						clearTimeout(timer);
						reject(new Error("Request cancelled"));
					};
					const timer = setTimeout(() => {
						signal?.removeEventListener("abort", abort);
						resolve();
					}, ms);
					if (signal?.aborted) abort();
					else signal?.addEventListener("abort", abort, { once: true });
				});
			};
			await wait(nextAt - Date.now());
			for (let attempt = 0; ; attempt++) {
				signal?.throwIfAborted();
				const response = await fetcher(input, init);
				nextAt = Date.now() + intervalMs;
				if (![429, 500, 502, 503, 504].includes(response.status))
					return response;
				const header = response.headers.get("retry-after");
				const retryMs = header
					? /^\d+$/.test(header)
						? Number(header) * 1000
						: Date.parse(header) - Date.now()
					: 0;
				const delay = Math.max(
					Number.isFinite(retryMs) ? retryMs : 0,
					2000 + Math.random() * 1000,
				);
				if (attempt || delay > 15000) {
					cooldown = Date.now() + Math.max(60000, delay);
					return response;
				}
				await response.body?.cancel();
				await wait(delay);
			}
		} finally {
			pending--;
			release();
		}
	}) as typeof fetch;
}
const guardedFetch = createProviderGate();
const openaiFetch = createProviderGate();
export function googleProvider() {
	const apiKey = process.env.GEMINI_API_KEY?.trim();
	if (!apiKey) throw new Error("Set GEMINI_API_KEY on the server.");
	return createGoogle({ apiKey, fetch: guardedFetch });
}

/** Provider selection is explicit in the model ID; never silently fail over. */
export function resolveAgentModel(requested?: string) {
	const id =
		requested ||
		(process.env.OPENAI_API_KEY?.trim()
			? process.env.OPENAI_MODEL || "gpt-5.6-luna"
			: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite");
	return { id, provider: modelProvider(id) };
}
export function requireModelCredentials(model?: string) {
	const selected = resolveAgentModel(model);
	const variable =
		selected.provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
	if (!process.env[variable]?.trim())
		throw new Error(`Set ${variable} on the server to use this model.`);
	return selected;
}
export function agentModel(requested?: string) {
	const selected = requireModelCredentials(requested);
	const model =
		selected.provider === "openai"
			? createOpenAI({
					apiKey: process.env.OPENAI_API_KEY?.trim(),
					fetch: openaiFetch,
				}).chat(selected.id)
			: googleProvider()(selected.id);
	return { ...selected, model };
}

export function modelErrorMessage(error: unknown) {
	const status =
		error && typeof error === "object" && "statusCode" in error
			? error.statusCode
			: undefined;
	if (status === 401 || status === 403)
		return "The selected provider rejected access. Check its API key and model permissions.";
	if (status === 404)
		return "The selected model is unavailable for this API account. Choose another model or check model access.";
	if (status === 429)
		return "The selected provider's rate limit or API quota was reached. Check API billing and wait before retrying.";
	return "Unable to complete a verified answer. The selected model provider may be busy; please wait a minute before retrying.";
}
