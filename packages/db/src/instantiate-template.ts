import { asc, sql as dsql, eq, inArray } from "drizzle-orm";
import {
	checklistItemInstances,
	checklistItems,
	mediaRequirementInstances,
	mediaRequirements,
	stageInstanceDependencies,
	stageInstances,
	stages,
	subStageInstances,
	subStages,
} from "./schema/tenant.ts";

/**
 * Deep-copies a template (stages → sub-stages → checklist items → media
 * requirements → linear dependency chain) into per-property instance tables.
 *
 * - Freezes wage at instantiation: `wageAmount = wageRatePerSqm * areaSqm`
 *   computed in Postgres `numeric` so float-precision loss can't drift money.
 *   INSPECTOR rows get 0 (no per-m² wage at gate stages).
 * - Sets the very first sub-stage (document order) to `AVAILABLE` — that's
 *   Sub-stage 1.1, the INSPECTOR-typed gate. All other sub-stages start LOCKED.
 *
 * `areaSqm` is taken as a string (the validator-normalized numeric form) and
 * passed through to Postgres so the multiplication stays in `numeric` space.
 *
 * Must be called inside a tenant-scoped transaction (caller's runInTenant tx).
 */
export async function instantiateTemplate(
	// biome-ignore lint/suspicious/noExplicitAny: tx is the runInTenant transaction handle
	tx: any,
	propertyId: string,
	templateId: string,
	areaSqm: string,
): Promise<void> {
	const stageRows = (await tx
		.select()
		.from(stages)
		.where(eq(stages.templateId, templateId))
		.orderBy(asc(stages.order))) as Array<{ id: string; order: number; name: string }>;

	if (stageRows.length === 0) {
		throw new Error("instantiateTemplate: template has no stages");
	}

	const stageInstanceIdByTemplateId = new Map<string, string>();
	for (const s of stageRows) {
		const [inserted] = (await tx
			.insert(stageInstances)
			.values({
				propertyId,
				templateStageId: s.id,
				order: s.order,
				name: s.name,
			})
			.returning({ id: stageInstances.id })) as Array<{ id: string }>;
		if (!inserted) throw new Error("instantiateTemplate: stage_instances insert failed");
		stageInstanceIdByTemplateId.set(s.id, inserted.id);
	}

	const subStageRows = (await tx
		.select({
			id: subStages.id,
			stageId: subStages.stageId,
			order: subStages.order,
			code: subStages.code,
			name: subStages.name,
			performerType: subStages.performerType,
			specialization: subStages.specialization,
			standardDurationDays: subStages.standardDurationDays,
			wageRatePerSqm: subStages.wageRatePerSqm,
			description: subStages.description,
			stageOrder: stages.order,
		})
		.from(subStages)
		.innerJoin(stages, eq(stages.id, subStages.stageId))
		.where(eq(stages.templateId, templateId))
		.orderBy(asc(stages.order), asc(subStages.order))) as Array<{
		id: string;
		stageId: string;
		order: number;
		code: string;
		name: string;
		performerType: "MASTER" | "INSPECTOR";
		specialization: string | null;
		standardDurationDays: number;
		wageRatePerSqm: string;
		description: string | null;
		stageOrder: number;
	}>;

	const subStageInstanceIdByTemplateId = new Map<string, string>();
	// Document order is preserved by the orderBy above; first row is Sub-stage 1.1.
	for (let i = 0; i < subStageRows.length; i++) {
		const ss = subStageRows[i];
		if (!ss) continue;
		const stageInstanceId = stageInstanceIdByTemplateId.get(ss.stageId);
		if (!stageInstanceId) throw new Error("instantiateTemplate: missing parent stage instance");
		// Multiply in Postgres numeric; column is numeric(14,2) so the result is
		// rounded to two decimals on insert without JS float drift.
		const wage =
			ss.performerType === "MASTER"
				? dsql`${ss.wageRatePerSqm}::numeric * ${areaSqm}::numeric`
				: dsql`0::numeric`;
		const [inserted] = (await tx
			.insert(subStageInstances)
			.values({
				stageInstanceId,
				templateSubStageId: ss.id,
				order: ss.order,
				code: ss.code,
				name: ss.name,
				performerType: ss.performerType,
				specialization: ss.specialization,
				standardDurationDays: ss.standardDurationDays,
				wageAmount: wage,
				description: ss.description,
				status: i === 0 ? "AVAILABLE" : "LOCKED",
			})
			.returning({ id: subStageInstances.id })) as Array<{ id: string }>;
		if (!inserted) throw new Error("instantiateTemplate: sub_stage_instances insert failed");
		subStageInstanceIdByTemplateId.set(ss.id, inserted.id);
	}

	const allSubStageIds = subStageRows.map((r) => r.id);
	if (allSubStageIds.length > 0) {
		// Scope by this template's sub-stage ids so tenants with multiple authored
		// templates don't pay for a full-table scan.
		const checklistRows = (await tx
			.select()
			.from(checklistItems)
			.where(inArray(checklistItems.subStageId, allSubStageIds))
			.orderBy(asc(checklistItems.order))) as Array<{
			id: string;
			subStageId: string;
			order: number;
			text: string;
			criteria: string | null;
		}>;
		if (checklistRows.length > 0) {
			await tx.insert(checklistItemInstances).values(
				checklistRows.map((ci) => ({
					subStageInstanceId: subStageInstanceIdByTemplateId.get(ci.subStageId) as string,
					order: ci.order,
					text: ci.text,
					criteria: ci.criteria,
				})),
			);
		}

		const mediaRows = (await tx
			.select()
			.from(mediaRequirements)
			.where(inArray(mediaRequirements.subStageId, allSubStageIds))) as Array<{
			id: string;
			subStageId: string;
			mediaType: "PHOTO" | "VIDEO";
			required: boolean;
			description: string;
		}>;
		if (mediaRows.length > 0) {
			await tx.insert(mediaRequirementInstances).values(
				mediaRows.map((m) => ({
					subStageInstanceId: subStageInstanceIdByTemplateId.get(m.subStageId) as string,
					mediaType: m.mediaType,
					required: m.required,
					description: m.description,
				})),
			);
		}
	}

	// Linear chain in document order: each sub-stage instance depends on the previous.
	const orderedInstanceIds: string[] = [];
	for (const ss of subStageRows) {
		const ssiId = subStageInstanceIdByTemplateId.get(ss.id);
		if (ssiId) orderedInstanceIds.push(ssiId);
	}
	if (orderedInstanceIds.length >= 2) {
		const edges = orderedInstanceIds.slice(1).map((id, idx) => ({
			subStageInstanceId: id,
			prerequisiteSubStageInstanceId: orderedInstanceIds[idx] as string,
		}));
		await tx.insert(stageInstanceDependencies).values(edges);
	}
}
