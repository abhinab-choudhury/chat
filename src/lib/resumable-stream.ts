import "dotenv/config";
import Redis from "ioredis";
import { createResumableStreamContext } from "resumable-stream/ioredis";

const redisUrl = process.env.REDIS_URL ?? process.env.REDIS_URL_PRIVATE;

let context: ReturnType<typeof createResumableStreamContext> | null = null;
let publisher: Redis | null = null;
let subscriber: Redis | null = null;

function createRedisClient(url: string) {
	const client = new Redis(url, {
		maxRetriesPerRequest: 2,
		enableReadyCheck: true,
		lazyConnect: false,
	});
	client.on("error", (error) => {
		console.error("[resumable-stream] redis error", error);
	});
	return client;
}

let warnedDisabled = false;

export function getResumableStreamContext() {
	if (context) return context;
	if (!redisUrl) {
		if (!warnedDisabled) {
			warnedDisabled = true;
			console.warn(
				"[resumable-stream] REDIS_URL is not set; streams will NOT be resumable across page reloads. Set REDIS_URL and run Redis (docker compose up -d redis).",
			);
		}
		return null;
	}

	try {
		publisher = publisher ?? createRedisClient(redisUrl);
		subscriber = subscriber ?? createRedisClient(redisUrl);
		context = createResumableStreamContext({
			// Keep background reconnection promises tracked (intern3-chat pattern).
			waitUntil: (promise) => promise,
			publisher,
			subscriber,
		});
		return context;
	} catch (error) {
		console.error("[resumable-stream] failed to initialize", error);
		return null;
	}
}

