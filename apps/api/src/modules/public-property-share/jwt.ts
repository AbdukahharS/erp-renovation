/**
 * Minimal HS256 JWT for share-link viewer sessions. Self-contained (no extra
 * dep) — payload is `{ tenantId, linkId, propertyId, pwUpdatedAt, iat, exp }`.
 *
 * Verification re-resolves the share link row each call and checks that
 * `pwUpdatedAt` matches the row's current `updatedAt`. Rotating the password
 * bumps `updatedAt`, which invalidates every previously-issued token.
 */

function base64UrlEncode(input: Uint8Array | string): string {
	const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(input: string): Uint8Array {
	const padded = input.replace(/-/g, "+").replace(/_/g, "/");
	const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
	const bin = atob(padded + pad);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function secretKey(): Uint8Array {
	const s = process.env.SHARE_LINK_JWT_SECRET;
	if (!s || s.length < 16) {
		throw new Error("SHARE_LINK_JWT_SECRET must be set (>=16 chars)");
	}
	return new TextEncoder().encode(s);
}

function toArrayBuffer(src: Uint8Array): ArrayBuffer {
	const out = new ArrayBuffer(src.byteLength);
	new Uint8Array(out).set(src);
	return out;
}

async function hmacSha256(message: string): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		toArrayBuffer(secretKey()),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		toArrayBuffer(new TextEncoder().encode(message)),
	);
	return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		const ai = a[i] ?? 0;
		const bi = b[i] ?? 0;
		diff |= ai ^ bi;
	}
	return diff === 0;
}

export interface ShareTokenPayload {
	tenantId: string;
	linkId: string;
	propertyId: string;
	pwUpdatedAt: number;
	iat: number;
	exp: number;
}

const TTL_SECONDS = 8 * 60 * 60;

export async function signShareToken(
	input: Omit<ShareTokenPayload, "iat" | "exp">,
): Promise<string> {
	const iat = Math.floor(Date.now() / 1000);
	const payload: ShareTokenPayload = { ...input, iat, exp: iat + TTL_SECONDS };
	const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = base64UrlEncode(JSON.stringify(payload));
	const data = `${header}.${body}`;
	const sig = await hmacSha256(data);
	return `${data}.${base64UrlEncode(sig)}`;
}

export async function verifyShareToken(token: string): Promise<ShareTokenPayload | null> {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [header, body, sig] = parts as [string, string, string];
	const expected = await hmacSha256(`${header}.${body}`);
	const got = base64UrlDecode(sig);
	if (!timingSafeEqual(expected, got)) return null;
	let payload: ShareTokenPayload;
	try {
		payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
	} catch {
		return null;
	}
	if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
	return payload;
}
