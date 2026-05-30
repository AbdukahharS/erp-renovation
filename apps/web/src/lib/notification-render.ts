import {
	type NotificationKind,
	notificationKeys,
	type PerformerType,
	translateNotification,
} from "@repo/i18n";
import i18n from "./i18n";
import type { NotificationItem } from "./queries/notifications";

const KNOWN: NotificationKind[] = [
	"STAGE_AVAILABLE",
	"STAGE_SUBMITTED",
	"STAGE_REJECTED",
	"STAGE_BLOCKED",
	"STAGE_UNBLOCKED",
];

/**
 * Render an in-app notification's title/body in the current i18next language.
 * Prefers translating from `localizationParams` (set by notification-dispatch
 * since the Phase 8 localization patch) and falls back to the stored English
 * `title`/`body` for older rows.
 */
export function renderNotification(item: NotificationItem): { title: string; body: string } {
	if (!item.localizationParams || !KNOWN.includes(item.type)) {
		return { title: item.title, body: item.body };
	}
	const params = item.localizationParams;
	const performerType = (params.performerType ?? null) as PerformerType | null;
	const { titleKey, bodyKey } = notificationKeys(item.type, performerType);
	const locale = (i18n.language || "en").split("-")[0] ?? "en";
	return {
		title: translateNotification(locale, titleKey, params),
		body: translateNotification(locale, bodyKey, params),
	};
}
