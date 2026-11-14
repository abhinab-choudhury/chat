import { type OptionalRestArgsOrSkip, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useEffect, useMemo, useState } from "react";

type IsArrayType<T> = T extends readonly unknown[] ? true : false;

type CachedItem<
	T,
	IsArray extends boolean = false,
	ExtraProps extends Record<string, unknown> = Record<string, never>,
> = IsArray extends true
	? T extends readonly unknown[]
		? Array<T[number] & ExtraProps>
		: never
	: T & ExtraProps;

function getCacheKey(key: string) {
	return `CVX_DISK_CACHE:${key}`;
}

export function useDiskCachedQuery<
	Query extends FunctionReference<"query">,
	ExtraProps extends Record<string, unknown> = Record<string, never>,
	T = ReturnType<typeof useQuery<Query>>,
	IsArray extends boolean = IsArrayType<T>,
>(
	query: Query,
	cacheOptions: {
		key: string;
		maxItems?: number;
		default: ReturnType<typeof useQuery<Query>>;
		forceCache?: boolean;
	},
	...args: OptionalRestArgsOrSkip<Query>
) {
	const isClient = typeof window !== "undefined";
	const result = useQuery(query, ...args);
	const storageKey = getCacheKey(cacheOptions.key);

	const [diskCache, setDiskCache] = useState<
		CachedItem<T, IsArray, ExtraProps>
	>(() => {
		if (!isClient)
			return cacheOptions.default as CachedItem<T, IsArray, ExtraProps>;
		try {
			const cache = window.localStorage.getItem(storageKey);
			return cache
				? (JSON.parse(cache) as CachedItem<T, IsArray, ExtraProps>)
				: (cacheOptions.default as CachedItem<T, IsArray, ExtraProps>);
		} catch {
			return cacheOptions.default as CachedItem<T, IsArray, ExtraProps>;
		}
	});

	useEffect(() => {
		if (!isClient) return;
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === storageKey && e.newValue) {
				try {
					setDiskCache(
						JSON.parse(e.newValue) as CachedItem<T, IsArray, ExtraProps>,
					);
				} catch {
					// ignore
				}
			}
		};
		window.addEventListener("storage", handleStorageChange);
		return () => window.removeEventListener("storage", handleStorageChange);
	}, [isClient, storageKey]);

	const output = useMemo(() => {
		const isSkip =
			args.length > 0 && args[0] === "skip" && !cacheOptions.forceCache;
		if (isSkip)
			return cacheOptions.default as CachedItem<T, IsArray, ExtraProps>;
		return (result ?? diskCache) as CachedItem<T, IsArray, ExtraProps>;
	}, [args, cacheOptions.default, cacheOptions.forceCache, diskCache, result]);

	useEffect(() => {
		if (!isClient || result == null) return;
		try {
			if (cacheOptions.maxItems && Array.isArray(result)) {
				window.localStorage.setItem(
					storageKey,
					JSON.stringify(result.slice(0, cacheOptions.maxItems)),
				);
			} else {
				window.localStorage.setItem(storageKey, JSON.stringify(result));
			}
		} catch {
			// ignore storage errors
		}
	}, [cacheOptions.maxItems, isClient, result, storageKey]);

	return output;
}

export function clearConvexDiskCache() {
	if (typeof window === "undefined") return;
	for (const key of Object.keys(window.localStorage)) {
		if (key.startsWith("CVX_DISK_CACHE:")) window.localStorage.removeItem(key);
	}
}
