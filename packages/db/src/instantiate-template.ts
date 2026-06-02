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

type PerformerType = "MASTER" | "INSPECTOR";
type MediaType = "PHOTO" | "VIDEO";

/**
 * In-memory snapshot shape — mirrors @repo/validators TemplateSnapshotInput.
 * Duplicated structurally here so this package doesn't take a runtime dep on
 * @repo/validators. The Elysia route validates with the Zod schema before
 * passing it in.
 */
export type SnapshotChecklistItem = {
	order: number;
	text: string;
	criteria?: string | null;
};
export type SnapshotMediaRequirement = {
	mediaType: MediaType;
	required: boolean;
	description: string;
};
export type SnapshotSubStage = {
	order: number;
	code: string;
	name: string;
	performerType: PerformerType;
	specialization?: string | null;
	standardDurationDays: number;
	wageRatePerSqm: string;
	description?: string | null;
	checklistItems: SnapshotChecklistItem[];
	mediaRequirements: SnapshotMediaRequirement[];
};
export type SnapshotStage = {
	order: number;
	name: string;
	subStages: SnapshotSubStage[];
};
export type TemplateSnapshot = {
	stages: SnapshotStage[];
};

type LoadedNode = {
	stage: { name: string; order: number };
	subStages: SnapshotSubStage[];
};

// biome-ignore lint/suspicious/noExplicitAny: tx is the runInTenant transaction handle
async function loadFromDb(tx: any, templateId: string): Promise<LoadedNode[]> {
	const stageRows = (await tx
		.select()
		.from(stages)
		.where(eq(stages.templateId, templateId))
		.orderBy(asc(stages.order))) as Array<{ id: string; order: number; name: string }>;

	if (stageRows.length === 0) return [];

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
		performerType: PerformerType;
		specialization: string | null;
		standardDurationDays: number;
		wageRatePerSqm: string;
		description: string | null;
	}>;

	const allSubIds = subStageRows.map((r) => r.id);
	const [checklistRows, mediaRows] = (await Promise.all([
		allSubIds.length
			? tx
					.select()
					.from(checklistItems)
					.where(inArray(checklistItems.subStageId, allSubIds))
					.orderBy(asc(checklistItems.order))
			: Promise.resolve([]),
		allSubIds.length
			? tx.select().from(mediaRequirements).where(inArray(mediaRequirements.subStageId, allSubIds))
			: Promise.resolve([]),
	])) as [
		Array<{ subStageId: string; order: number; text: string; criteria: string | null }>,
		Array<{
			subStageId: string;
			mediaType: MediaType;
			required: boolean;
			description: string;
		}>,
	];

	const checklistBySub = new Map<string, SnapshotChecklistItem[]>();
	for (const c of checklistRows) {
		const arr = checklistBySub.get(c.subStageId) ?? [];
		arr.push({ order: c.order, text: c.text, criteria: c.criteria });
		checklistBySub.set(c.subStageId, arr);
	}
	const mediaBySub = new Map<string, SnapshotMediaRequirement[]>();
	for (const m of mediaRows) {
		const arr = mediaBySub.get(m.subStageId) ?? [];
		arr.push({ mediaType: m.mediaType, required: m.required, description: m.description });
		mediaBySub.set(m.subStageId, arr);
	}

	const subsByStage = new Map<string, typeof subStageRows>();
	for (const ss of subStageRows) {
		const arr = subsByStage.get(ss.stageId) ?? [];
		arr.push(ss);
		subsByStage.set(ss.stageId, arr);
	}

	return stageRows.map((s) => ({
		stage: { name: s.name, order: s.order },
		subStages: (subsByStage.get(s.id) ?? []).map((ss) => ({
			order: ss.order,
			code: ss.code,
			name: ss.name,
			performerType: ss.performerType,
			specialization: ss.specialization,
			standardDurationDays: ss.standardDurationDays,
			wageRatePerSqm: ss.wageRatePerSqm,
			description: ss.description,
			checklistItems: checklistBySub.get(ss.id) ?? [],
			mediaRequirements: mediaBySub.get(ss.id) ?? [],
		})),
	}));
}

function fromSnapshot(snapshot: TemplateSnapshot): LoadedNode[] {
	const sortedStages = snapshot.stages.slice().sort((a, b) => a.order - b.order);
	const result: LoadedNode[] = sortedStages.map((s) => ({
		stage: { name: s.name, order: s.order },
		subStages: s.subStages
			.slice()
			.sort((a, b) => a.order - b.order)
			.map((ss) => ({
				order: ss.order,
				code: ss.code,
				name: ss.name,
				performerType: ss.performerType,
				specialization: ss.specialization ?? null,
				standardDurationDays: ss.standardDurationDays,
				wageRatePerSqm: ss.wageRatePerSqm,
				description: ss.description ?? null,
				checklistItems: ss.checklistItems
					.slice()
					.sort((a, b) => a.order - b.order)
					.map((ci) => ({ order: ci.order, text: ci.text, criteria: ci.criteria ?? null })),
				mediaRequirements: ss.mediaRequirements.map((m) => ({
					mediaType: m.mediaType,
					required: m.required,
					description: m.description,
				})),
			})),
	}));
	return result;
}

