export type ErrorType =
	| "bad_model"
	| "bad_request"
	| "unauthorized"
	| "forbidden"
	| "not_found"
	| "rate_limit"
	| "offline"
	| "internal";

export type Surface = "chat" | "api" | "stream" | "database";
export type ErrorCode = `${ErrorType}:${Surface}`;

export type ErrorVisibility = "response" | "log" | "none";

export const visibilityBySurface: Record<Surface, ErrorVisibility> = {
	database: "log",
	chat: "response",
	stream: "response",
	api: "response",
};

export interface ErrorPayload {
	code: ErrorCode | "";
	message: string;
	cause?: string;
}

export class ChatError extends Error {
	public readonly type: ErrorType;
	public readonly surface: Surface;
	public readonly statusCode: number;
	public readonly causeMessage?: string;
	public readonly exposeCause: boolean;

	constructor(
		errorCode: ErrorCode,
		options?: { cause?: unknown; exposeCause?: boolean; message?: string },
	) {
		super(options?.message ?? getMessageByErrorCode(errorCode));
		this.name = "ChatError";

		const [type, surface] = errorCode.split(":") as [ErrorType, Surface];
		this.type = type;
		this.surface = surface;
		this.statusCode = getStatusCodeByType(type);
		this.causeMessage = normalizeCause(options?.cause);
		this.exposeCause = options?.exposeCause ?? false;
	}

	toJSON(): ErrorPayload {
		const code: ErrorCode = `${this.type}:${this.surface}`;
		const visibility = visibilityBySurface[this.surface];
		if (visibility === "log") {
			return {
				code: "",
				message: "Something went wrong. Please try again later.",
			};
		}
		return {
			code,
			message: this.message,
			...(this.exposeCause && this.causeMessage
				? { cause: this.causeMessage }
				: {}),
		};
	}

	toResponse(init?: { headers?: HeadersInit; includeCors?: boolean }) {
		const visibility = visibilityBySurface[this.surface];
		const payload = this.toJSON();

		if (visibility === "log") {
			console.error("[ChatError]", {
				code: `${this.type}:${this.surface}`,
				message: this.message,
				cause: this.causeMessage,
			});
		}

		const headers = new Headers({
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		});

		if (init?.includeCors) {
			headers.set("Access-Control-Allow-Origin", "*");
			headers.set(
				"Access-Control-Allow-Methods",
				"GET, POST, PUT, DELETE, OPTIONS",
			);
			headers.set(
				"Access-Control-Allow-Headers",
				"Content-Type, Authorization, X-Requested-With",
			);
		}

		return Response.json(payload, { status: this.statusCode, headers });
	}
}

export function isChatError(error: unknown): error is ChatError {
	return error instanceof ChatError;
}

export function normalizeCause(cause: unknown): string | undefined {
	if (cause == null) return undefined;
	if (typeof cause === "string") return cause;
	if (cause instanceof Error) return cause.message;
	try {
		return JSON.stringify(cause);
	} catch {
		return String(cause);
	}
}

export function toChatError(
	error: unknown,
	fallback: ErrorCode = "internal:api",
): ChatError {
	if (isChatError(error)) return error;
	return new ChatError(fallback, { cause: error });
}

export function getMessageByErrorCode(errorCode: ErrorCode): string {
	if (errorCode.includes("database")) {
		return "An error occurred while executing a database query.";
	}

	switch (errorCode) {
		case "bad_request:api":
			return "The request couldn't be processed. Please check your input and try again.";
		case "bad_request:chat":
			return "The chat request was invalid. Please try again.";
		case "bad_request:stream":
			return "The stream request was invalid or could not be processed.";
		case "forbidden:chat":
			return "This chat is private or belongs to another user.";
		case "forbidden:api":
			return "You do not have permission to perform this action.";
		case "not_found:chat":
			return "The requested chat was not found.";
		case "not_found:stream":
			return "The requested stream was not found.";
		case "not_found:api":
			return "The requested resource was not found.";
		case "rate_limit:chat":
			return "You're sending messages too quickly. Please try again in a moment.";
		case "rate_limit:api":
			return "Too many requests. Please try again later.";
		case "offline:chat":
			return "We're having trouble sending your message. Please check your connection and try again.";
		case "offline:stream":
			return "The live stream connection was interrupted. Please try again.";
		case "bad_model:api":
			return "The selected model is unavailable. Please choose a different model and try again.";
		case "bad_model:chat":
			return "The selected model is unavailable for this chat.";
		case "internal:stream":
			return "The stream could not be completed. Please try again.";
		case "internal:chat":
			return "Something went wrong while processing your message. Please try again.";
		default:
			return "Something went wrong. Please try again later.";
	}
}

function getStatusCodeByType(type: ErrorType) {
	switch (type) {
		case "bad_request":
		case "bad_model":
			return 400;
		case "unauthorized":
			return 401;
		case "forbidden":
			return 403;
		case "not_found":
			return 404;
		case "rate_limit":
			return 429;
		case "offline":
			return 503;
		default:
			return 500;
	}
}
