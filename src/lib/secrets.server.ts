import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "v1";
const IV_LENGTH = 12;

/**
 * Derives a stable 32-byte key from the server secret. `ENCRYPTION_KEY` is
 * optional; when it is absent we reuse the already-required auth secret so
 * deployments do not need another mandatory environment variable.
 */
function getEncryptionKey(): Buffer {
	const secret =
		process.env.ENCRYPTION_KEY?.trim() ||
		process.env.BETTER_AUTH_SECRET?.trim();

	if (!secret) {
		throw new Error(
			"Set ENCRYPTION_KEY or BETTER_AUTH_SECRET before storing provider keys.",
		);
	}

	return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return `${PREFIX}:${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

export function decryptSecret(value: string): string {
	if (!value.startsWith(`${PREFIX}:`)) {
		throw new Error("Unsupported secret format");
	}

	const payload = Buffer.from(value.slice(PREFIX.length + 1), "base64url");
	const iv = payload.subarray(0, IV_LENGTH);
	const tag = payload.subarray(IV_LENGTH, IV_LENGTH + 16);
	const ciphertext = payload.subarray(IV_LENGTH + 16);

	const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf8");
}

/** Returns a short, non-reversible hint suitable for display. */
export function secretHint(value: string): string {
	if (value.length <= 4) return "••••";
	return `••••${value.slice(-4)}`;
}

export function tryDecryptSecret(
	value: string | null | undefined,
): string | null {
	if (!value) return null;
	try {
		return decryptSecret(value);
	} catch {
		return null;
	}
}
