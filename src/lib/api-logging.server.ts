import { randomUUID } from "node:crypto";
import { errorMetadata } from "./agent/logging";
import { requestLogContext, serverLog } from "./server-logging";

/** Log only route templates and metadata, never URLs, bodies or headers. */
export function withApiLogging<T extends { request: Request }>(
	route: string,
	handler: (context: T) => Response | Promise<Response>,
): (context: T) => Promise<Response> {
	return async (context) =>
		requestLogContext.run({ requestId: randomUUID() }, async () => {
			const started = performance.now();
			const fields = {
				requestId: requestLogContext.getStore()?.requestId,
				method: context.request.method,
				route,
			};

			try {
				const response = await handler(context);
				const level =
					response.status >= 500
						? "error"
						: response.status >= 400
							? "warn"
							: "info";
				serverLog(
					level,
					"api",
					response.headers.get("content-type")?.includes("ndjson")
						? "response.opened"
						: "request.completed",
					{
						...fields,
						status: response.status,
						durationMs: Math.round(performance.now() - started),
					},
				);
				// For streaming responses, this measures time to response headers.
				return response;
			} catch (error) {
				serverLog("error", "api", "request.failed", {
					...fields,
					durationMs: Math.round(performance.now() - started),
					...errorMetadata(error),
				});
				throw error;
			}
		});
}
