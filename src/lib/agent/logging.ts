import { requestLogContext, serverLog } from "../server-logging";

/** Server-only call sites. Never pass prompts, output, credentials or provider errors as fields. */
type LogFields = Record<string, string | number | boolean | null | undefined>;

export function createAgentLogger(
	requestId: string,
	service: "web" | "convex",
) {
	const started = Date.now();
	function write(level: "error", event: string, fields: LogFields = {}) {
		serverLog(level, "agent", event, {
			...fields,
			service,
			requestId: requestLogContext.getStore()?.requestId ?? requestId,
			elapsedMs: Date.now() - started,
		});
	}
	return {
		error: (event: string, error: unknown, fields?: LogFields) =>
			write("error", event, { ...fields, ...errorMetadata(error) }),
	};
}

/** SDK errors can contain full prompts, response bodies and keys: whitelist metadata only. */
export function errorMetadata(error: unknown): LogFields {
	const result: LogFields = {};
	let current = error;
	const seen = new Set<unknown>();
	for (
		let depth = 0;
		depth < 3 && current instanceof Error && !seen.has(current);
		depth++
	) {
		seen.add(current);
		const prefix = depth === 0 ? "error" : `cause${depth}`;
		result[`${prefix}Type`] = /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(current.name)
			? current.name
			: "Error";
		if ("statusCode" in current && typeof current.statusCode === "number")
			result[`${prefix}Status`] = current.statusCode;
		if ("isRetryable" in current && typeof current.isRetryable === "boolean")
			result[`${prefix}Retryable`] = current.isRetryable;
		current = "cause" in current ? current.cause : undefined;
	}
	if (!Object.keys(result).length) result.errorType = "UnknownError";
	return result;
}
