import type { StageTree, SubStageTree, TemplateTree } from "@repo/validators";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSpecializations, useTemplateMutations, useTemplateTree } from "@/lib/queries/templates";

export const Route = createFileRoute("/owner/templates/$templateId")({
	component: TemplateEditor,
});

function TemplateEditor() {
	const { templateId } = Route.useParams();
	const { data: tree, isLoading, error } = useTemplateTree(templateId);
	const m = useTemplateMutations(templateId);
	const [newStageName, setNewStageName] = useState("");

	if (isLoading) return <p className="text-sm text-muted-foreground">Loading template…</p>;
	if (error) return <p className="text-sm text-destructive">{String(error)}</p>;
	if (!tree) return null;

	return (
		<div className="space-y-6">
			<header className="flex items-baseline justify-between">
				<InlineText
					value={tree.name}
					onSave={(v) => m.renameTemplate.mutate(v)}
					className="text-2xl font-semibold"
				/>
				<p className="text-xs text-muted-foreground">
					{tree.stages.length} stages · {tree.stages.reduce((n, s) => n + s.subStages.length, 0)}{" "}
					sub-stages ·{" "}
					{tree.stages.reduce(
						(n, s) => n + s.subStages.reduce((m2, ss) => m2 + ss.checklistItems.length, 0),
						0,
					)}{" "}
					control points
				</p>
			</header>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (newStageName.trim()) {
						m.addStage.mutate(newStageName.trim());
						setNewStageName("");
					}
				}}
				className="flex gap-2"
			>
				<Input
					value={newStageName}
					onChange={(e) => setNewStageName(e.target.value)}
					placeholder="New stage name…"
				/>
				<Button type="submit" disabled={!newStageName.trim()}>
					<Plus className="size-4" /> Add stage
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

function moveStage(
	tree: TemplateTree,
	stageId: string,
	delta: number,
	m: ReturnType<typeof useTemplateMutations>,
) {
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
	m.reorderStages.mutate(ordered.map((s, idx) => ({ id: s.id, order: idx + 1 })));
}

function StageEditor({
	stage,
	isFirst,
	isLast,
	onMoveUp,
	onMoveDown,
	mutators,
}: {
	stage: StageTree;
	isFirst: boolean;
	isLast: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	mutators: ReturnType<typeof useTemplateMutations>;
}) {
	const [open, setOpen] = useState(stage.order === 1);
	return (
		<div className="rounded-lg border bg-card">
			<div className="flex items-center gap-2 p-3">
				<button
					type="button"
					onClick={() => setOpen(!open)}
					className="rounded bg-muted px-2 py-0.5 text-xs hover:bg-muted/80"
					aria-label={open ? "Collapse stage" : "Expand stage"}
				>
					{stage.order}
				</button>
				<div className="flex-1 text-sm font-medium">
					<InlineText
						value={stage.name}
						onSave={(v) => mutators.renameStage.mutate({ id: stage.id, name: v })}
						className="font-medium"
					/>
				</div>
				<span className="text-xs text-muted-foreground">{stage.subStages.length} sub-stages</span>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={onMoveUp}
					disabled={isFirst}
					aria-label="Move up"
				>
					<ChevronUp className="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={onMoveDown}
					disabled={isLast}
					aria-label="Move down"
				>
					<ChevronDown className="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={() => {
						if (confirm(`Delete stage "${stage.name}" and all its sub-stages?`)) {
							mutators.deleteStage.mutate(stage.id);
						}
					}}
					aria-label="Delete stage"
				>
					<Trash2 className="size-4 text-destructive" />
				</Button>
			</div>
			{open && (
				<div className="border-t p-3 space-y-3">
					{stage.subStages.map((ss, i) => (
						<SubStageEditor
							key={ss.id}
							sub={ss}
							isFirst={i === 0}
							isLast={i === stage.subStages.length - 1}
							onMoveUp={() => moveSub(stage, ss.id, -1, mutators)}
							onMoveDown={() => moveSub(stage, ss.id, 1, mutators)}
							mutators={mutators}
						/>
					))}
					<AddSubStageForm stageId={stage.id} mutators={mutators} />
				</div>
			)}
		</div>
	);
}

