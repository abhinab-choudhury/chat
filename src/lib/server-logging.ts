import { AsyncLocalStorage } from "node:async_hooks";

type Fields = Record<string, string | number | boolean | null | undefined>;
export const requestLogContext = new AsyncLocalStorage<{ requestId: string }>();

/** Callers supply allowlisted metadata only. Never pass raw errors or payloads. */
export function serverLog(
	level: "info" | "warn" | "error",
	scope: string,
	event: string,
	fields: Fields = {},
) {
	const record = {
		time: new Date().toISOString(),
		level,
		scope,
		event,
		...requestLogContext.getStore(),
		...fields,
	};
	if (
		process.env.LOG_FORMAT === "json" ||
		process.env.NODE_ENV === "production"
	) {
		console[level](JSON.stringify(record));
	} else {
		const details = Object.entries({
			...requestLogContext.getStore(),
			...fields,
		})
			.filter(([, value]) => value !== undefined)
			.map(([key, value]) => `${key}=${JSON.stringify(value)}`)
			.join(" ");
		console[level](
			`${record.time.slice(11, 23)} ${level.toUpperCase().padEnd(5)} [${scope}] ${event} ${details}`,
		);
	}
}
