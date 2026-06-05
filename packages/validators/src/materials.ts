import { z } from "zod";

export const MaterialUnitSchema = z.enum(["pcs", "m", "m2", "m3", "kg", "l"]);
export type MaterialUnit = z.infer<typeof MaterialUnitSchema>;

export const MaterialMovementTypeSchema = z.enum(["RECEIPT", "ISSUANCE", "ADJUSTMENT", "REVERSAL"]);
export type MaterialMovementType = z.infer<typeof MaterialMovementTypeSchema>;

// Quantities use 3dp so fractional units (kg, m) carry meaningful precision.
const decimalQuantity = z
	.string()
	.regex(/^\d+(\.\d{1,3})?$/, "quantity must be a positive decimal with up to 3 places")
	.refine((s) => Number(s) > 0, "quantity must be > 0");

// Signed delta for adjustments — Postgres carries the sign on the value, not
// the row type, so the validator accepts an optional leading minus.
const signedDecimalQuantity = z
	.string()
	.regex(/^-?\d+(\.\d{1,3})?$/, "delta must be a decimal with up to 3 places")
	.refine((s) => Number(s) !== 0, "delta must be non-zero");

const decimalPrice = z
	.string()
	.regex(/^\d+(\.\d{1,2})?$/, "price must be a positive decimal with up to 2 places")
	.refine((s) => Number(s) >= 0, "price must be >= 0");

export const CreateMaterialInput = z.object({
	name: z.string().trim().min(1).max(200),
	folderId: z.string().uuid().nullable().optional(),
	unit: MaterialUnitSchema,
	price: decimalPrice,
	// If > 0, an opening RECEIPT movement is recorded in the same tx.
	initialQuantity: decimalQuantity.optional(),
});
export type CreateMaterialInput = z.infer<typeof CreateMaterialInput>;

export const UpdateMaterialInput = z.object({
	name: z.string().trim().min(1).max(200).optional(),
	folderId: z.string().uuid().nullable().optional(),
	price: decimalPrice.optional(),
});
export type UpdateMaterialInput = z.infer<typeof UpdateMaterialInput>;

export const CreateFolderInput = z.object({
	name: z.string().trim().min(1).max(100),
});
export type CreateFolderInput = z.infer<typeof CreateFolderInput>;

export const UpdateFolderInput = z.object({
	name: z.string().trim().min(1).max(100),
});
export type UpdateFolderInput = z.infer<typeof UpdateFolderInput>;

export const FolderRowSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	archivedAt: z.coerce.date().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	materialCount: z.number().int().nonnegative(),
});
export type FolderRow = z.infer<typeof FolderRowSchema>;

export const RestockMaterialInput = z.object({
	quantity: decimalQuantity,
	// When provided, also updates `materials.price` to this value.
	unitPrice: decimalPrice.optional(),
	note: z.string().trim().max(500).optional(),
});
export type RestockMaterialInput = z.infer<typeof RestockMaterialInput>;

export const AdjustMaterialInput = z.object({
	delta: signedDecimalQuantity,
	reason: z.string().trim().min(1).max(500),
});
export type AdjustMaterialInput = z.infer<typeof AdjustMaterialInput>;

export const IssueMaterialLineInput = z.object({
	materialId: z.string().uuid(),
	quantity: decimalQuantity,
	note: z.string().trim().max(500).optional(),
});
export type IssueMaterialLineInput = z.infer<typeof IssueMaterialLineInput>;

export const IssueMaterialsInput = z.object({
	propertyId: z.string().uuid(),
	lines: z.array(IssueMaterialLineInput).min(1, "at least one line is required"),
});
export type IssueMaterialsInput = z.infer<typeof IssueMaterialsInput>;

export const MaterialRowSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	folderId: z.string().uuid().nullable(),
	folderName: z.string().nullable(),
	unit: MaterialUnitSchema,
	price: z.string(),
	archivedAt: z.coerce.date().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});
export type MaterialRow = z.infer<typeof MaterialRowSchema>;

export const MaterialWithStockSchema = MaterialRowSchema.extend({
	onHand: z.string(),
});
export type MaterialWithStock = z.infer<typeof MaterialWithStockSchema>;

export const MaterialMovementRowSchema = z.object({
	id: z.string().uuid(),
	materialId: z.string().uuid(),
	type: MaterialMovementTypeSchema,
	delta: z.string(),
	unitPriceSnapshot: z.string().nullable(),
	issuanceId: z.string().uuid().nullable(),
	actorUserId: z.string(),
	reason: z.string().nullable(),
	createdAt: z.coerce.date(),
	propertyId: z.string().uuid().nullable(),
	propertyName: z.string().nullable(),
});
export type MaterialMovementRow = z.infer<typeof MaterialMovementRowSchema>;

export const MaterialIssuanceRowSchema = z.object({
	id: z.string().uuid(),
	propertyId: z.string().uuid(),
	materialId: z.string().uuid(),
	quantity: z.string(),
	unitPriceSnapshot: z.string(),
	amount: z.string(),
	transactionId: z.string().uuid(),
	movementId: z.string().uuid(),
	issuedBy: z.string(),
	note: z.string().nullable(),
	reversedAt: z.coerce.date().nullable(),
	reversedBy: z.string().nullable(),
	createdAt: z.coerce.date(),
});
export type MaterialIssuanceRow = z.infer<typeof MaterialIssuanceRowSchema>;
