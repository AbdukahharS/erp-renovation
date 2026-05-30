import { z } from "zod";

export const NotificationTypeSchema = z.enum([
	"STAGE_AVAILABLE",
	"STAGE_SUBMITTED",
	"STAGE_REJECTED",
	"STAGE_BLOCKED",
	"STAGE_UNBLOCKED",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const LocaleSchema = z.enum(["en", "ru", "uz"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const PushSubscriptionInputSchema = z.object({
	endpoint: z.string().url(),
	keys: z.object({
		p256dh: z.string().min(1),
		auth: z.string().min(1),
	}),
	userAgent: z.string().max(512).optional(),
	locale: LocaleSchema.optional(),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInputSchema>;

export const UpdateSubscriptionLocaleInputSchema = z.object({
	endpoint: z.string().url(),
	locale: LocaleSchema,
});
export type UpdateSubscriptionLocaleInput = z.infer<typeof UpdateSubscriptionLocaleInputSchema>;

export const NotificationListQuerySchema = z.object({
	unreadOnly: z
		.union([z.boolean(), z.string()])
		.optional()
		.transform((v) => v === true || v === "true" || v === "1"),
	limit: z.coerce.number().int().min(1).max(100).default(30),
	cursor: z.string().datetime().optional(),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

export const NotificationItemSchema = z.object({
	id: z.string().uuid(),
	type: NotificationTypeSchema,
	title: z.string(),
	body: z.string(),
	targetUrl: z.string().nullable(),
	propertyId: z.string().uuid().nullable(),
	subStageInstanceId: z.string().uuid().nullable(),
	localizationParams: z.record(z.string(), z.unknown()).nullable(),
	readAt: z.string().nullable(),
	createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof NotificationItemSchema>;

export const MarkReadInputSchema = z
	.object({
		ids: z.array(z.string().uuid()).optional(),
		all: z.boolean().optional(),
	})
	.refine((v) => (v.ids && v.ids.length > 0) || v.all, {
		message: "Provide either ids[] or all=true",
	});
export type MarkReadInput = z.infer<typeof MarkReadInputSchema>;

export const UnreadCountSchema = z.object({ count: z.number().int().min(0) });
export type UnreadCount = z.infer<typeof UnreadCountSchema>;

export const VapidPublicKeySchema = z.object({ publicKey: z.string() });
export type VapidPublicKey = z.infer<typeof VapidPublicKeySchema>;

// Wire shape for WebSocket realtime events (tenant-scoped).
export const RealtimeEventSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("STAGE_ACCEPTED"),
		propertyId: z.string().uuid(),
		subStageInstanceId: z.string().uuid(),
	}),
	z.object({
		kind: z.literal("FINANCE_CHANGED"),
		propertyId: z.string().uuid().nullable(),
		masterUserId: z.string().nullable(),
	}),
	z.object({
		kind: z.literal("NOTIFICATION_CREATED"),
		notificationId: z.string().uuid(),
		recipientUserId: z.string(),
	}),
	z.object({
		kind: z.literal("NOTIFICATION_READ"),
		recipientUserId: z.string(),
	}),
]);
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
