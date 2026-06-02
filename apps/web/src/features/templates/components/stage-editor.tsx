import type { StageTree, TemplateTree } from "@repo/validators";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AddSubStageForm } from "./add-forms";
import type { EditorOps } from "./ops";
import { ConfirmDelete } from "./primitives";
import { moveSub, SubStageEditor } from "./sub-stage-editor";

export function moveStage(tree: TemplateTree, stageId: string, delta: number, ops: EditorOps) {
	const ordered = [...tree.stages].sort((a, b) => a.order - b.order);
	const i = ordered.findIndex((s) => s.id === stageId);
	if (i < 0) return;
	const j = i + delta;
	if (j < 0 || j >= ordered.length) return;
	const a = ordered[i];
	const b = ordered[j];
	if (!a || !b) return;
	ordered[i] = b;
	ordered[j] = a;
	ops.reorderStages(ordered.map((s, idx) => ({ id: s.id, order: idx + 1 })));
}

export function StageEditor({
	stage,
	isFirst,
	isLast,
	onMoveUp,
	onMoveDown,
	ops,
}: {
	stage: StageTree;
	isFirst: boolean;
	isLast: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	ops: EditorOps;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(true);
	return (
		<motion.div layout className="rounded-lg border bg-card overflow-hidden">
			<motion.div layout="position" className="flex items-center gap-2 p-3">
				<span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{stage.order}</span>
				<button
					type="button"
					onClick={() => setOpen(!open)}
					className="flex-1 flex items-center gap-2 text-left text-sm font-medium group cursor-pointer"
					aria-label={open ? t("templates.collapseStage") : t("templates.expandStage")}
					aria-expanded={open}
				>
					<span className="font-medium group-hover:underline decoration-dotted">{stage.name}</span>
				</button>
				<span className="text-xs text-muted-foreground">
					{t("templates.subStagesCount", { count: stage.subStages.length })}
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
					onClick={() => setOpen(!open)}
					aria-label={open ? t("templates.collapseStage") : t("templates.expandStage")}
				>
					<motion.span
						animate={{ rotate: open ? 180 : 0 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
						className="inline-flex"
					>
						<ChevronDown className="size-4" />
					</motion.span>
				</Button>
				<ConfirmDelete
					title={t("templates.deleteStageTitle", { name: stage.name })}
					description={t("templates.deleteStageDesc")}
					onConfirm={() => ops.deleteStage(stage.id)}
					ariaLabel={t("templates.deleteStageAria")}
				/>
			</motion.div>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						key="content"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
						style={{ overflow: "hidden" }}
					>
						<div className="border-t p-3 space-y-3">
							{stage.subStages.map((ss, i) => (
								<SubStageEditor
									key={ss.id}
									sub={ss}
									isFirst={i === 0}
									isLast={i === stage.subStages.length - 1}
									onMoveUp={() => moveSub(stage, ss.id, -1, ops)}
									onMoveDown={() => moveSub(stage, ss.id, 1, ops)}
									ops={ops}
								/>
							))}
							<AddSubStageForm stageId={stage.id} ops={ops} />
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
