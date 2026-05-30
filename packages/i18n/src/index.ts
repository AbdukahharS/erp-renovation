import enNotifications from "./locales/en/notifications.json" with { type: "json" };
import ruNotifications from "./locales/ru/notifications.json" with { type: "json" };
import uzNotifications from "./locales/uz/notifications.json" with { type: "json" };

export const SUPPORTED_LOCALES = ["en", "ru", "uz"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isSupportedLocale(value: unknown): value is Locale {
	return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

const notificationCatalogs = {
	en: enNotifications,
	ru: ruNotifications,
	uz: uzNotifications,
} as const satisfies Record<Locale, unknown>;

/**
 * Resolve a dotted key (e.g. "STAGE_AVAILABLE.inspector.title") against the
 * locale's notification catalog, falling back to English then to the key itself.
 * `{varName}` placeholders in the resolved string are substituted from params.
 */
export function translateNotification(
	locale: string,
	key: string,
	params: Record<string, unknown> = {},
): string {
	const resolved = resolve(locale, key) ?? resolve(DEFAULT_LOCALE, key);
	if (resolved === null) return key;
	return resolved.replace(/\{(\w+)\}/g, (_, name: string) => {
		const v = params[name];
		return v === undefined || v === null ? "" : String(v);
	});
}

function resolve(locale: string, key: string): string | null {
	const catalog = (notificationCatalogs as Record<string, unknown>)[locale];
	if (!catalog) return null;
	let cur: unknown = catalog;
	for (const segment of key.split(".")) {
		if (cur && typeof cur === "object" && segment in (cur as Record<string, unknown>)) {
			cur = (cur as Record<string, unknown>)[segment];
		} else {
			return null;
		}
	}
	return typeof cur === "string" ? cur : null;
}

export type NotificationKind =
	| "STAGE_AVAILABLE"
	| "STAGE_SUBMITTED"
	| "STAGE_REJECTED"
	| "STAGE_BLOCKED"
	| "STAGE_UNBLOCKED";

export type PerformerType = "MASTER" | "INSPECTOR";

/**
 * Map (type, performerType) → catalog title/body keys. Both worker (push) and
 * web (in-app center) call this so they stay in lockstep on key naming.
 *
 * STAGE_AVAILABLE has separate inspector/master copy because the inspector
 * variant talks about "initial acceptance" rather than starting work. Other
 * kinds are performer-agnostic.
 */
export function notificationKeys(
	type: NotificationKind,
	performerType: PerformerType | null | undefined,
): { titleKey: string; bodyKey: string } {
	if (type === "STAGE_AVAILABLE") {
		const variant = performerType === "INSPECTOR" ? "inspector" : "master";
		return {
			titleKey: `STAGE_AVAILABLE.${variant}.title`,
			bodyKey: `STAGE_AVAILABLE.${variant}.body`,
		};
	}
	return { titleKey: `${type}.title`, bodyKey: `${type}.body` };
}