function moveSub(
	stage: StageTree,
	subId: string,
	delta: number,
	m: ReturnType<typeof useTemplateMutations>,
) {
	const ordered = [...stage.subStages].sort((a, b) => a.order - b.order);
	const i = ordered.findIndex((s) => s.id === subId);
	const j = i + delta;
	if (i < 0 || j < 0 || j >= ordered.length) return;
	const a = ordered[i];
	const b = ordered[j];
	if (!a || !b) return;
	ordered[i] = b;
	ordered[j] = a;
	m.reorderSubStages.mutate({
		stageId: stage.id,
		order: ordered.map((s, idx) => ({ id: s.id, order: idx + 1 })),
	});
}

function SubStageEditor({
	sub,
	isFirst,
	isLast,
	onMoveUp,
	onMoveDown,
	mutators,
}: {
	sub: SubStageTree;
	isFirst: boolean;
	isLast: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	mutators: ReturnType<typeof useTemplateMutations>;
}) {
	const { data: specs } = useSpecializations();
	const [expanded, setExpanded] = useState(false);
	const patch = (p: Record<string, unknown>) =>
		mutators.updateSubStage.mutate({ id: sub.id, patch: p });

	return (
		<div className="rounded-md border bg-background">
			<div className="flex items-center gap-2 p-2">
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="flex-1 text-left flex items-center gap-2 text-sm"
				>
					<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{sub.code}</span>
					<span className="font-medium">{sub.name}</span>
					<span
						className={
							sub.performerType === "INSPECTOR"
								? "rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] uppercase text-blue-600"
								: "rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground"
						}
					>
						{sub.performerType}
					</span>
					{sub.specialization && (
						<span className="text-xs text-muted-foreground">{sub.specialization}</span>
					)}
				</button>
				<span className="text-xs text-muted-foreground">
					{sub.checklistItems.length} checks · {sub.mediaRequirements.length} media
				</span>
				<Button variant="ghost" size="icon-sm" onClick={onMoveUp} disabled={isFirst}>
					<ChevronUp className="size-4" />
				</Button>
				<Button variant="ghost" size="icon-sm" onClick={onMoveDown} disabled={isLast}>
					<ChevronDown className="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={() => {
						if (confirm(`Delete sub-stage "${sub.name}"?`)) {
							mutators.deleteSubStage.mutate(sub.id);
						}
					}}
				>
					<Trash2 className="size-4 text-destructive" />
				</Button>
			</div>
			{expanded && (
				<div className="border-t p-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
					<div className="space-y-3">
						<Field label="Code">
							<InlineText value={sub.code} onSave={(v) => patch({ code: v })} />
						</Field>
						<Field label="Name">
							<InlineText value={sub.name} onSave={(v) => patch({ name: v })} />
						</Field>
						<Field label="Performer">
							<select
								className="h-9 rounded-md border bg-input/30 px-2 text-sm"
								value={sub.performerType}
								onChange={(e) => patch({ performerType: e.target.value })}
							>
								<option value="MASTER">MASTER</option>
								<option value="INSPECTOR">INSPECTOR</option>
							</select>
						</Field>
						<Field label="Specialization">
							<select
								className="h-9 rounded-md border bg-input/30 px-2 text-sm"
								value={sub.specialization ?? ""}
								onChange={(e) => patch({ specialization: e.target.value || null })}
							>
								<option value="">— none —</option>
								{(specs ?? []).map((s) => (
									<option key={s.id} value={s.name}>
										{s.name}
									</option>
								))}
							</select>
						</Field>
						<Field label="Standard duration (days)">
							<InlineText
								value={String(sub.standardDurationDays)}
								onSave={(v) => {
									const n = Number(v);
									if (!Number.isNaN(n) && n >= 0) patch({ standardDurationDays: Math.floor(n) });
								}}
							/>
						</Field>
						<Field label="Wage rate per m² ($)">
							<InlineText
								value={sub.wageRatePerSqm}
								onSave={(v) => {
									if (/^\d+(\.\d{1,2})?$/.test(v)) patch({ wageRatePerSqm: v });
								}}
							/>
						</Field>
						<Field label="Description">
							<InlineTextarea
								value={sub.description ?? ""}
								onSave={(v) => patch({ description: v || null })}
							/>
						</Field>
					</div>

					<div className="space-y-4">
						<div>
							<h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
								Media requirements
							</h4>
							<ul className="space-y-1.5">
								{sub.mediaRequirements.map((mr) => (
									<li
										key={mr.id}
										className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm"
									>
										<select
											value={mr.mediaType}
											onChange={(e) =>
												mutators.updateMediaRequirement.mutate({
													id: mr.id,
													patch: { mediaType: e.target.value as "PHOTO" | "VIDEO" },
												})
											}
											className="rounded border bg-input/30 px-1 text-xs"
										>
											<option value="PHOTO">PHOTO</option>
											<option value="VIDEO">VIDEO</option>
										</select>
										<InlineText
											value={mr.description}
											onSave={(v) =>
												mutators.updateMediaRequirement.mutate({
													id: mr.id,
													patch: { description: v },
												})
											}
											className="flex-1 text-xs"
										/>
										<span className="flex items-center gap-1 text-xs">
											<Switch
												checked={mr.required}
												onCheckedChange={(checked) =>
													mutators.updateMediaRequirement.mutate({
														id: mr.id,
														patch: { required: !!checked },
													})
												}
												size="sm"
											/>
											required
										</span>
										<Button
											variant="ghost"
											size="icon-xs"
											onClick={() => mutators.deleteMediaRequirement.mutate(mr.id)}
										>
											<Trash2 className="size-3 text-destructive" />
										</Button>
									</li>
								))}
							</ul>
							<AddMediaForm subStageId={sub.id} mutators={mutators} />
						</div>

						<div>
							<h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
								Checklist control points ({sub.checklistItems.length})
							</h4>
							<ul className="space-y-1.5">
								{sub.checklistItems.map((ci) => (
									<li key={ci.id} className="rounded border px-2 py-1.5 text-sm space-y-1">
										<div className="flex items-start gap-2">
											<InlineTextarea
												value={ci.text}
												onSave={(v) =>
													mutators.updateChecklistItem.mutate({
														id: ci.id,
														patch: { text: v },
													})
												}
												className="flex-1 text-sm"
											/>
											<Button
												variant="ghost"
												size="icon-xs"
												onClick={() => mutators.deleteChecklistItem.mutate(ci.id)}
											>
												<Trash2 className="size-3 text-destructive" />
											</Button>
										</div>
										<InlineTextarea
											value={ci.criteria ?? ""}
											onSave={(v) =>
												mutators.updateChecklistItem.mutate({
													id: ci.id,
													patch: { criteria: v || null },
												})
											}
											placeholder="Criteria / threshold (optional)…"
											className="text-xs text-muted-foreground"
										/>
									</li>
								))}
							</ul>
							<AddChecklistForm subStageId={sub.id} mutators={mutators} />
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function AddSubStageForm({
	stageId,
	mutators,
}: {
	stageId: string;
	mutators: ReturnType<typeof useTemplateMutations>;
}) {
	const [open, setOpen] = useState(false);
	const [code, setCode] = useState("");
	const [name, setName] = useState("");
	const [performerType, setPerformerType] = useState<"MASTER" | "INSPECTOR">("MASTER");
	const [wage, setWage] = useState("0");
	const [duration, setDuration] = useState("1");

	if (!open) {
		return (
			<Button variant="outline" size="sm" onClick={() => setOpen(true)}>
				<Plus className="size-4" /> Add sub-stage
			</Button>
		);
	}
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (!code.trim() || !name.trim()) return;
				if (!/^\d+(\.\d{1,2})?$/.test(wage)) return;
				const d = Math.max(0, Math.floor(Number(duration) || 0));
				mutators.addSubStage.mutate({
					stageId,
					code: code.trim(),
					name: name.trim(),
					performerType,
					wageRatePerSqm: wage,
					standardDurationDays: d,
				});
				setOpen(false);
				setCode("");
				setName("");
				setWage("0");
				setDuration("1");
			}}
			className="rounded-md border p-2 space-y-2"
		>
			<div className="grid grid-cols-2 gap-2">
				<Input
					value={code}
					onChange={(e) => setCode(e.target.value)}
					placeholder="code (e.g. 1.4)"
				/>
				<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" />
				<select
					className="h-9 rounded-md border bg-input/30 px-2 text-sm"
					value={performerType}
					onChange={(e) => setPerformerType(e.target.value as "MASTER" | "INSPECTOR")}
				>
					<option value="MASTER">MASTER</option>
					<option value="INSPECTOR">INSPECTOR</option>
				</select>
				<Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="days" />
				<Input value={wage} onChange={(e) => setWage(e.target.value)} placeholder="$ per m²" />
			</div>
			<div className="flex gap-2">
				<Button type="submit" size="sm">
					Create
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

function AddChecklistForm({
	subStageId,
	mutators,
}: {
	subStageId: string;
	mutators: ReturnType<typeof useTemplateMutations>;
}) {
	const [text, setText] = useState("");
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (!text.trim()) return;
				mutators.addChecklistItem.mutate({ subStageId, text: text.trim() });
				setText("");
			}}
			className="mt-2 flex gap-2"
		>
			<Input
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder="Add control point…"
				className="text-xs"
			/>
			<Button type="submit" size="sm" disabled={!text.trim()}>
				<Plus className="size-3" />
			</Button>
		</form>
	);
}

