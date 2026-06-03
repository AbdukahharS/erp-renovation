import {
	checklistItems,
	mediaRequirements,
	specializations,
	stageDependencies,
	stages,
	subStages,
	templates,
} from "@repo/db/schema/tenant";
import {
	CreateChecklistItemInput,
	CreateMediaRequirementInput,
	CreateSpecializationInput,
	CreateStageInput,
	CreateSubStageInput,
	CreateTemplateInput,
	ReorderInput,
	SetManualOverrideInput,
	UpdateChecklistItemInput,
	UpdateMediaRequirementInput,
	UpdateStageInput,
	UpdateSubStageInput,
	UpdateTemplateInput,
} from "@repo/validators";
import { asc, eq, inArray, max } from "drizzle-orm";
import { Elysia } from "elysia";
import { zodBody } from "../../lib/zod-body.ts";
import { requireRole } from "../auth/guards.ts";
import { tenancy } from "../tenancy/plugin.ts";
import { type DefaultTemplateContent, getDefaultTemplateContent } from "./default-content/index.ts";

/**
 * Deep-insert a full template tree from a static {@link DefaultTemplateContent}
 * source (the ERP-default template, supplied in code per locale). Mirrors the
 * shape used by the clone path: templates → stages → subStages → checklist
 * items + media requirements → linear stage dependencies. Specializations are
 * upserted by name so re-creating an ERP-default template doesn't duplicate
 * the lookup rows.
 *
 * Returns the new template row id.
 */
