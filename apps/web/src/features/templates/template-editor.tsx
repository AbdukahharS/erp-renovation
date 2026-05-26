import { zodResolver } from "@hookform/resolvers/zod";
import { CreateStageInput } from "@repo/validators";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTemplateMutations, useTemplateTree } from "@/lib/queries/templates";
import { InlineText } from "./components/primitives";
import { moveStage, StageEditor } from "./components/stage-editor";

type AddStageForm = { name: string };

export function TemplateEditor({ templateId }: { templateId: string }) {
	const { t } = useTranslation();
	const { data: tree, isLoading, error } = useTemplateTree(templateId);
	const m = useTemplateMutations(templateId);
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

	if (isLoading)
		return <p className="text-sm text-muted-foreground">{t("templates.loadingTemplate")}</p>;
	if (error) return <p className="text-sm text-destructive">{String(error)}</p>;
	if (!tree) return null;

	const onAdd = handleSubmit((values) => {
		m.addStage.mutate(values.name.trim());
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
				<InlineText
					value={tree.name}
					onSave={(v) => m.renameTemplate.mutate(v)}
					className="text-2xl font-semibold"
				/>
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
						onMoveUp={() => moveStage(tree, stage.id, -1, m)}
						onMoveDown={() => moveStage(tree, stage.id, 1, m)}
						mutators={m}
					/>
				))}
			</div>
		</div>
	);
}
