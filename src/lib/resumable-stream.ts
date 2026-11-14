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

export function getResumableStreamContext() {
	if (context) return context;
	if (!redisUrl) return null;

	try {
		publisher = publisher ?? createRedisClient(redisUrl);
		subscriber = subscriber ?? createRedisClient(redisUrl);
		context = createResumableStreamContext({
			waitUntil: null,
			publisher,
			subscriber,
		});
		return context;
	} catch (error) {
		console.error("[resumable-stream] failed to initialize", error);
		return null;
	}
}

