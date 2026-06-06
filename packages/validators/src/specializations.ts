import { z } from "zod";

// Fixed, locale-independent set of master specializations. Stored verbatim in
// `sub_stages.specialization`, `sub_stage_instances.specialization`, and
// `master_profiles.specializations[]`. Display labels live in i18n bundles
// (`specializations.<KEY>`). Custom specializations are intentionally not
// supported — the list is closed by product decision.
export const SPECIALIZATIONS = [
	"DEMOLITION",
	"FOREMAN",
	"MASON",
	"PLASTERER",
	"HVAC",
	"PLUMBER",
	"ELECTRICIAN",
	"SCREED",
	"DRYWALL",
	"DOOR_INSTALLER",
	"PAINTER",
	"TILER",
	"FLOORING",
	"CLEANING",
] as const;

export const SpecializationKeySchema = z.enum(SPECIALIZATIONS);
export type SpecializationKey = z.infer<typeof SpecializationKeySchema>;
