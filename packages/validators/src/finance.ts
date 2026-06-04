import { z } from "zod";

export const FinancialTransactionTypeSchema = z.enum([
	"WAGE_CREDIT",
	"BUDGET_DECREMENT",
	"MATERIAL_COST",
	"TRANSPORT_COST",
	"EXTERNAL_CONTRACTOR_COST",
	"OTHER_COST",
	"FINE",
	"PAYOUT_SETTLEMENT",
	"REVERSAL",
]);
export type FinancialTransactionType = z.infer<typeof FinancialTransactionTypeSchema>;

export const MasterBalanceSchema = z.object({
	masterUserId: z.string(),
	balance: z.string(),
	updatedAt: z.coerce.date(),
});
export type MasterBalance = z.infer<typeof MasterBalanceSchema>;

export const FinancialTransactionSchema = z.object({
	id: z.string().uuid(),
	type: FinancialTransactionTypeSchema,
	masterUserId: z.string().nullable(),
	propertyId: z.string().uuid().nullable(),
	subStageInstanceId: z.string().uuid().nullable(),
	amount: z.string(),
	description: z.string().nullable(),
	descriptionKey: z.string().nullable(),
	descriptionParams: z.record(z.string(), z.unknown()).nullable(),
	createdAt: z.coerce.date(),
});
export type FinancialTransaction = z.infer<typeof FinancialTransactionSchema>;

export const NotificationIntentTypeSchema = z.enum(["STAGE_AVAILABLE"]);
export const NotificationIntentStatusSchema = z.enum(["CREATED", "SENT", "FAILED"]);

export const NotificationIntentSchema = z.object({
	id: z.string().uuid(),
	type: NotificationIntentTypeSchema,
	targetUserId: z.string(),
	subStageInstanceId: z.string().uuid().nullable(),
	propertyId: z.string().uuid().nullable(),
	payload: z.unknown().nullable(),
	status: NotificationIntentStatusSchema,
	createdAt: z.coerce.date(),
	sentAt: z.coerce.date().nullable(),
});
export type NotificationIntent = z.infer<typeof NotificationIntentSchema>;

// ---------- Phase 7: finance authoring + dashboard ----------

// MATERIAL is intentionally absent: material costs flow exclusively from
// warehouse issuances (see packages/validators/src/materials.ts). Manual cost
// authoring is reserved for off-warehouse expenses.
export const PropertyCostCategorySchema = z.enum(["TRANSPORT", "EXTERNAL_CONTRACTOR", "OTHER"]);
export type PropertyCostCategory = z.infer<typeof PropertyCostCategorySchema>;

// Numeric amounts arrive as strings (Drizzle numeric → string). We require a
// positive decimal string with up to 2 fractional digits — keeps the JSON
// Schema export simple (no zod transforms) so it can flow through TypeBox.
const decimalAmount = z
	.string()
	.regex(/^\d+(\.\d{1,2})?$/, "amount must be a positive decimal with up to 2 places")
	.refine((s) => Number(s) > 0, "amount must be > 0");

export const CreatePropertyCostInput = z.object({
	category: PropertyCostCategorySchema,
	amount: decimalAmount,
	description: z.string().trim().min(1).max(500).optional(),
	// Accept ISO string and coerce in the route — z.coerce.date() doesn't
	// round-trip through JSON Schema cleanly.
	incurredAt: z.string().datetime().optional(),
});
export type CreatePropertyCostInput = z.infer<typeof CreatePropertyCostInput>;

export const PropertyCostRowSchema = z.object({
	id: z.string().uuid(),
	propertyId: z.string().uuid(),
	category: PropertyCostCategorySchema,
	amount: z.string(),
	description: z.string().nullable(),
	incurredAt: z.coerce.date(),
	createdBy: z.string(),
	transactionId: z.string().uuid(),
	reversedAt: z.coerce.date().nullable(),
	reversedBy: z.string().nullable(),
	createdAt: z.coerce.date(),
});
export type PropertyCostRow = z.infer<typeof PropertyCostRowSchema>;

export const ApplyFineInput = z.object({
	amount: decimalAmount,
	reason: z.string().trim().min(1).max(500),
});
export type ApplyFineInput = z.infer<typeof ApplyFineInput>;

