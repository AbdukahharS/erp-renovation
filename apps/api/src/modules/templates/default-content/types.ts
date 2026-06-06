/**
 * Default ERP renovation template — shape and helpers.
 *
 * Per-language content lives in en.ts / ru.ts / uz.ts and is selected by
 * getDefaultTemplateContent() in index.ts. This module is the canonical
 * "ERP-default" template source; it is NOT seeded at tenant provisioning.
 * The Owner explicitly creates a template from it via POST /templates with
 * source.type = "erp-default".
 */

import type { MediaType, PerformerType } from "@repo/db/schema/tenant";
import type { SpecializationKey } from "@repo/validators";

export interface DefaultChecklistItem {
	text: string;
	criteria?: string;
}

export interface DefaultMediaRequirement {
	mediaType: MediaType;
	required: boolean;
	description: string;
}

export interface DefaultSubStage {
	code: string;
	name: string;
	performerType: PerformerType;
	specialization?: SpecializationKey;
	standardDurationDays: number;
	wageRatePerSqm: string;
	description?: string;
	checklistItems: DefaultChecklistItem[];
	mediaRequirements: DefaultMediaRequirement[];
}

export interface DefaultStage {
	order: number;
	name: string;
	subStages: DefaultSubStage[];
}

export interface DefaultTemplateContent {
	name: string;
	stages: DefaultStage[];
}

export const photo = (description: string, required = true): DefaultMediaRequirement => ({
	mediaType: "PHOTO",
	required,
	description,
});

export const video = (description: string, required = false): DefaultMediaRequirement => ({
	mediaType: "VIDEO",
	required,
	description,
});

export const DEFAULT_TEMPLATE_LOCALES = ["en", "ru", "uz"] as const;
export type DefaultTemplateLocale = (typeof DEFAULT_TEMPLATE_LOCALES)[number];
