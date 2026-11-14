/**
 * Lightweight sync/optimistic layer primitives for chat interactions.
 *
 * Goals:
 * - Optimistic UI first: apply local state immediately, reconcile with server.
 * - Outbox-style intent tracking for operations that must not be lost.
 * - Idempotent operations via client-generated UUIDs (already used for messages/threads).
 * - Eventual consistency with Convex reactive queries as the source of truth.
 *
 * This module provides small building blocks; screens/components decide what to
 * render optimistically (e.g. pending user message, pending title) and reconcile
 * when authoritative data arrives.
 */

export type SyncStatus = "idle" | "pending" | "success" | "error";

export interface SyncOperation<TPayload = unknown> {
	id: string;
	kind: string;
	payload: TPayload;
	status: SyncStatus;
	createdAt: number;
	updatedAt: number;
	error?: string;
	/** Number of attempts performed (including in-flight attempt). */
	attempts: number;
}

export interface SyncQueueState {
	operations: Record<string, SyncOperation>;
	order: string[];
}

export function createSyncQueueState(): SyncQueueState {
	return { operations: {}, order: [] };
}

export function enqueueOperation<TPayload>(
	state: SyncQueueState,
	op: Omit<
		SyncOperation<TPayload>,
		"status" | "createdAt" | "updatedAt" | "attempts"
	> & {
		status?: SyncStatus;
		createdAt?: number;
		updatedAt?: number;
		attempts?: number;
	},
): SyncQueueState {
	const now = Date.now();
	const operation: SyncOperation<TPayload> = {
		status: op.status ?? "pending",
		createdAt: op.createdAt ?? now,
		updatedAt: op.updatedAt ?? now,
		attempts: op.attempts ?? 0,
		...op,
	} as SyncOperation<TPayload>;

	const exists = Boolean(state.operations[operation.id]);
	return {
		operations: { ...state.operations, [operation.id]: operation },
		order: exists ? state.order : [...state.order, operation.id],
	};
}

export function updateOperation(
	state: SyncQueueState,
	id: string,
	patch: Partial<Omit<SyncOperation, "id" | "createdAt">>,
): SyncQueueState {
	const current = state.operations[id];
	if (!current) return state;
	return {
		...state,
		operations: {
			...state.operations,
			[id]: { ...current, ...patch, updatedAt: Date.now() },
		},
	};
}

export function removeOperation(
	state: SyncQueueState,
	id: string,
): SyncQueueState {
	if (!state.operations[id]) return state;
	const { [id]: _removed, ...rest } = state.operations;
	return { operations: rest, order: state.order.filter((x) => x !== id) };
}

export function getPendingOperations(state: SyncQueueState): SyncOperation[] {
	return state.order
		.map((id) => state.operations[id])
		.filter((op): op is SyncOperation =>
			Boolean(op && op.status === "pending"),
		);
}

/**
 * Run an async mutation with optimistic lifecycle tracking.
 * Caller is responsible for applying/rolling back optimistic UI state.
 */
export async function runOptimisticOperation<T>(args: {
	id: string;
	run: () => Promise<T>;
	onStart?: () => void;
	onSuccess?: (result: T) => void;
	onError?: (error: unknown) => void;
}): Promise<T> {
	args.onStart?.();
	try {
		const result = await args.run();
		args.onSuccess?.(result);
		return result;
	} catch (error) {
		args.onError?.(error);
		throw error;
	}
}

/**
 * Reconciliation helper: prefer authoritative server entities when present,
 * otherwise fall back to optimistic entities (e.g. pending message).
 */
export function reconcileByKey<TServer, TOptimistic>(args: {
	serverItems: TServer[];
	optimisticItems: TOptimistic[];
	getServerKey: (item: TServer) => string;
	getOptimisticKey: (item: TOptimistic) => string;
	merge?: (server: TServer, optimistic: TOptimistic) => TServer | TOptimistic;
}): Array<TServer | TOptimistic> {
	const optimisticByKey = new Map(
		args.optimisticItems.map(
			(item) => [args.getOptimisticKey(item), item] as const,
		),
	);
	const merged: Array<TServer | TOptimistic> = [];
	const seen = new Set<string>();

	for (const serverItem of args.serverItems) {
		const key = args.getServerKey(serverItem);
		seen.add(key);
		const optimistic = optimisticByKey.get(key);
		merged.push(
			optimistic && args.merge
				? args.merge(serverItem, optimistic)
				: serverItem,
		);
	}

	for (const optimisticItem of args.optimisticItems) {
		const key = args.getOptimisticKey(optimisticItem);
		if (!seen.has(key)) merged.push(optimisticItem);
	}

	return merged;
}

/**
 * Chat-specific sync notes (current app):
 * - Message/thread creation uses client UUIDs for idempotency.
 * - UI shows optimistic pending user message/title while Convex queries catch up.
 * - Convex reactive queries are the reconciliation source of truth.
 * - For stronger guarantees: persist an offline outbox (IndexedDB), replay on
 *   reconnect, and resolve conflicts by (clientUuid, updatedAt/causal version).
 */
export const chatSyncContract = {
	entities: ["thread", "message", "stream"] as const,
	idempotencyKeys: {
		thread: "clientUuid",
		message: "clientUuid",
		stream: "streamId",
	},
	reconciliation: "server-reactive-query-wins",
} as const;