export const FineRowSchema = z.object({
	id: z.string().uuid(),
	masterUserId: z.string(),
	propertyId: z.string().uuid().nullable(),
	rejectionId: z.string().uuid().nullable(),
	amount: z.string(),
	reason: z.string(),
	appliedBy: z.string(),
	transactionId: z.string().uuid(),
	createdAt: z.coerce.date(),
});
export type FineRow = z.infer<typeof FineRowSchema>;

export const MarkPayoutInput = z.object({
	amount: decimalAmount,
	note: z.string().trim().max(500).optional(),
});
export type MarkPayoutInput = z.infer<typeof MarkPayoutInput>;

export const PayoutSettlementRowSchema = z.object({
	id: z.string().uuid(),
	masterUserId: z.string(),
	amount: z.string(),
	note: z.string().nullable(),
	settledBy: z.string(),
	settledAt: z.coerce.date(),
	transactionId: z.string().uuid(),
});
export type PayoutSettlementRow = z.infer<typeof PayoutSettlementRowSchema>;

export const CloseUnitInput = z.object({
	materialsHandoverChecked: z.literal(true),
	clientHandoverChecked: z.literal(true),
	notes: z.string().trim().max(2000).optional(),
	// PHASE-7 §7.4: "upload of finished portfolio photos" — required. Caller
	// presigns + uploads PORTFOLIO_PHOTO assets first, then submits their ids.
	portfolioAssetIds: z.array(z.string().uuid()).min(1, "at least one portfolio photo is required"),
});
export type CloseUnitInput = z.infer<typeof CloseUnitInput>;

export const PropertyFinanceCostByCategorySchema = z.object({
	category: PropertyCostCategorySchema,
	total: z.string(),
});

export const PropertyFinanceSummarySchema = z.object({
	propertyId: z.string().uuid(),
	propertyName: z.string(),
	areaSqm: z.string(),
	plannedUnitCost: z.string(),
	plannedTotal: z.string(),
	accruedWages: z.string(),
	// Materials sourced from warehouse issuances. Reported separately from
	// `costsByCategory` (which now only carries TRANSPORT/EXTERNAL_CONTRACTOR/
	// OTHER) so the dashboard can display materials and other costs side by
	// side. Already included in `costsTotal` and `actualTotal`.
	materialsCost: z.string(),
	costsByCategory: z.array(PropertyFinanceCostByCategorySchema),
	costsTotal: z.string(),
	finesTotal: z.string(),
	actualTotal: z.string(),
	netProfit: z.string(),
	onBudget: z.boolean(),
	materialsEstimateMissing: z.boolean(),
	status: z.string(),
	closedAt: z.coerce.date().nullable(),
});
export type PropertyFinanceSummary = z.infer<typeof PropertyFinanceSummarySchema>;

export const MasterFinanceViewSchema = z.object({
	masterUserId: z.string(),
	balance: z.string(),
	wagesCredited: z.string(),
	finesDeducted: z.string(),
	payoutsSettled: z.string(),
	transactions: z.array(FinancialTransactionSchema),
	settlements: z.array(PayoutSettlementRowSchema),
});
export type MasterFinanceView = z.infer<typeof MasterFinanceViewSchema>;

export const ClosingPermissionInput = z.object({
	closingPermission: z.boolean(),
});
export type ClosingPermissionInput = z.infer<typeof ClosingPermissionInput>;

export const UnitClosingRowSchema = z.object({
	id: z.string().uuid(),
	propertyId: z.string().uuid(),
	closedBy: z.string(),
	closedAt: z.coerce.date(),
	materialsHandoverChecked: z.boolean(),
	clientHandoverChecked: z.boolean(),
	notes: z.string().nullable(),
	netProfit: z.string(),
	certificateAssetId: z.string().uuid().nullable(),
	finalReportAssetId: z.string().uuid().nullable(),
	reopenedAt: z.coerce.date().nullable(),
	reopenedBy: z.string().nullable(),
});
export type UnitClosingRow = z.infer<typeof UnitClosingRowSchema>;
