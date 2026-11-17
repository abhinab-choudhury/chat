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
			// Keep background reconnection promises tracked.
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

// A short lease distinguishes a live producer from Redis replay left by a dead process.
const generationLeaseKey = (streamId: string) => `chat:generation:${streamId}`;
export async function hasGenerationLease(
	streamId: string,
): Promise<boolean | null> {
	if (!getResumableStreamContext() || !publisher) return null;
	return (await publisher.exists(generationLeaseKey(streamId))) === 1;
}
export async function trackGeneration(streamId: string) {
	if (!getResumableStreamContext() || !publisher) return async () => {};
	const redis = publisher;
	const key = generationLeaseKey(streamId);
	await redis.set(key, "active", "EX", 30);
	const timer = setInterval(() => {
		void redis
			.set(key, "active", "EX", 30)
			.catch((error) => console.error("[stream] lease refresh failed", error));
	}, 10000);
	timer.unref();
	return async () => {
		clearInterval(timer);
		await redis.del(key);
	};
}
