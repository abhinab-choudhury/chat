// Resolve the current user id for client-side data scoping.
// With authentication removed, every visitor gets a stable per-browser id
// stored in localStorage (and mirrored to a cookie so server functions can
// resolve the same id) so their threads and settings stay private to that
// browser.
const COOKIE_NAME = "anon-user-id";

function makeId(): string {
	return `anon-${crypto.randomUUID()}`;
}

let browserUserId: string | undefined;
export function getCurrentUserId(): string {
	if (typeof window === "undefined") return "dev-user";
	let storedId: string | null = null;
	try {
		storedId = window.localStorage.getItem(COOKIE_NAME);
	} catch {
		/* Storage may be disabled. */
	}
	const cookieId = readUserIdFromCookie(document.cookie);
	const id =
		(storedId?.startsWith("anon-") ? storedId : null) ??
		cookieId ??
		browserUserId ??
		makeId();
	browserUserId = id;
	try {
		window.localStorage.setItem(COOKIE_NAME, id);
	} catch {
		/* Retain the in-memory identity. */
	}
	document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
	return id;
}

export function readUserIdFromCookie(
	cookieHeader: string | undefined | null,
): string | null {
	if (!cookieHeader) return null;
	const match = cookieHeader
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${COOKIE_NAME}=`));
	if (!match) return null;
	const value = match.slice(COOKIE_NAME.length + 1);
	try {
		const decoded = decodeURIComponent(value);
		return decoded.startsWith("anon-") ? decoded : null;
	} catch {
		return null;
	}
}
