import { z } from "zod";
import { RoleSchema } from "./auth.ts";

export const CreateInvitationInput = z.object({
	role: RoleSchema,
	email: z.string().email().optional(),
	expiresInDays: z.number().int().min(1).max(60).default(14),
});
export type CreateInvitationInput = z.infer<typeof CreateInvitationInput>;

export const InvitationRowSchema = z.object({
	token: z.string(),
	tenantId: z.string().uuid(),
	role: RoleSchema,
	email: z.string().nullable(),
	createdBy: z.string(),
	createdAt: z.string(),
	expiresAt: z.string(),
	consumedAt: z.string().nullable(),
	consumedByUserId: z.string().nullable(),
});
export type InvitationRow = z.infer<typeof InvitationRowSchema>;

export const InvitationPreviewSchema = z.object({
	tenantName: z.string(),
	role: RoleSchema,
	expiresAt: z.string(),
	status: z.enum(["PENDING", "CONSUMED", "EXPIRED"]),
	specializations: z.array(z.object({ id: z.string().uuid(), name: z.string() })).optional(),
});
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>;

export const RedeemInvitationInput = z.object({
	name: z.string().min(1),
	email: z.string().email(),
	password: z.string().min(8),
	displayName: z.string().min(1).optional(),
	phone: z.string().optional(),
	specializations: z.array(z.string()).optional(),
});
export type RedeemInvitationInput = z.infer<typeof RedeemInvitationInput>;

export const UpdateAvailabilityInput = z.object({
	availabilityOverride: z.string().nullable(),
	availabilityOverrideUntil: z.string().datetime().nullable(),
});
export type UpdateAvailabilityInput = z.infer<typeof UpdateAvailabilityInput>;

export const UpdateMasterInput = z.object({
	displayName: z.string().min(1).optional(),
	phone: z.string().nullable().optional(),
	specializations: z.array(z.string()).optional(),
});
export type UpdateMasterInput = z.infer<typeof UpdateMasterInput>;

export const MasterRatingSchema = z.object({
	masterUserId: z.string(),
	acceptedCount: z.number().int(),
	rejectedCount: z.number().int(),
	avgDurationRatio: z.string().nullable(),
	computedAt: z.string(),
});
export type MasterRating = z.infer<typeof MasterRatingSchema>;
