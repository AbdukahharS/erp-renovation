import { z } from "zod";

export const RoleSchema = z.enum(["OWNER", "INSPECTOR", "MASTER", "PROCUREMENT"]);
export type Role = z.infer<typeof RoleSchema>;

export const LoginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const TenantMembershipSchema = z.object({
	tenantId: z.string().uuid(),
	tenantSlug: z.string(),
	tenantName: z.string(),
	role: RoleSchema,
});
export type TenantMembership = z.infer<typeof TenantMembershipSchema>;

export const SessionMeSchema = z.object({
	user: z.object({
		id: z.string(),
		email: z.string().email(),
		name: z.string(),
	}),
	activeTenantId: z.string().uuid().nullable(),
	activeRole: RoleSchema.nullable(),
	memberships: z.array(TenantMembershipSchema),
});
export type SessionMe = z.infer<typeof SessionMeSchema>;

export const SwitchTenantSchema = z.object({
	tenantId: z.string().uuid(),
});
export type SwitchTenantInput = z.infer<typeof SwitchTenantSchema>;

export const CreateTenantSchema = z.object({
	name: z.string().min(1),
	slug: z
		.string()
		.min(2)
		.regex(/^[a-z0-9-]+$/),
	ownerEmail: z.string().email(),
	ownerName: z.string().min(1),
	ownerPassword: z.string().min(8),
});
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

export const CreateTenantResultSchema = z.object({
	tenantId: z.string().uuid(),
	schemaName: z.string(),
	ownerUserId: z.string(),
});
export type CreateTenantResult = z.infer<typeof CreateTenantResultSchema>;
