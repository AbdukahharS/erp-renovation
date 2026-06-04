import { zodResolver } from "@hookform/resolvers/zod";
import { CreateStageInput, type TemplateTree } from "@repo/validators";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteTemplate, useTemplateMutations, useTemplateTree } from "@/lib/queries/templates";
import type { EditorOps } from "./components/ops";
import { opsFromMutators } from "./components/ops";
import { ConfirmDelete, InlineText } from "./components/primitives";
import { moveStage, StageEditor } from "./components/stage-editor";

type AddStageForm = { name: string };

/**
 * Headerless editor body, parameterized over the persistence layer. Both the
 * templates page (mutation-backed ops) and the property-creation wizard
 * (local-state-backed ops) render this exact UI by supplying their own
 * `ops` and the current `tree`.
 *
 * `renameLabelSlot` lets the caller choose what sits at the top: the
 * templates page passes the editable template name; the wizard passes a
 * non-editable title since the snapshot doesn't own a "template name".
 */
export function TemplateTreeEditor({
	tree,
	ops,
	renameLabelSlot,
}: {
	tree: TemplateTree;
	ops: EditorOps;
	renameLabelSlot?: React.ReactNode;
}) {
	const { t } = useTranslation();
	const {
		register,
		handleSubmit,
		reset,
		formState: { isValid },
	} = useForm<AddStageForm>({
		resolver: zodResolver(CreateStageInput),
		defaultValues: { name: "" },
		mode: "onChange",
	});

	const onAdd = handleSubmit((values) => {
		ops.addStage(values.name.trim());
		reset({ name: "" });
	});

	const stagesCount = tree.stages.length;
	const subsCount = tree.stages.reduce((n, s) => n + s.subStages.length, 0);
	const pointsCount = tree.stages.reduce(
		(n, s) => n + s.subStages.reduce((m2, ss) => m2 + ss.checklistItems.length, 0),
		0,
	);

	return (
		<div className="space-y-6">
			<header className="flex items-baseline justify-between">
				{renameLabelSlot}
				<p className="text-xs text-muted-foreground">
					{t("templates.countSummary", {
						stages: stagesCount,
						subs: subsCount,
						points: pointsCount,
					})}
				</p>
			</header>

			<form onSubmit={onAdd} className="flex gap-2">
				<Input placeholder={t("templates.newStagePlaceholder")} {...register("name")} />
				<Button type="submit" disabled={!isValid}>
					<Plus className="size-4" /> {t("templates.addStage")}
				</Button>
			</form>

			<div className="space-y-3">
				{tree.stages.map((stage, idx) => (
					<StageEditor
						key={stage.id}
						stage={stage}
						isFirst={idx === 0}
						isLast={idx === tree.stages.length - 1}
						onMoveUp={() => moveStage(tree, stage.id, -1, ops)}
						onMoveDown={() => moveStage(tree, stage.id, 1, ops)}
						ops={ops}
					/>
				))}
			</div>
		</div>
	);
}

export function TemplateEditor({ templateId }: { templateId: string }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { data: tree, isLoading, error } = useTemplateTree(templateId);
	const m = useTemplateMutations(templateId);
	const ops = opsFromMutators(m);
	const del = useDeleteTemplate();

	if (isLoading)
		return <p className="text-sm text-muted-foreground">{t("templates.loadingTemplate")}</p>;
	if (error) return <p className="text-sm text-destructive">{String(error)}</p>;
	if (!tree) return null;

	const handleDelete = () => {
		del.mutate(templateId, {
			onSuccess: () => navigate({ to: "/owner/templates" }),
		});
	};

	return (
		<TemplateTreeEditor
			tree={tree}
			ops={ops}
			renameLabelSlot={
				<div className="flex items-center gap-2">
					<InlineText
						value={tree.name}
						onSave={(v) => ops.renameTemplate?.(v)}
						className="text-2xl font-semibold"
					/>
					<ConfirmDelete
						title={t("templates.deleteTemplateTitle", { name: tree.name })}
						description={t("templates.deleteTemplateDesc")}
						ariaLabel={t("templates.deleteTemplateAria")}
						onConfirm={handleDelete}
					/>
				</div>
			}
		/>
	);
}
