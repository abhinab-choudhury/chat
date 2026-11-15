type CachedMessage = {
	_id: string;
	role: string;
	content: string;
	reasoning?: string;
	toolData?: unknown;
	createdAt?: number;
};

type CachedThread = {
	_id: string;
	title: string;
	updatedAt?: number;
	archived?: boolean;
};

const PREFIX = "chatcache:v1";

function canUseStorage() {
	return (
		typeof window !== "undefined" && typeof window.localStorage !== "undefined"
	);
}

function safeGet<T>(key: string): T | null {
	if (!canUseStorage()) return null;
	try {
		const raw = window.localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function safeSet(key: string, value: unknown) {
	if (!canUseStorage()) return;
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// ignore quota/serialization errors
	}
}

export function readCachedMessages(threadId: string): CachedMessage[] | null {
	return safeGet<CachedMessage[]>(`${PREFIX}:messages:${threadId}`);
}

export function writeCachedMessages(
	threadId: string,
	messages: CachedMessage[],
) {
	// Keep cache bounded for performance.
	const trimmed = messages.slice(-200).map((m) => ({
		_id: String(m._id),
		role: String(m.role),
		content: String(m.content ?? ""),
		reasoning: m.reasoning ? String(m.reasoning) : undefined,
		toolData: m.toolData,
		createdAt: typeof m.createdAt === "number" ? m.createdAt : undefined,
	}));
	safeSet(`${PREFIX}:messages:${threadId}`, trimmed);
}

export function readCachedThreads(userId: string): CachedThread[] | null {
	return safeGet<CachedThread[]>(`${PREFIX}:threads:${userId}`);
}

export function writeCachedThreads(userId: string, threads: CachedThread[]) {
	const trimmed = threads.slice(0, 100).map((t) => ({
		_id: String(t._id),
		title: String(t.title ?? "New chat"),
		updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : undefined,
		archived: Boolean(t.archived),
	}));
	safeSet(`${PREFIX}:threads:${userId}`, trimmed);
}

export function upsertCachedThread(userId: string, thread: CachedThread) {
	const existing = readCachedThreads(userId) ?? [];
	const next = [thread, ...existing.filter((t) => t._id !== thread._id)]
		.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
		.slice(0, 100);
	writeCachedThreads(userId, next);
}

export function appendCachedMessage(threadId: string, message: CachedMessage) {
	const existing = readCachedMessages(threadId) ?? [];
	if (existing.some((m) => m._id === message._id)) return;
	writeCachedMessages(threadId, [...existing, message]);
}
