import Redis from "ioredis";
import { createResumableStreamContext } from "resumable-stream/ioredis";

const redisUrl = process.env.REDIS_URL;

let context: ReturnType<typeof createResumableStreamContext> | null = null;

if (redisUrl) {
	const publisher = new Redis(redisUrl);
	const subscriber = new Redis(redisUrl);
	context = createResumableStreamContext({
		waitUntil: null,
		publisher,
		subscriber,
	});
}

export function getResumableStreamContext() {
	return context;
}