/**
 * Deep-copies a template tree (stages → sub-stages → checklist items → media
 * requirements → linear dependency chain) into per-property instance tables.
 *
 * The tree comes from either:
 * - the DB (default): rows are read from the source template at `templateId`, OR
 * - an in-memory `snapshot` payload (when the Owner edits the picked template
 *   in the property-creation wizard). The chosen `templateId` is still stored
 *   on the property for lineage even when the snapshot diverges.
 *
 * - Freezes wage at instantiation: `wageAmount = wageRatePerSqm * areaSqm`
 *   computed in Postgres `numeric` so float-precision loss can't drift money.
 *   INSPECTOR rows get 0 (no per-m² wage at gate stages).
 * - Sets the very first sub-stage (document order) to `AVAILABLE` — that's
 *   Sub-stage 1.1, the INSPECTOR-typed gate. All other sub-stages start LOCKED.
 *
 * Must be called inside a tenant-scoped transaction (caller's runInTenant tx).
 */
export async function instantiateTemplate(
	// biome-ignore lint/suspicious/noExplicitAny: tx is the runInTenant transaction handle
	tx: any,
	propertyId: string,
	templateId: string,
	areaSqm: string,
	snapshot?: TemplateSnapshot | null,
): Promise<void> {
	const tree = snapshot ? fromSnapshot(snapshot) : await loadFromDb(tx, templateId);

	if (tree.length === 0) {
		throw new Error("instantiateTemplate: template has no stages");
	}

	const stageInstanceIds: string[] = [];
	for (const node of tree) {
		const [inserted] = (await tx
			.insert(stageInstances)
			.values({
				propertyId,
				// No templateStageId when sourced from an edited snapshot — the
				// per-property pipeline may have stages with no template-side parent.
				templateStageId: null,
				order: node.stage.order,
				name: node.stage.name,
			})
			.returning({ id: stageInstances.id })) as Array<{ id: string }>;
		if (!inserted) throw new Error("instantiateTemplate: stage_instances insert failed");
		stageInstanceIds.push(inserted.id);
	}

	const orderedSubInstanceIds: string[] = [];
	let isFirstSub = true;
	for (let si = 0; si < tree.length; si++) {
		const node = tree[si];
		const stageInstanceId = stageInstanceIds[si];
		if (!node || !stageInstanceId) continue;
		for (const ss of node.subStages) {
			const wage =
				ss.performerType === "MASTER"
					? dsql`${ss.wageRatePerSqm}::numeric * ${areaSqm}::numeric`
					: dsql`0::numeric`;
			const [inserted] = (await tx
				.insert(subStageInstances)
				.values({
					stageInstanceId,
					templateSubStageId: null,
					order: ss.order,
					code: ss.code,
					name: ss.name,
					performerType: ss.performerType,
					specialization: ss.specialization,
					standardDurationDays: ss.standardDurationDays,
					wageAmount: wage,
					description: ss.description,
					status: isFirstSub ? "AVAILABLE" : "LOCKED",
				})
				.returning({ id: subStageInstances.id })) as Array<{ id: string }>;
			if (!inserted) throw new Error("instantiateTemplate: sub_stage_instances insert failed");

			if (ss.checklistItems.length > 0) {
				await tx.insert(checklistItemInstances).values(
					ss.checklistItems.map((ci) => ({
						subStageInstanceId: inserted.id,
						order: ci.order,
						text: ci.text,
						criteria: ci.criteria ?? null,
					})),
				);
			}
			if (ss.mediaRequirements.length > 0) {
				await tx.insert(mediaRequirementInstances).values(
					ss.mediaRequirements.map((m) => ({
						subStageInstanceId: inserted.id,
						mediaType: m.mediaType,
						required: m.required,
						description: m.description,
					})),
				);
			}

			orderedSubInstanceIds.push(inserted.id);
			isFirstSub = false;
		}
	}

	if (orderedSubInstanceIds.length >= 2) {
		const edges = orderedSubInstanceIds.slice(1).map((id, idx) => ({
			subStageInstanceId: id,
			prerequisiteSubStageInstanceId: orderedSubInstanceIds[idx] as string,
		}));
		await tx.insert(stageInstanceDependencies).values(edges);
	}
}
