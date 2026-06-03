import { DEFAULT_TEMPLATE_EN } from "./en.ts";
import { DEFAULT_TEMPLATE_RU } from "./ru.ts";
import {
	DEFAULT_TEMPLATE_LOCALES,
	type DefaultTemplateContent,
	type DefaultTemplateLocale,
} from "./types.ts";
import { DEFAULT_TEMPLATE_UZ } from "./uz.ts";

export {
	DEFAULT_TEMPLATE_LOCALES,
	type DefaultTemplateContent,
	type DefaultTemplateLocale,
} from "./types.ts";

export function getDefaultTemplateContent(locale: DefaultTemplateLocale): DefaultTemplateContent {
	switch (locale) {
		case "ru":
			return DEFAULT_TEMPLATE_RU;
		case "uz":
			return DEFAULT_TEMPLATE_UZ;
		default:
			return DEFAULT_TEMPLATE_EN;
	}
}

export function isDefaultTemplateLocale(value: unknown): value is DefaultTemplateLocale {
	return (
		typeof value === "string" && (DEFAULT_TEMPLATE_LOCALES as readonly string[]).includes(value)
	);
}
