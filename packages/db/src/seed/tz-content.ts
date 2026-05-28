/**
 * Default renovation template — shape and helpers.
 *
 * Per-language content lives in tz-content.{en,ru,uz}.ts and is dispatched by
 * seed/default-template.ts. Edits to a tenant's copy of this template are
 * independent — these constants only define the *initial* state at
 * provisioning time.
 */

import type { MediaType, PerformerType } from "../schema/tenant.ts";

export interface SeedChecklistItem {
	text: string;
	criteria?: string;
}

export interface SeedMediaRequirement {
	mediaType: MediaType;
	required: boolean;
	description: string;
}

export interface SeedSubStage {
	code: string;
	name: string;
	performerType: PerformerType;
	specialization?: string;
	standardDurationDays: number;
	wageRatePerSqm: string;
	description?: string;
	checklistItems: SeedChecklistItem[];
	mediaRequirements: SeedMediaRequirement[];
}

export interface SeedStage {
	order: number;
	name: string;
	subStages: SeedSubStage[];
}

export interface SeedTemplate {
	name: string;
	specializations: string[];
	stages: SeedStage[];
}

export const photo = (description: string, required = true): SeedMediaRequirement => ({
	mediaType: "PHOTO",
	required,
	description,
});

export const video = (description: string, required = false): SeedMediaRequirement => ({
	mediaType: "VIDEO",
	required,
	description,
});

export type SeedLanguage = "en" | "ru" | "uz";
