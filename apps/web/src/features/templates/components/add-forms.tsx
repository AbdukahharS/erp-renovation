import { zodResolver } from "@hookform/resolvers/zod";
import {
	CreateChecklistItemInput,
	CreateMediaRequirementInput,
	CreateSubStageInput,
	z,
} from "@repo/validators";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { useTemplateMutations } from "@/lib/queries/templates";

type Mutators = ReturnType<typeof useTemplateMutations>;

// standardDurationDays is typed in the input field as a string; the shared
// schema wants a number. Validate as a digit-string here and coerce on submit.
const SubStageForm = CreateSubStageInput.omit({
	standardDurationDays: true,
	specialization: true,
	description: true,
}).extend({
	standardDurationDays: z.string().regex(/^\d+$/, "whole days"),
});
type SubStageFormValues = z.infer<typeof SubStageForm>;

export function AddSubStageForm({ stageId, mutators }: { stageId: string; mutators: Mutators }) {
	const [open, setOpen] = useState(false);
	const {
		register,
		handleSubmit,
		control,
		reset,
		formState: { errors },
	} = useForm<SubStageFormValues>({
		resolver: zodResolver(SubStageForm),
		defaultValues: {
			code: "",
			name: "",
			performerType: "MASTER",
			wageRatePerSqm: "0",
			standardDurationDays: "1",
		},
	});

	if (!open) {
		return (
			<Button variant="outline" size="sm" onClick={() => setOpen(true)}>
				<Plus className="size-4" /> Add sub-stage
			</Button>
		);
	}

	const onSubmit = handleSubmit((values) => {
		mutators.addSubStage.mutate({
			stageId,
			code: values.code.trim(),
			name: values.name.trim(),
			performerType: values.performerType,
			wageRatePerSqm: values.wageRatePerSqm,
			standardDurationDays: Number.parseInt(values.standardDurationDays, 10),
		});
		setOpen(false);
		reset();
	});

	return (
		<form onSubmit={onSubmit} className="rounded-md border p-2 space-y-2">
			<div className="grid grid-cols-2 gap-2">
				<div>
					<Input placeholder="code (e.g. 1.4)" {...register("code")} />
					{errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
				</div>
				<div>
					<Input placeholder="name" {...register("name")} />
					{errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
				</div>
				<Controller
					control={control}
					name="performerType"
					render={({ field }) => (
						<Select value={field.value} onValueChange={field.onChange}>
							<SelectTrigger className="h-9 w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="MASTER">MASTER</SelectItem>
								<SelectItem value="INSPECTOR">INSPECTOR</SelectItem>
							</SelectContent>
						</Select>
					)}
				/>
				<div>
					<Input placeholder="days" {...register("standardDurationDays")} />
					{errors.standardDurationDays && (
						<p className="text-xs text-destructive">{errors.standardDurationDays.message}</p>
					)}
				</div>
				<div className="col-span-2">
					<Input placeholder="$ per m²" {...register("wageRatePerSqm")} />
					{errors.wageRatePerSqm && (
						<p className="text-xs text-destructive">{errors.wageRatePerSqm.message}</p>
					)}
				</div>
			</div>
			<div className="flex gap-2">
				<Button type="submit" size="sm">
					Create
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => {
						setOpen(false);
						reset();
					}}
				>
					Cancel
				</Button>
			</div>
		</form>
	);
}

type ChecklistFormValues = z.infer<typeof CreateChecklistItemInput>;

export function AddChecklistForm({
	subStageId,
	mutators,
}: {
	subStageId: string;
	mutators: Mutators;
}) {
	const {
		register,
		handleSubmit,
		reset,
		formState: { isValid },
	} = useForm<ChecklistFormValues>({
		resolver: zodResolver(CreateChecklistItemInput),
		defaultValues: { text: "" },
		mode: "onChange",
	});

	const onSubmit = handleSubmit((values) => {
		mutators.addChecklistItem.mutate({ subStageId, text: values.text.trim() });
		reset({ text: "" });
	});

	return (
		<form onSubmit={onSubmit} className="mt-2 flex gap-2">
			<Input placeholder="Add control point…" className="text-xs" {...register("text")} />
			<Button type="submit" size="sm" disabled={!isValid}>
				<Plus className="size-3" />
			</Button>
		</form>
	);
}

type MediaFormValues = z.input<typeof CreateMediaRequirementInput>;

export function AddMediaForm({ subStageId, mutators }: { subStageId: string; mutators: Mutators }) {
	const {
		register,
		handleSubmit,
		control,
		reset,
		formState: { isValid },
	} = useForm<MediaFormValues>({
		resolver: zodResolver(CreateMediaRequirementInput),
		defaultValues: { description: "", mediaType: "PHOTO", required: true },
		mode: "onChange",
	});

	const onSubmit = handleSubmit((values) => {
		mutators.addMediaRequirement.mutate({
			subStageId,
			mediaType: values.mediaType,
			required: values.required ?? true,
			description: values.description.trim(),
		});
		reset({ description: "", mediaType: "PHOTO", required: true });
	});

	return (
		<form onSubmit={onSubmit} className="mt-2 flex gap-2 items-center">
			<Controller
				control={control}
				name="mediaType"
				render={({ field }) => (
					<Select value={field.value} onValueChange={field.onChange}>
						<SelectTrigger size="sm" className="text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="PHOTO">PHOTO</SelectItem>
							<SelectItem value="VIDEO">VIDEO</SelectItem>
						</SelectContent>
					</Select>
				)}
			/>
			<Input
				placeholder="Add media requirement…"
				className="text-xs"
				{...register("description")}
			/>
			<Controller
				control={control}
				name="required"
				render={({ field }) => (
					<span className="flex items-center gap-1 text-xs">
						<Switch checked={field.value} onCheckedChange={(c) => field.onChange(!!c)} size="sm" />
						req
					</span>
				)}
			/>
			<Button type="submit" size="sm" disabled={!isValid}>
				<Plus className="size-3" />
			</Button>
		</form>
	);
}