function AddMediaForm({
	subStageId,
	mutators,
}: {
	subStageId: string;
	mutators: ReturnType<typeof useTemplateMutations>;
}) {
	const [desc, setDesc] = useState("");
	const [type, setType] = useState<"PHOTO" | "VIDEO">("PHOTO");
	const [required, setRequired] = useState(true);
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (!desc.trim()) return;
				mutators.addMediaRequirement.mutate({
					subStageId,
					mediaType: type,
					required,
					description: desc.trim(),
				});
				setDesc("");
			}}
			className="mt-2 flex gap-2 items-center"
		>
			<select
				value={type}
				onChange={(e) => setType(e.target.value as "PHOTO" | "VIDEO")}
				className="h-7 rounded border bg-input/30 px-1 text-xs"
			>
				<option value="PHOTO">PHOTO</option>
				<option value="VIDEO">VIDEO</option>
			</select>
			<Input
				value={desc}
				onChange={(e) => setDesc(e.target.value)}
				placeholder="Add media requirement…"
				className="text-xs"
			/>
			<span className="flex items-center gap-1 text-xs">
				<Switch checked={required} onCheckedChange={(c) => setRequired(!!c)} size="sm" />
				req
			</span>
			<Button type="submit" size="sm" disabled={!desc.trim()}>
				<Plus className="size-3" />
			</Button>
		</form>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="block space-y-1">
			<span className="text-xs font-medium text-muted-foreground">{label}</span>
			<div>{children}</div>
		</div>
	);
}

function InlineText({
	value,
	onSave,
	className,
}: {
	value: string;
	onSave: (v: string) => void;
	className?: string;
}) {
	const [draft, setDraft] = useState(value);
	const [editing, setEditing] = useState(false);
	if (!editing) {
		return (
			<button
				type="button"
				onClick={() => setEditing(true)}
				className={`${className ?? ""} cursor-text hover:underline decoration-dotted text-left bg-transparent`}
			>
				{value || <span className="italic text-muted-foreground">empty</span>}
			</button>
		);
	}
	return (
		<Input
			autoFocus
			value={draft}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={() => {
				setEditing(false);
				if (draft !== value) onSave(draft);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
				if (e.key === "Escape") {
					setDraft(value);
					setEditing(false);
				}
			}}
			className={className}
		/>
	);
}

function InlineTextarea({
	value,
	onSave,
	className,
	placeholder,
}: {
	value: string;
	onSave: (v: string) => void;
	className?: string;
	placeholder?: string;
}) {
	const [draft, setDraft] = useState(value);
	return (
		<Textarea
			rows={2}
			value={draft}
			placeholder={placeholder}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={() => {
				if (draft !== value) onSave(draft);
			}}
			className={className}
		/>
	);
}
