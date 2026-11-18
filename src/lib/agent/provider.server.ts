import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { modelProvider } from "../models";
import { serverLog } from "../server-logging";

/** One request at a time, including tool continuations and review calls. Intended for one Node process. */
export function createProviderGate(
	fetcher: typeof fetch = fetch,
	intervalMs = 1500,
	provider = "model",
) {
	let tail: Promise<void> = Promise.resolve();
	let pending = 0;
	let nextAt = 0;
	let cooldown = 0;
	let cooldownStatus = 503;
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
			if (Date.now() < cooldown) {
				serverLog("warn", "provider", "request.blocked", {
					provider,
					status: cooldownStatus,
					retryAfterMs: cooldown - Date.now(),
				});
				throw Object.assign(
					new Error("Model provider is busy. Please wait before retrying."),
					{ statusCode: cooldownStatus },
				);
			}
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
				const started = performance.now();
				const response = await fetcher(input, init);
				const diagnostics: Record<string, string | number> = {};
				for (const name of [
					"x-ratelimit-limit-requests",
					"x-ratelimit-remaining-requests",
					"x-ratelimit-limit-tokens",
					"x-ratelimit-remaining-tokens",
					"x-ratelimit-reset-requests",
					"x-ratelimit-reset-tokens",
					"retry-after",
				]) {
					const value = response.headers.get(name);
					if (value && /^[0-9.ms h-]{1,64}$/.test(value))
						diagnostics[name] = value;
				}
				if (response.status === 429 || response.status === 503) {
					const payload = await response
						.clone()
						.json()
						.catch(() => null);
					const code =
						typeof payload?.error?.code === "string"
							? payload.error.code
							: payload?.error?.status;
					if (
						[
							"insufficient_quota",
							"rate_limit_exceeded",
							"RESOURCE_EXHAUSTED",
							"UNAVAILABLE",
						].includes(code)
					)
						diagnostics.reason = code;
				}
				serverLog(
					response.status >= 400 ? "warn" : "info",
					"provider",
					"request.completed",
					{
						provider,
						status: response.status,
						attempt: attempt + 1,
						queued: pending - 1,
						durationMs: Math.round(performance.now() - started),
						...diagnostics,
					},
				);
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
				if (response.status === 429 || attempt || delay > 15000) {
					cooldownStatus = response.status;
					cooldown =
						Date.now() +
						Math.max(response.status === 429 ? 60000 : 2000, delay);
					serverLog("warn", "provider", "cooldown.started", {
						provider,
						status: response.status,
						retryAfterMs: cooldown - Date.now(),
					});
					return response;
				}
				serverLog("warn", "provider", "retry.scheduled", {
					provider,
					status: response.status,
					nextAttempt: attempt + 2,
					retryAfterMs: delay,
				});
				await response.body?.cancel();
				await wait(delay);
			}
		} finally {
			pending--;
			release();
		}
	}) as typeof fetch;
}
const guardedFetch = createProviderGate(fetch, 1500, "gemini");
const openaiFetch = createProviderGate(fetch, 1500, "openai");
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
	if (status === 503)
		return "The selected model provider is temporarily unavailable or overloaded (503). Please try again shortly.";
	if (status === 429)
		return "The selected provider's rate limit or API quota was reached. Check API billing and wait before retrying.";
	return "Unable to complete a verified answer. The selected model provider may be busy; please wait a minute before retrying.";
}
