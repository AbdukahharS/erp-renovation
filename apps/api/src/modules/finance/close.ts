import { type AssetKind, properties, propertyAssets } from "@repo/db/schema/tenant";
import type { CloseUnitInput, PropertyFinanceSummary } from "@repo/validators";
import { eq } from "drizzle-orm";
import { buildAssetKey, r2Client } from "../../lib/r2.ts";
import { renderFinalReport, renderHandoverCertificate } from "./pdf.tsx";
import {
	allMasterStagesAccepted,
	buildDefectSummary,
	buildPropertyFinanceSummary,
	linkPortfolioAssets,
	persistClosing,
	validatePortfolioAssets,
} from "./service.ts";

// biome-ignore lint/suspicious/noExplicitAny: tx is the inner Drizzle transaction
type Tx = any;

type RunInTenant = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

/**
 * Upload a generated document buffer to R2 and create the matching
 * property_assets row. Returns null if R2 isn't configured so the closing
 * still persists; the structured snapshot remains the source of truth.
 */
async function uploadGeneratedDoc(
	tx: Tx,
	args: {
		tenantSchema: string;
		propertyId: string;
		kind: AssetKind;
		contentType: string;
		buffer: Buffer;
	},
): Promise<string | null> {
	if (!r2Client) return null;
	const key = buildAssetKey({
		tenantSchema: args.tenantSchema,
		propertyId: args.propertyId,
		kind: args.kind,
		contentType: args.contentType,
	});
	await r2Client.write(key, args.buffer, { type: args.contentType });
	const [asset] = await tx
		.insert(propertyAssets)
		.values({
			propertyId: args.propertyId,
			kind: args.kind,
			r2Key: key,
			contentType: args.contentType,
			sizeBytes: args.buffer.byteLength,
		})
		.returning({ id: propertyAssets.id });
	return asset?.id ?? null;
}

/**
 * Orchestrates the unit-closing flow:
 *   1. Verify property is COMPLETED and all MASTER sub-stages ACCEPTED.
 *   2. Validate portfolio asset ids.
 *   3. Snapshot Plan-vs-Actual + defect summary.
 *   4. Render handover certificate + final report PDFs and upload to R2
 *      (best-effort: closing still proceeds with structured snapshot if R2 is
 *      unconfigured — sufficient for tests/dev; production has R2).
 *   5. Persist `unit_closings` row and transition property → ARCHIVED.
 *
 * Wraps the entire flow in one tenant transaction; if PDF generation fails
 * the transaction rolls back, leaving the property untouched.
 */
export async function finalizeClosing(args: {
	propertyId: string;
	input: CloseUnitInput;
	closedBy: string;
	tenantSchema: string;
	runInTenant: RunInTenant;
	// biome-ignore lint/suspicious/noExplicitAny: Elysia's `set` is loosely typed
	set: any;
}): Promise<
	| { id: string; certificateAssetId: string | null; finalReportAssetId: string | null }
	| { error: string }
> {
	return await args.runInTenant(async (tx) => {
		const [prop] = await tx
			.select()
			.from(properties)
			.where(eq(properties.id, args.propertyId))
			.limit(1);
		if (!prop) {
			args.set.status = 404;
			return { error: "property not found" };
		}
		if (prop.status === "ARCHIVED") {
			args.set.status = 409;
			return { error: "property already archived" };
		}
		if (prop.status !== "COMPLETED") {
			args.set.status = 409;
			return { error: "property is not complete" };
		}
		const allAccepted = await allMasterStagesAccepted(tx, prop.id);
		if (!allAccepted) {
			args.set.status = 409;
			return { error: "not all master sub-stages are accepted" };
		}

		const summary = await buildPropertyFinanceSummary(tx, prop.id);
		if (!summary) {
			args.set.status = 500;
			return { error: "failed to build summary" };
		}
		const defectSummary = await buildDefectSummary(tx, prop.id);

		let portfolioRows: Array<{ id: string }> = [];
		try {
			portfolioRows = await validatePortfolioAssets(tx, prop.id, args.input.portfolioAssetIds);
		} catch (err) {
			args.set.status = 400;
			return { error: (err as Error).message };
		}

		const closedAt = new Date();
		const propRef = { id: prop.id, name: prop.name, address: prop.address };

		const certBuf = await renderHandoverCertificate({
			property: propRef,
			summary,
			closedBy: args.closedBy,
			closedAt,
		});
		const reportBuf = await renderFinalReport({
			property: propRef,
			summary,
			defects: defectSummary,
			closedAt,
		});

		const certificateAssetId = await uploadGeneratedDoc(tx, {
			tenantSchema: args.tenantSchema,
			propertyId: prop.id,
			kind: "HANDOVER_CERTIFICATE",
			contentType: "application/pdf",
			buffer: certBuf,
		});
		const finalReportAssetId = await uploadGeneratedDoc(tx, {
			tenantSchema: args.tenantSchema,
			propertyId: prop.id,
			kind: "FINAL_REPORT",
			contentType: "application/pdf",
			buffer: reportBuf,
		});

		await linkPortfolioAssets(tx, prop.id, portfolioRows, args.closedBy);

		const { id } = await persistClosing(tx, {
			propertyId: prop.id,
			closedBy: args.closedBy,
			input: args.input,
			summary: summary satisfies PropertyFinanceSummary,
			defectSummary,
			certificateAssetId,
			finalReportAssetId,
		});
		return { id, certificateAssetId, finalReportAssetId };
	});
}
