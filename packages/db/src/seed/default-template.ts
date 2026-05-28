import type { DbClient } from "../client.ts";
import {
	checklistItems,
	mediaRequirements,
	specializations,
	stageDependencies,
	stages,
	subStages,
	templates,
} from "../schema/tenant.ts";
import { withTenant } from "../with-tenant.ts";
import { DEFAULT_TEMPLATE_EN } from "./tz-content.en.ts";
import { DEFAULT_TEMPLATE_RU } from "./tz-content.ru.ts";
import type { SeedLanguage, SeedTemplate } from "./tz-content.ts";
import { DEFAULT_TEMPLATE_UZ } from "./tz-content.uz.ts";

function pickTemplate(lang: SeedLanguage): SeedTemplate {
	switch (lang) {
		case "ru":
			return DEFAULT_TEMPLATE_RU;
		case "uz":
			return DEFAULT_TEMPLATE_UZ;
		default:
			return DEFAULT_TEMPLATE_EN;
	}
}

/**
 * Inserts the TZ default template into a tenant schema. Idempotent only at the
 * "schema is empty" level — assumes provisioning called once. Safe to call
 * inside provisionTenant() right after migrations land.
 */
export async function seedDefaultTemplate(
	db: DbClient,
	schemaName: string,
	lang: SeedLanguage = "en",
): Promise<void> {
	const template = pickTemplate(lang);
	await withTenant(db, schemaName, async (tx) => {
		// Specializations lookup
		if (template.specializations.length > 0) {
			await tx.insert(specializations).values(template.specializations.map((name) => ({ name })));
		}

		const [tpl] = await tx
			.insert(templates)
			.values({ name: template.name, isDefault: true })
			.returning({ id: templates.id });
		if (!tpl) throw new Error("seed: failed to insert template");

		// Sub-stages in insertion order, indexed by code so we can wire dependencies linearly.
		const subStageIdByCode = new Map<string, string>();

		for (const stage of template.stages) {
			const [s] = await tx
				.insert(stages)
				.values({ templateId: tpl.id, order: stage.order, name: stage.name })
				.returning({ id: stages.id });
			if (!s) throw new Error(`seed: failed to insert stage ${stage.order}`);

			let subOrder = 1;
			for (const sub of stage.subStages) {
				const [ss] = await tx
					.insert(subStages)
					.values({
						stageId: s.id,
						order: subOrder++,
						code: sub.code,
						name: sub.name,
						performerType: sub.performerType,
						specialization: sub.specialization ?? null,
						standardDurationDays: sub.standardDurationDays,
						wageRatePerSqm: sub.wageRatePerSqm,
						description: sub.description ?? null,
					})
					.returning({ id: subStages.id });
				if (!ss) throw new Error(`seed: failed to insert sub-stage ${sub.code}`);
				subStageIdByCode.set(sub.code, ss.id);

				if (sub.checklistItems.length > 0) {
					await tx.insert(checklistItems).values(
						sub.checklistItems.map((item, idx) => ({
							subStageId: ss.id,
							order: idx + 1,
							text: item.text,
							criteria: item.criteria ?? null,
						})),
					);
				}

				if (sub.mediaRequirements.length > 0) {
					await tx.insert(mediaRequirements).values(
						sub.mediaRequirements.map((m) => ({
							subStageId: ss.id,
							mediaType: m.mediaType,
							required: m.required,
							description: m.description,
						})),
					);
				}
			}
		}

		// Linear dependency edges: each sub-stage depends on the previous one in document order.
		const codesInOrder = template.stages.flatMap((st) => st.subStages.map((s) => s.code));
		for (let i = 1; i < codesInOrder.length; i++) {
			const current = subStageIdByCode.get(codesInOrder[i] as string);
			const prereq = subStageIdByCode.get(codesInOrder[i - 1] as string);
			if (!current || !prereq) throw new Error("seed: missing sub-stage id for dependency");
			await tx.insert(stageDependencies).values({
				subStageId: current,
				prerequisiteSubStageId: prereq,
			});
		}
	});
}
