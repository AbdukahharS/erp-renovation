import { z } from "zod";

export const FinancialTransactionTypeSchema = z.enum(["WAGE_CREDIT", "BUDGET_DECREMENT"]);
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
