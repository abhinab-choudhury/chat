// Resolve the current user id for client-side data scoping.
// Logged-in users use their auth id. Anonymous visitors get a stable
// per-browser id stored in localStorage so their threads stay private
// to that browser instead of being shared under a single "dev-user".
export function getCurrentUserId(sessionUserId?: string | null): string {
	if (sessionUserId) return sessionUserId;
	if (typeof window === "undefined") return "dev-user";
	try {
		let id = window.localStorage.getItem("anon-user-id");
		if (!id) {
			id = crypto.randomUUID();
			window.localStorage.setItem("anon-user-id", id);
		}
		return `anon-${id}`;
	} catch {
		return "dev-user";
	}
}