async function insertTemplateFromContent(
	// biome-ignore lint/suspicious/noExplicitAny: tx is constrained at the call site
	tx: any,
	name: string,
	content: DefaultTemplateContent,
): Promise<string> {
	if (content.specializations.length > 0) {
		await tx
			.insert(specializations)
			.values(content.specializations.map((n) => ({ name: n })))
			.onConflictDoNothing();
	}

	const [tpl] = (await tx.insert(templates).values({ name }).returning({ id: templates.id })) as {
		id: string;
	}[];
	if (!tpl) throw new Error("failed to insert template");

	const subStageIdByCode = new Map<string, string>();

	for (const stage of content.stages) {
		const [s] = (await tx
			.insert(stages)
			.values({ templateId: tpl.id, order: stage.order, name: stage.name })
			.returning({ id: stages.id })) as { id: string }[];
		if (!s) throw new Error(`failed to insert stage ${stage.order}`);

		let subOrder = 1;
		for (const sub of stage.subStages) {
			const [ss] = (await tx
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
				.returning({ id: subStages.id })) as { id: string }[];
			if (!ss) throw new Error(`failed to insert sub-stage ${sub.code}`);
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

	const codesInOrder = content.stages.flatMap((st) => st.subStages.map((s) => s.code));
	const edges: { subStageId: string; prerequisiteSubStageId: string }[] = [];
	for (let i = 1; i < codesInOrder.length; i++) {
		const current = subStageIdByCode.get(codesInOrder[i] as string);
		const prereq = subStageIdByCode.get(codesInOrder[i - 1] as string);
		if (!current || !prereq) throw new Error("missing sub-stage id for dependency");
		edges.push({ subStageId: current, prerequisiteSubStageId: prereq });
	}
	if (edges.length > 0) await tx.insert(stageDependencies).values(edges);

	return tpl.id;
}

/**
 * Rebuild the linear stage_dependencies chain for a template.
 *
 * Phase 2 stores the rule "each sub-stage depends on the previous one in
 * (stage.order, sub_stage.order) document order". Reorder/delete on stages or
 * sub-stages would otherwise leave stale or broken edges. Manual override
 * fields are not preserved here — they're rebuilt as NONE; Phase 4 owns
 * surfacing the manual-override UI and can re-apply if needed.
 *
 * Snapshot semantics: this updates the template's edges only. Existing
 * property snapshots taken in Phase 3 are deep-copied at instantiation time
 * and unaffected by post-snapshot template edits.
 *
 * Call inside the same withTenant transaction as the mutation. `tx` is loosely
 * typed because Elysia's runInTenant callback already constrains it for the
 * caller; the body only uses standard drizzle methods.
 */
// biome-ignore lint/suspicious/noExplicitAny: tx type is constrained at the call site by runInTenant
async function relinkDependencies(tx: any, templateId: string): Promise<void> {
	const ordered = (await tx
		.select({ id: subStages.id })
		.from(subStages)
		.innerJoin(stages, eq(stages.id, subStages.stageId))
		.where(eq(stages.templateId, templateId))
		.orderBy(asc(stages.order), asc(subStages.order))) as { id: string }[];
	const ids = ordered.map((r) => r.id);
	if (ids.length === 0) return;
	await tx.delete(stageDependencies).where(inArray(stageDependencies.subStageId, ids));
	if (ids.length < 2) return;
	const edges = ids.slice(1).map((id, i) => ({
		subStageId: id,
		prerequisiteSubStageId: ids[i] as string,
	}));
	await tx.insert(stageDependencies).values(edges);
}

// biome-ignore lint/suspicious/noExplicitAny: see relinkDependencies
async function templateIdForStage(tx: any, stageId: string): Promise<string | null> {
	const [row] = (await tx
		.select({ templateId: stages.templateId })
		.from(stages)
		.where(eq(stages.id, stageId))
		.limit(1)) as { templateId: string }[];
	return row?.templateId ?? null;
}

// biome-ignore lint/suspicious/noExplicitAny: see relinkDependencies
async function templateIdForSubStage(tx: any, subStageId: string): Promise<string | null> {
	const [row] = (await tx
		.select({ templateId: stages.templateId })
		.from(stages)
		.innerJoin(subStages, eq(subStages.stageId, stages.id))
		.where(eq(subStages.id, subStageId))
		.limit(1)) as { templateId: string }[];
	return row?.templateId ?? null;
}

/**
 * Phase 2 templates module. Owner-only, tenant-scoped via the tenancy plugin
 * (`runInTenant`). Inputs are validated by Elysia against TypeBox schemas
 * derived from the shared Zod schemas in @repo/validators via `zodBody()` —
 * keeps Zod as runtime source of truth and gives Eden Treaty a real body type
 * on the client.
 */
export const templatesRoutes = new Elysia({ prefix: "" })
	.use(tenancy)
	.use(requireRole("OWNER"))

	// ---------- Templates ----------
	.get("/templates", async ({ runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			return await tx.select().from(templates).orderBy(asc(templates.createdAt));
		});
	})

	.get("/templates/:templateId", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const [tpl] = await tx
				.select()
				.from(templates)
				.where(eq(templates.id, params.templateId))
				.limit(1);
			if (!tpl) {
				set.status = 404;
				return { error: "template not found" };
			}
			const stageRows = await tx
				.select()
				.from(stages)
				.where(eq(stages.templateId, tpl.id))
				.orderBy(asc(stages.order));
			const stageIds = stageRows.map((s) => s.id);
			const subStageRows = stageIds.length
				? await tx
						.select()
						.from(subStages)
						.where(inArray(subStages.stageId, stageIds))
						.orderBy(asc(subStages.order))
				: [];
			const subStageIds = subStageRows.map((s) => s.id);
			const [checklistRows, mediaRows] = await Promise.all([
				subStageIds.length
					? tx
							.select()
							.from(checklistItems)
							.where(inArray(checklistItems.subStageId, subStageIds))
							.orderBy(asc(checklistItems.order))
					: Promise.resolve([] as (typeof checklistItems.$inferSelect)[]),
				subStageIds.length
					? tx
							.select()
							.from(mediaRequirements)
							.where(inArray(mediaRequirements.subStageId, subStageIds))
					: Promise.resolve([] as (typeof mediaRequirements.$inferSelect)[]),
			]);
			const checklistBySub = new Map<string, typeof checklistRows>();
			for (const c of checklistRows) {
				const arr = checklistBySub.get(c.subStageId) ?? [];
				arr.push(c);
				checklistBySub.set(c.subStageId, arr);
			}
			const mediaBySub = new Map<string, typeof mediaRows>();
			for (const m of mediaRows) {
				const arr = mediaBySub.get(m.subStageId) ?? [];
				arr.push(m);
				mediaBySub.set(m.subStageId, arr);
			}
			const subsByStage = new Map<string, typeof subStageRows>();
			for (const s of subStageRows) {
				const arr = subsByStage.get(s.stageId) ?? [];
				arr.push(s);
				subsByStage.set(s.stageId, arr);
			}
			return {
				...tpl,
				stages: stageRows.map((s) => ({
					...s,
					subStages: (subsByStage.get(s.id) ?? []).map((ss) => ({
						...ss,
						checklistItems: checklistBySub.get(ss.id) ?? [],
						mediaRequirements: mediaBySub.get(ss.id) ?? [],
					})),
				})),
			};
		});
	})

	.post(
		"/templates",
		async ({ body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const { source } = body;

				if (source.type === "blank") {
					const [row] = await tx.insert(templates).values({ name: body.name }).returning();
					if (!row) {
						set.status = 500;
						return { error: "failed to create template" };
					}
					return row;
				}

				if (source.type === "erp-default") {
					const content = getDefaultTemplateContent(source.locale);
					const newId = await insertTemplateFromContent(tx, body.name, content);
					const [row] = await tx.select().from(templates).where(eq(templates.id, newId)).limit(1);
					if (!row) {
						set.status = 500;
						return { error: "failed to create template" };
					}
					return row;
				}

				// source.type === "clone"
				const [src] = await tx
					.select({ id: templates.id })
					.from(templates)
					.where(eq(templates.id, source.templateId))
					.limit(1);
				if (!src) {
					set.status = 404;
					return { error: "source template not found" };
				}

				const [row] = await tx.insert(templates).values({ name: body.name }).returning();
				if (!row) {
					set.status = 500;
					return { error: "failed to create template" };
				}

				const srcStages = await tx
					.select()
					.from(stages)
					.where(eq(stages.templateId, source.templateId))
					.orderBy(asc(stages.order));
				if (srcStages.length === 0) return row;

				const srcSubStages = await tx
					.select()
					.from(subStages)
					.where(
						inArray(
							subStages.stageId,
							srcStages.map((s) => s.id),
						),
					)
					.orderBy(asc(subStages.order));

				for (const srcStage of srcStages) {
					const [newStage] = await tx
						.insert(stages)
						.values({ templateId: row.id, order: srcStage.order, name: srcStage.name })
						.returning({ id: stages.id });
					if (!newStage) throw new Error("clone: failed to insert stage");

					const subs = srcSubStages.filter((ss) => ss.stageId === srcStage.id);
					for (const sub of subs) {
						const [newSub] = await tx
							.insert(subStages)
							.values({
								stageId: newStage.id,
								order: sub.order,
								code: sub.code,
								name: sub.name,
								performerType: sub.performerType,
								specialization: sub.specialization,
								standardDurationDays: sub.standardDurationDays,
								wageRatePerSqm: sub.wageRatePerSqm,
								description: sub.description,
							})
							.returning({ id: subStages.id });
						if (!newSub) throw new Error("clone: failed to insert sub-stage");

						const items = await tx
							.select()
							.from(checklistItems)
							.where(eq(checklistItems.subStageId, sub.id))
							.orderBy(asc(checklistItems.order));
						if (items.length > 0) {
							await tx.insert(checklistItems).values(
								items.map((it) => ({
									subStageId: newSub.id,
									order: it.order,
									text: it.text,
									criteria: it.criteria,
								})),
							);
						}

						const media = await tx
							.select()
							.from(mediaRequirements)
							.where(eq(mediaRequirements.subStageId, sub.id));
						if (media.length > 0) {
							await tx.insert(mediaRequirements).values(
								media.map((m) => ({
									subStageId: newSub.id,
									mediaType: m.mediaType,
									required: m.required,
									description: m.description,
								})),
							);
						}
					}
				}

				await relinkDependencies(tx, row.id);
				return row;
			});
		},
		{ body: zodBody(CreateTemplateInput) },
	)

	.patch(
		"/templates/:templateId",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [row] = await tx
					.update(templates)
					.set({ ...body, updatedAt: new Date() })
					.where(eq(templates.id, params.templateId))
					.returning();
				if (!row) {
					set.status = 404;
					return { error: "not found" };
				}
				return row;
			});
		},
		{ body: zodBody(UpdateTemplateInput) },
	)

	// ---------- Stages ----------
	.post(
		"/templates/:templateId/stages",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [tpl] = await tx
					.select({ id: templates.id })
					.from(templates)
					.where(eq(templates.id, params.templateId))
					.limit(1);
				if (!tpl) {
					set.status = 404;
					return { error: "template not found" };
				}
				const maxRow = await tx
					.select({ value: max(stages.order) })
					.from(stages)
					.where(eq(stages.templateId, tpl.id));
				const maxOrder = maxRow[0]?.value ?? null;
				const [row] = await tx
					.insert(stages)
					.values({
						templateId: tpl.id,
						order: (maxOrder ?? 0) + 1,
						name: body.name,
					})
					.returning();
				return row;
			});
		},
		{ body: zodBody(CreateStageInput) },
	)

	.patch(
		"/stages/:stageId",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [row] = await tx
					.update(stages)
					.set({ name: body.name })
					.where(eq(stages.id, params.stageId))
					.returning();
				if (!row) {
					set.status = 404;
					return { error: "not found" };
				}
				return row;
			});
		},
		{ body: zodBody(UpdateStageInput) },
	)

	.delete("/stages/:stageId", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const templateId = await templateIdForStage(tx, params.stageId);
			const [row] = await tx.delete(stages).where(eq(stages.id, params.stageId)).returning();
			if (!row) {
				set.status = 404;
				return { error: "not found" };
			}
			if (templateId) await relinkDependencies(tx, templateId);
			return { ok: true };
		});
	})

	.post(
		"/templates/:templateId/stages/reorder",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const stageRows = await tx
					.select({ id: stages.id })
					.from(stages)
					.where(eq(stages.templateId, params.templateId));
				const validIds = new Set(stageRows.map((s) => s.id));
				for (const e of body.order) {
					if (!validIds.has(e.id)) {
						set.status = 400;
						return { error: "stage id not in template" };
					}
				}
				for (const e of body.order) {
					await tx
						.update(stages)
						.set({ order: e.order + 10000 })
						.where(eq(stages.id, e.id));
				}
				for (const e of body.order) {
					await tx.update(stages).set({ order: e.order }).where(eq(stages.id, e.id));
				}
				await relinkDependencies(tx, params.templateId);
				return { ok: true };
			});
		},
		{ body: zodBody(ReorderInput) },
	)

	// ---------- Sub-stages ----------
	.post(
		"/stages/:stageId/sub-stages",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [stg] = await tx
					.select({ id: stages.id })
					.from(stages)
					.where(eq(stages.id, params.stageId))
					.limit(1);
				if (!stg) {
					set.status = 404;
					return { error: "stage not found" };
				}
				const maxRow = await tx
					.select({ value: max(subStages.order) })
					.from(subStages)
					.where(eq(subStages.stageId, stg.id));
				const maxOrder = maxRow[0]?.value ?? null;
				const [row] = await tx
					.insert(subStages)
					.values({
						stageId: stg.id,
						order: (maxOrder ?? 0) + 1,
						code: body.code,
						name: body.name,
						performerType: body.performerType,
						specialization: body.specialization ?? null,
						standardDurationDays: body.standardDurationDays,
						wageRatePerSqm: body.wageRatePerSqm,
						description: body.description ?? null,
					})
					.returning();
				return row;
			});
		},
		{ body: zodBody(CreateSubStageInput) },
	)

	.patch(
		"/sub-stages/:subStageId",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [row] = await tx
					.update(subStages)
					.set(body)
					.where(eq(subStages.id, params.subStageId))
					.returning();
				if (!row) {
					set.status = 404;
					return { error: "not found" };
				}
				return row;
			});
		},
		{ body: zodBody(UpdateSubStageInput) },
	)

	.delete("/sub-stages/:subStageId", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const templateId = await templateIdForSubStage(tx, params.subStageId);
			const [row] = await tx
				.delete(subStages)
				.where(eq(subStages.id, params.subStageId))
				.returning();
			if (!row) {
				set.status = 404;
				return { error: "not found" };
			}
			if (templateId) await relinkDependencies(tx, templateId);
			return { ok: true };
		});
	})

	.post(
		"/stages/:stageId/sub-stages/reorder",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const rows = await tx
					.select({ id: subStages.id })
					.from(subStages)
					.where(eq(subStages.stageId, params.stageId));
				const validIds = new Set(rows.map((s) => s.id));
				for (const e of body.order) {
					if (!validIds.has(e.id)) {
						set.status = 400;
						return { error: "sub-stage id not in stage" };
					}
				}
				for (const e of body.order) {
					await tx
						.update(subStages)
						.set({ order: e.order + 10000 })
						.where(eq(subStages.id, e.id));
				}
				for (const e of body.order) {
					await tx.update(subStages).set({ order: e.order }).where(eq(subStages.id, e.id));
				}
				const templateId = await templateIdForStage(tx, params.stageId);
				if (templateId) await relinkDependencies(tx, templateId);
				return { ok: true };
			});
		},
		{ body: zodBody(ReorderInput) },
	)

	// ---------- Checklist items ----------
	.post(
		"/sub-stages/:subStageId/checklist-items",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [ss] = await tx
					.select({ id: subStages.id })
					.from(subStages)
					.where(eq(subStages.id, params.subStageId))
					.limit(1);
				if (!ss) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				const maxRow = await tx
					.select({ value: max(checklistItems.order) })
					.from(checklistItems)
					.where(eq(checklistItems.subStageId, ss.id));
				const maxOrder = maxRow[0]?.value ?? null;
				const [row] = await tx
					.insert(checklistItems)
					.values({
						subStageId: ss.id,
						order: (maxOrder ?? 0) + 1,
						text: body.text,
						criteria: body.criteria ?? null,
					})
					.returning();
				return row;
			});
		},
		{ body: zodBody(CreateChecklistItemInput) },
	)

	.patch(
		"/checklist-items/:checklistItemId",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [row] = await tx
					.update(checklistItems)
					.set(body)
					.where(eq(checklistItems.id, params.checklistItemId))
					.returning();
				if (!row) {
					set.status = 404;
					return { error: "not found" };
				}
				return row;
			});
		},
		{ body: zodBody(UpdateChecklistItemInput) },
	)

	.delete("/checklist-items/:checklistItemId", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const [row] = await tx
				.delete(checklistItems)
				.where(eq(checklistItems.id, params.checklistItemId))
				.returning();
			if (!row) {
				set.status = 404;
				return { error: "not found" };
			}
			return { ok: true };
		});
	})

	.post(
		"/sub-stages/:subStageId/checklist-items/reorder",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const rows = await tx
					.select({ id: checklistItems.id })
					.from(checklistItems)
					.where(eq(checklistItems.subStageId, params.subStageId));
				const validIds = new Set(rows.map((r) => r.id));
				for (const e of body.order) {
					if (!validIds.has(e.id)) {
						set.status = 400;
						return { error: "checklist item not in sub-stage" };
					}
				}
				for (const e of body.order) {
					await tx
						.update(checklistItems)
						.set({ order: e.order + 10000 })
						.where(eq(checklistItems.id, e.id));
				}
				for (const e of body.order) {
					await tx
						.update(checklistItems)
						.set({ order: e.order })
						.where(eq(checklistItems.id, e.id));
				}
				return { ok: true };
			});
		},
		{ body: zodBody(ReorderInput) },
	)

	// ---------- Media requirements ----------
	.post(
		"/sub-stages/:subStageId/media-requirements",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [ss] = await tx
					.select({ id: subStages.id })
					.from(subStages)
					.where(eq(subStages.id, params.subStageId))
					.limit(1);
				if (!ss) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				const [row] = await tx
					.insert(mediaRequirements)
					.values({
						subStageId: ss.id,
						mediaType: body.mediaType,
						required: body.required,
						description: body.description,
					})
					.returning();
				return row;
			});
		},
		{ body: zodBody(CreateMediaRequirementInput) },
	)

	.patch(
		"/media-requirements/:mediaRequirementId",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [row] = await tx
					.update(mediaRequirements)
					.set(body)
					.where(eq(mediaRequirements.id, params.mediaRequirementId))
					.returning();
				if (!row) {
					set.status = 404;
					return { error: "not found" };
				}
				return row;
			});
		},
		{ body: zodBody(UpdateMediaRequirementInput) },
	)

	.delete("/media-requirements/:mediaRequirementId", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const [row] = await tx
				.delete(mediaRequirements)
				.where(eq(mediaRequirements.id, params.mediaRequirementId))
				.returning();
			if (!row) {
				set.status = 404;
				return { error: "not found" };
			}
			return { ok: true };
		});
	})

	// ---------- Stage dependencies / manual override ----------
	.get("/sub-stages/:subStageId/dependencies", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			return await tx
				.select()
				.from(stageDependencies)
				.where(eq(stageDependencies.subStageId, params.subStageId));
		});
	})

	// TODO(Phase 4 §4.6): extend allowed roles to INSPECTOR. Today this route
	// inherits the module-level OWNER-only guard; when the Inspector PWA lands
	// (Phase 4), Inspector becomes the primary caller of manual block/unblock.
	.post(
		"/stage-dependencies/:dependencyId/override",
		async ({ params, body, user, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [row] = await tx
					.update(stageDependencies)
					.set({
						manualOverride: body.manualOverride,
						overrideBy: body.manualOverride === "NONE" ? null : (user?.id ?? null),
						overrideAt: body.manualOverride === "NONE" ? null : new Date(),
						overrideReason: body.manualOverride === "NONE" ? null : (body.reason ?? null),
					})
					.where(eq(stageDependencies.id, params.dependencyId))
					.returning();
				if (!row) {
					set.status = 404;
					return { error: "not found" };
				}
				return row;
			});
		},
		{ body: zodBody(SetManualOverrideInput) },
	)

	// ---------- Specializations ----------
	.get("/specializations", async ({ runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			return await tx.select().from(specializations).orderBy(asc(specializations.name));
		});
	})

	.post(
		"/specializations",
		async ({ body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [row] = await tx
					.insert(specializations)
					.values({ name: body.name })
					.onConflictDoNothing()
					.returning();
				if (!row) {
					const [existing] = await tx
						.select()
						.from(specializations)
						.where(eq(specializations.name, body.name))
						.limit(1);
					return existing;
				}
				return row;
			});
		},
		{ body: zodBody(CreateSpecializationInput) },
	)

	.delete("/specializations/:specializationId", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const [row] = await tx
				.delete(specializations)
				.where(eq(specializations.id, params.specializationId))
				.returning();
			if (!row) {
				set.status = 404;
				return { error: "not found" };
			}
			return { ok: true };
		});
	});
