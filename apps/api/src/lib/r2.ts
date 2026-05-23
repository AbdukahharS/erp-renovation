import type { AssetKind } from "@repo/db/schema/tenant";
import { S3Client } from "bun";

/**
 * Bun's native S3 client configured against Cloudflare R2 (or any S3-compatible
 * endpoint — MinIO works for local dev). Returns null if env is incomplete so
 * the routes can 503 cleanly without crashing the API on boot.
 */
function readClient(): S3Client | null {
	const endpoint = process.env.R2_ENDPOINT;
	const accessKeyId = process.env.R2_ACCESS_KEY_ID;
	const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
	const bucket = process.env.R2_BUCKET;
	if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
	return new S3Client({ endpoint, accessKeyId, secretAccessKey, bucket });
}

export const r2Client: S3Client | null = readClient();
export const r2Bucket = process.env.R2_BUCKET ?? "";
const presignExpires = Number(process.env.R2_PRESIGN_EXPIRES_SECONDS ?? "900");

export type PresignParams = {
	tenantSchema: string;
	propertyId: string;
	kind: AssetKind;
	contentType: string;
};

export type PresignResult = {
	url: string;
	key: string;
	expiresInSeconds: number;
};

const ALLOWED_CONTENT_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
	"video/mp4",
	"video/quicktime",
]);

function extFromContentType(ct: string): string {
	switch (ct) {
		case "image/jpeg":
			return "jpg";
		case "image/png":
			return "png";
		case "image/webp":
			return "webp";
		case "application/pdf":
			return "pdf";
		case "video/mp4":
			return "mp4";
		case "video/quicktime":
			return "mov";
		default:
			return "bin";
	}
}

/**
 * Pure key builder. Tenant schema is the prefix, so cross-tenant object access
 * requires forging another tenant's prefix (which the attach endpoint refuses
 * via `tenantOwnsKey`). Extracted from the presign path so it can be unit-
 * tested without R2 env present.
 */
export function buildAssetKey(params: PresignParams): string {
	if (!ALLOWED_CONTENT_TYPES.has(params.contentType)) {
		throw new Error(`r2: disallowed content-type ${params.contentType}`);
	}
	if (!/^[a-zA-Z0-9_]+$/.test(params.tenantSchema)) {
		throw new Error(`r2: unsafe tenant schema ${params.tenantSchema}`);
	}
	const ext = extFromContentType(params.contentType);
	const uid = crypto.randomUUID();
	return `${params.tenantSchema}/properties/${params.propertyId}/${params.kind}/${uid}.${ext}`;
}

/**
 * Generates a presigned PUT URL using `buildAssetKey`. Throws if R2 isn't
 * configured; routes translate that into 503.
 */
export function presignPropertyAssetUpload(params: PresignParams): PresignResult {
	if (!r2Client) throw new Error("r2: client not configured");
	const key = buildAssetKey(params);
	const url = r2Client.presign(key, {
		method: "PUT",
		expiresIn: presignExpires,
		type: params.contentType,
	});
	return { url, key, expiresInSeconds: presignExpires };
}

export function tenantOwnsKey(tenantSchema: string, key: string): boolean {
	return key.startsWith(`${tenantSchema}/`);
}

export async function assertAssetExists(key: string): Promise<boolean> {
	if (!r2Client) return false;
	try {
		return await r2Client.file(key).exists();
	} catch {
		return false;
	}
}
