// Authenticated server-to-server envelope. Never put this secret in a VITE_ variable.
export async function signEnvelope(body: string, secret: string) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(body),
	);
	return Array.from(new Uint8Array(signature), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}
export async function verifyEnvelope(
	body: string,
	signature: string,
	secret: string,
) {
	if (!/^[a-f0-9]{64}$/.test(signature)) return false;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	return crypto.subtle.verify(
		"HMAC",
		key,
		Uint8Array.from(signature.match(/../g) ?? [], (pair) => parseInt(pair, 16)),
		new TextEncoder().encode(body),
	);
}
