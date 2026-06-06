import { SPECIALIZATIONS, type StageTree, type SubStageTree } from "@repo/validators";
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AddChecklistForm, AddMediaForm } from "./add-forms";
import type { EditorOps } from "./ops";
import { ConfirmDelete, Field, InlineText, InlineTextarea } from "./primitives";

export function moveSub(stage: StageTree, subId: string, delta: number, ops: EditorOps) {
	const ordered = [...stage.subStages].sort((a, b) => a.order - b.order);
	const i = ordered.findIndex((s) => s.id === subId);
	const j = i + delta;
	if (i < 0 || j < 0 || j >= ordered.length) return;
	const a = ordered[i];
	const b = ordered[j];
	if (!a || !b) return;
	ordered[i] = b;
	ordered[j] = a;
	ops.reorderSubStages(
		stage.id,
		ordered.map((s, idx) => ({ id: s.id, order: idx + 1 })),
	);
}

export function SubStageEditor({
	sub,
	isFirst,
	isLast,
	onMoveUp,
	onMoveDown,
	ops,
}: {
	sub: SubStageTree;
	isFirst: boolean;
	isLast: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	ops: EditorOps;
}) {
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState(false);
	const patch = (p: Record<string, unknown>) => ops.updateSubStage(sub.id, p);

	const performerLabel = t(`performerType.${sub.performerType}`, sub.performerType);
	const specializationLabel = sub.specialization
		? t(`specializations.${sub.specialization}`)
		: null;

	return (
		<motion.div layout className="rounded-md border bg-background overflow-hidden">
			<motion.div layout="position" className="flex items-center gap-2 p-2">
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="flex-1 text-left flex items-center gap-2 text-sm cursor-pointer group"
					aria-expanded={expanded}
				>
					<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{sub.code}</span>
					<span className="font-medium group-hover:underline decoration-dotted">{sub.name}</span>
					<span
						className={
							sub.performerType === "INSPECTOR"
								? "rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] uppercase text-blue-600"
								: "rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground"
						}
					>
						{performerLabel}
					</span>
					{specializationLabel && (
						<span className="text-xs text-muted-foreground">{specializationLabel}</span>
					)}
				</button>
				<span className="text-xs text-muted-foreground">
					{t("templates.checksMedia", {
						checks: sub.checklistItems.length,
						media: sub.mediaRequirements.length,
					})}
				</span>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={onMoveUp}
					disabled={isFirst}
					aria-label={t("templates.moveUp")}
				>
					<ArrowUp className="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={onMoveDown}
					disabled={isLast}
					aria-label={t("templates.moveDown")}
				>
					<ArrowDown className="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={() => setExpanded(!expanded)}
					aria-label={expanded ? t("templates.collapseSub") : t("templates.expandSub")}
				>
					<motion.span
						animate={{ rotate: expanded ? 180 : 0 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
						className="inline-flex"
					>
						<ChevronDown className="size-4" />
					</motion.span>
				</Button>
				<ConfirmDelete
					title={t("templates.deleteSubTitle", { name: sub.name })}
					description={t("templates.deleteSubDesc")}
					onConfirm={() => ops.deleteSubStage(sub.id)}
					ariaLabel={t("templates.deleteSubAria")}
				/>
			</motion.div>
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						key="content"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
						style={{ overflow: "hidden" }}
					>
						<div className="border-t p-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
							<div className="space-y-3">
								<Field label={t("templates.fieldCode")}>
									<InlineText value={sub.code} onSave={(v) => patch({ code: v })} />
								</Field>
								<Field label={t("templates.fieldName")}>
									<InlineText value={sub.name} onSave={(v) => patch({ name: v })} />
								</Field>
								<Field label={t("templates.fieldPerformer")}>
									<Select
										value={sub.performerType}
										onValueChange={(v) =>
											// Inspector stages don't carry a specialization (no master
											// assignment), so clear it when switching away from MASTER —
											// avoids stale data lingering on the row.
											patch(
												v === "MASTER"
													? { performerType: v }
													: { performerType: v, specialization: null },
											)
										}
									>
										<SelectTrigger className="h-9">
											{/* Base UI's Value renders the raw value verbatim unless
											    given a render function — without this the trigger
											    keeps showing "MASTER"/"INSPECTOR" regardless of locale. */}
											<SelectValue>
												{(v) => (v ? t(`performerType.${v}`, String(v)) : "")}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="MASTER">{t("performerType.MASTER")}</SelectItem>
											<SelectItem value="INSPECTOR">{t("performerType.INSPECTOR")}</SelectItem>
										</SelectContent>
									</Select>
								</Field>
								{sub.performerType === "MASTER" && (
									<Field label={t("templates.fieldSpecialization")}>
										<Select
											value={sub.specialization ?? "__none__"}
											onValueChange={(v) => patch({ specialization: v === "__none__" ? null : v })}
										>
											<SelectTrigger className="h-9">
												<SelectValue>
													{(v) =>
														!v || v === "__none__"
															? t("templates.specNone")
															: t(`specializations.${v}`)
													}
												</SelectValue>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="__none__">{t("templates.specNone")}</SelectItem>
												{SPECIALIZATIONS.map((s) => (
													<SelectItem key={s} value={s}>
														{t(`specializations.${s}`)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</Field>
								)}
								<Field label={t("templates.fieldDuration")}>
									<InlineText
										value={String(sub.standardDurationDays)}
										onSave={(v) => {
											const n = Number(v);
											if (!Number.isNaN(n) && n >= 0)
												patch({ standardDurationDays: Math.floor(n) });
										}}
									/>
								</Field>
								<Field label={t("templates.fieldWageRate")}>
									<InlineText
										value={sub.wageRatePerSqm}
										onSave={(v) => {
											if (/^\d+(\.\d{1,2})?$/.test(v)) patch({ wageRatePerSqm: v });
										}}
									/>
								</Field>
								<Field label={t("templates.fieldDescription")}>
									<InlineTextarea
										value={sub.description ?? ""}
										onSave={(v) => patch({ description: v || null })}
									/>
								</Field>
							</div>

							<div className="space-y-4">
								<div>
									<h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
										{t("templates.mediaRequirements")}
									</h4>
									<ul className="space-y-1.5">
										{sub.mediaRequirements.map((mr) => (
											<li
												key={mr.id}
												className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm"
											>
												<Select
													value={mr.mediaType}
													onValueChange={(v) =>
														ops.updateMediaRequirement(mr.id, {
															mediaType: v as "PHOTO" | "VIDEO",
														})
													}
												>
													<SelectTrigger size="sm" className="text-xs">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="PHOTO">PHOTO</SelectItem>
														<SelectItem value="VIDEO">VIDEO</SelectItem>
													</SelectContent>
												</Select>
												<InlineText
													value={mr.description}
													onSave={(v) => ops.updateMediaRequirement(mr.id, { description: v })}
													className="flex-1 text-xs"
												/>
												<span className="flex items-center gap-1 text-xs">
													<Switch
														checked={mr.required}
														onCheckedChange={(checked) =>
															ops.updateMediaRequirement(mr.id, { required: !!checked })
														}
														size="sm"
													/>
													{t("templates.required")}
												</span>
												<Button
													variant="ghost"
													size="icon-xs"
													onClick={() => ops.deleteMediaRequirement(mr.id)}
												>
													<Trash2 className="size-3 text-destructive" />
												</Button>
											</li>
										))}
									</ul>
									<AddMediaForm subStageId={sub.id} ops={ops} />
								</div>

								<div>
									<h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
										{t("templates.checklistPoints", { count: sub.checklistItems.length })}
									</h4>
									<ul className="space-y-1.5">
										{sub.checklistItems.map((ci) => (
											<li key={ci.id} className="rounded border px-2 py-1.5 text-sm space-y-1">
												<div className="flex items-start gap-2">
													<InlineTextarea
														value={ci.text}
														onSave={(v) => ops.updateChecklistItem(ci.id, { text: v })}
														className="flex-1 text-sm"
													/>
													<Button
														variant="ghost"
														size="icon-xs"
														onClick={() => ops.deleteChecklistItem(ci.id)}
													>
														<Trash2 className="size-3 text-destructive" />
													</Button>
												</div>
												<InlineTextarea
													value={ci.criteria ?? ""}
													onSave={(v) => ops.updateChecklistItem(ci.id, { criteria: v || null })}
													placeholder={t("templates.criteriaPlaceholder")}
													className="text-xs text-muted-foreground"
												/>
											</li>
										))}
									</ul>
									<AddChecklistForm subStageId={sub.id} ops={ops} />
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
