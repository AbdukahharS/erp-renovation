import type { TemplateSnapshotInputType, TemplateTree } from "@repo/validators";
import type { EditorOps } from "./ops";

const newId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `local-${Math.random().toString(36).slice(2)}`;

/**
 * Builds an `EditorOps` that mutates a local `TemplateTree` state instead of
 * dispatching server mutations. Used by the property-creation wizard so the
 * Owner can tailor a per-property snapshot without persisting changes back to
 * the source template.
 *
 * The tree retains UUIDs on every node — the original template's ids for
 * unchanged rows, fresh client-generated UUIDs for added rows. IDs are
 * client-side bookkeeping only; `treeToSnapshot` strips them when serializing
 * the submit payload.
 */
export function createLocalOps(
	setTree: (updater: (prev: TemplateTree) => TemplateTree) => void,
): EditorOps {
	const upd = (mut: (draft: TemplateTree) => void) => {
		setTree((prev) => {
			const next: TemplateTree = JSON.parse(JSON.stringify(prev));
			mut(next);
			return next;
		});
	};

	return {
		addStage: (name) =>
			upd((d) => {
				d.stages.push({
					id: newId(),
					templateId: d.id,
					order: d.stages.length + 1,
					name,
					subStages: [],
				});
			}),
		renameStage: (id, name) =>
			upd((d) => {
				const s = d.stages.find((x) => x.id === id);
				if (s) s.name = name;
			}),
		deleteStage: (id) =>
			upd((d) => {
				d.stages = d.stages.filter((x) => x.id !== id);
				d.stages.forEach((s, i) => {
					s.order = i + 1;
				});
			}),
		reorderStages: (order) =>
			upd((d) => {
				const map = new Map(order.map((o) => [o.id, o.order]));
				for (const s of d.stages) {
					const n = map.get(s.id);
					if (n != null) s.order = n;
				}
				d.stages.sort((a, b) => a.order - b.order);
			}),
		addSubStage: (stageId, vars) =>
			upd((d) => {
				const s = d.stages.find((x) => x.id === stageId);
				if (!s) return;
				s.subStages.push({
					id: newId(),
					stageId,
					order: s.subStages.length + 1,
					code: vars.code,
					name: vars.name,
					performerType: vars.performerType,
					specialization: null,
					standardDurationDays: vars.standardDurationDays,
					wageRatePerSqm: vars.wageRatePerSqm,
					description: null,
					checklistItems: [],
					mediaRequirements: [],
				});
			}),
		updateSubStage: (id, patch) =>
			upd((d) => {
				for (const s of d.stages) {
					const ss = s.subStages.find((x) => x.id === id);
					if (ss) {
						Object.assign(ss, patch);
						return;
					}
				}
			}),
		deleteSubStage: (id) =>
			upd((d) => {
				for (const s of d.stages) {
					s.subStages = s.subStages.filter((x) => x.id !== id);
					s.subStages.forEach((ss, i) => {
						ss.order = i + 1;
					});
				}
			}),
		reorderSubStages: (stageId, order) =>
			upd((d) => {
				const s = d.stages.find((x) => x.id === stageId);
				if (!s) return;
				const map = new Map(order.map((o) => [o.id, o.order]));
				for (const ss of s.subStages) {
					const n = map.get(ss.id);
					if (n != null) ss.order = n;
				}
				s.subStages.sort((a, b) => a.order - b.order);
			}),
		addChecklistItem: (subStageId, vars) =>
			upd((d) => {
				for (const s of d.stages) {
					const ss = s.subStages.find((x) => x.id === subStageId);
					if (ss) {
						ss.checklistItems.push({
							id: newId(),
							subStageId,
							order: ss.checklistItems.length + 1,
							text: vars.text,
							criteria: vars.criteria ?? null,
						});
						return;
					}
				}
			}),
		updateChecklistItem: (id, patch) =>
			upd((d) => {
				for (const s of d.stages) {
					for (const ss of s.subStages) {
						const ci = ss.checklistItems.find((x) => x.id === id);
						if (ci) {
							if (patch.text !== undefined) ci.text = patch.text;
							if (patch.criteria !== undefined) ci.criteria = patch.criteria;
							return;
						}
					}
				}
			}),
		deleteChecklistItem: (id) =>
			upd((d) => {
				for (const s of d.stages) {
					for (const ss of s.subStages) {
						ss.checklistItems = ss.checklistItems.filter((x) => x.id !== id);
						ss.checklistItems.forEach((ci, i) => {
							ci.order = i + 1;
						});
					}
				}
			}),
		addMediaRequirement: (subStageId, vars) =>
			upd((d) => {
				for (const s of d.stages) {
					const ss = s.subStages.find((x) => x.id === subStageId);
					if (ss) {
						ss.mediaRequirements.push({
							id: newId(),
							subStageId,
							mediaType: vars.mediaType,
							required: vars.required,
							description: vars.description,
						});
						return;
					}
				}
			}),
		updateMediaRequirement: (id, patch) =>
			upd((d) => {
				for (const s of d.stages) {
					for (const ss of s.subStages) {
						const mr = ss.mediaRequirements.find((x) => x.id === id);
						if (mr) {
							if (patch.mediaType !== undefined) mr.mediaType = patch.mediaType;
							if (patch.required !== undefined) mr.required = patch.required;
							if (patch.description !== undefined) mr.description = patch.description;
							return;
						}
					}
				}
			}),
		deleteMediaRequirement: (id) =>
			upd((d) => {
				for (const s of d.stages) {
					for (const ss of s.subStages) {
						ss.mediaRequirements = ss.mediaRequirements.filter((x) => x.id !== id);
					}
				}
			}),
	};
}

/**
 * Strips DB ids and parent-id references from a TemplateTree, emitting the
 * id-less snapshot payload the API expects. Re-derives `order` from array
 * position so the snapshot is canonical (1-based, contiguous).
 */
export function treeToSnapshot(tree: TemplateTree): TemplateSnapshotInputType {
	return {
		stages: tree.stages
			.slice()
			.sort((a, b) => a.order - b.order)
			.map((s, si) => ({
				order: si + 1,
				name: s.name,
				subStages: s.subStages
					.slice()
					.sort((a, b) => a.order - b.order)
					.map((ss, ssi) => ({
						order: ssi + 1,
						code: ss.code,
						name: ss.name,
						performerType: ss.performerType,
						specialization: ss.specialization,
						standardDurationDays: ss.standardDurationDays,
						wageRatePerSqm: ss.wageRatePerSqm,
						description: ss.description,
						checklistItems: ss.checklistItems
							.slice()
							.sort((a, b) => a.order - b.order)
							.map((ci, cii) => ({
								order: cii + 1,
								text: ci.text,
								criteria: ci.criteria,
							})),
						mediaRequirements: ss.mediaRequirements.map((m) => ({
							mediaType: m.mediaType,
							required: m.required,
							description: m.description,
						})),
					})),
			})),
	};
}

export function snapshotsEqual(
	a: TemplateSnapshotInputType,
	b: TemplateSnapshotInputType,
): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
