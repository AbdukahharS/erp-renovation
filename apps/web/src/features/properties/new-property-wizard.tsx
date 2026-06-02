import { zodResolver } from "@hookform/resolvers/zod";
import { CreatePropertyInput, type TemplateTree, z } from "@repo/validators";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, FileText, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	createLocalOps,
	snapshotsEqual,
	treeToSnapshot,
} from "@/features/templates/components/local-ops";
import { TemplateTreeEditor } from "@/features/templates/template-editor";
import {
	useAttachFloorPlan,
	useCreateProperty,
	usePresignFloorPlan,
} from "@/lib/queries/properties";
import { useTemplatesList, useTemplateTree } from "@/lib/queries/templates";

type Step = 1 | 2 | 3 | 4 | 5;

// UX guardrail only — bypassable. Server-side cap belongs in Phase 4/9 when
// we add stat-and-reject on attach. 50 MB comfortably fits hi-res floor plans
// and PDFs while keeping accidental video uploads out.
const FLOOR_PLAN_MAX_BYTES = 50 * 1024 * 1024;
const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

type UploadState =
	| { kind: "idle" }
	| { kind: "uploading"; pct: number }
	| { kind: "attaching" }
	| { kind: "done" };

// Form-local schema: deadlineAt comes from <input type="datetime-local"> as
// "YYYY-MM-DDTHH:mm", which fails CreatePropertyInput's .datetime() check.
// We validate the remaining fields against the shared schema (sans templateId/
// editedSnapshot which are wizard-state) and convert deadlineAt on submit.
const FormSchema = CreatePropertyInput.omit({
	deadlineAt: true,
	templateId: true,
	editedSnapshot: true,
}).extend({
	deadlineAt: z.string(),
});
type FormValues = z.infer<typeof FormSchema>;

export function NewPropertyWizard() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [step, setStep] = useState<Step>(1);
	const [propertyId, setPropertyId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const {
		register,
		control,
		handleSubmit,
		trigger,
		formState: { errors },
	} = useForm<FormValues>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			name: "",
			address: "",
			layoutType: "NEW_BUILD",
			areaSqm: "",
			plannedUnitCost: "",
			deadlineAt: "",
		},
		mode: "onTouched",
	});

	// Step 3 — template picker
	const templatesQ = useTemplatesList();
	const [templateId, setTemplateId] = useState<string | null>(null);

	// Default-select tenant's default template once the list loads.
	useEffect(() => {
		if (templateId || !templatesQ.data) return;
		const def = templatesQ.data.find((t) => t.isDefault) ?? templatesQ.data[0];
		if (def) setTemplateId(def.id);
	}, [templatesQ.data, templateId]);

	// Step 4 — local editor state, hydrated from chosen template tree. Uses the
	// same TemplateTree shape (and reuses TemplateTreeEditor) so the wizard's
	// tailor step looks identical to the templates page.
	const treeQ = useTemplateTree(templateId ?? undefined);
	const [localTree, setLocalTree] = useState<TemplateTree | null>(null);
	const originalSnapshotRef = useRef<ReturnType<typeof treeToSnapshot> | null>(null);

	useEffect(() => {
		if (!treeQ.data) return;
		// Clone so editor mutations never affect the cached query data.
		const cloned: TemplateTree = JSON.parse(JSON.stringify(treeQ.data));
		setLocalTree(cloned);
		originalSnapshotRef.current = treeToSnapshot(cloned);
	}, [treeQ.data]);

	const ops = useMemo(
		() =>
			createLocalOps((updater) => {
				setLocalTree((prev) => (prev ? updater(prev) : prev));
			}),
		[],
	);

	// Step 5 (upload) — UI state, not form state
	const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
	const [upload, setUpload] = useState<UploadState>({ kind: "idle" });
	const xhrRef = useRef<XMLHttpRequest | null>(null);

	const createMut = useCreateProperty();
	const presignMut = usePresignFloorPlan(propertyId ?? undefined);
	const attachMut = useAttachFloorPlan(propertyId ?? undefined);

	async function advanceToStep2() {
		const ok = await trigger(["name", "address", "layoutType"]);
		if (ok) setStep(2);
	}

	async function advanceToStep3() {
		const ok = await trigger(["areaSqm", "plannedUnitCost"]);
		if (ok) setStep(3);
	}

	const pickedTemplate = useMemo(
		() => templatesQ.data?.find((t) => t.id === templateId) ?? null,
		[templatesQ.data, templateId],
	);

	const submitBasics = handleSubmit(async (values) => {
		setError(null);
		if (!templateId) {
			setError(t("newPropertyWizard.pickTemplateFirst"));
			return;
		}
		try {
			let editedSnapshot: ReturnType<typeof treeToSnapshot> | undefined;
			if (localTree) {
				const next = treeToSnapshot(localTree);
				if (!originalSnapshotRef.current || !snapshotsEqual(next, originalSnapshotRef.current)) {
					editedSnapshot = next;
				}
			}
			const res = await createMut.mutateAsync({
				name: values.name,
				address: values.address,
				layoutType: values.layoutType,
				areaSqm: values.areaSqm,
				plannedUnitCost: values.plannedUnitCost,
				deadlineAt: values.deadlineAt ? new Date(values.deadlineAt).toISOString() : null,
				templateId,
				editedSnapshot,
			});
			setPropertyId(res.id);
			setStep(5);
		} catch (err) {
			setError((err as Error).message);
		}
	});

	function uploadWithProgress(url: string, file: File): Promise<void> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhrRef.current = xhr;
			xhr.open("PUT", url);
			xhr.setRequestHeader("content-type", file.type);
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) {
					setUpload({ kind: "uploading", pct: Math.round((e.loaded / e.total) * 100) });
				}
			};
			xhr.onload = () => {
				xhrRef.current = null;
				if (xhr.status >= 200 && xhr.status < 300) resolve();
				else reject(new Error(`R2 upload failed: ${xhr.status}`));
			};
			xhr.onerror = () => {
				xhrRef.current = null;
				reject(new Error("network error during upload"));
			};
			xhr.onabort = () => {
				xhrRef.current = null;
				reject(new Error("aborted"));
			};
			xhr.send(file);
		});
	}

	async function uploadFloorPlan() {
		if (!floorPlanFile || !propertyId) return;
		setError(null);
		setUpload({ kind: "uploading", pct: 0 });
		try {
			const presigned = await presignMut.mutateAsync(floorPlanFile.type);
			await uploadWithProgress(presigned.uploadUrl, floorPlanFile);
			setUpload({ kind: "attaching" });
			await attachMut.mutateAsync(presigned.assetId);
			setUpload({ kind: "done" });
			// brief success flash before navigation
			setTimeout(finish, 600);
		} catch (err) {
			const msg = (err as Error).message;
			setUpload({ kind: "idle" });
			if (msg !== "aborted") setError(msg);
		}
	}

	function cancelUpload() {
		xhrRef.current?.abort();
	}

	function finish() {
		if (propertyId) navigate({ to: "/owner/properties/$propertyId", params: { propertyId } });
		else navigate({ to: "/owner/properties" });
	}

	const isBusy = upload.kind !== "idle";
	const STEPS: Step[] = [1, 2, 3, 4, 5];

	return (
		<section className="mx-auto max-w-4xl space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{t("newPropertyWizard.title")}</h1>
					<p className="text-sm text-muted-foreground">{t("newPropertyWizard.stepOf", { step })}</p>
				</div>
				<Link to="/owner/properties" className="text-sm text-muted-foreground hover:underline">
					{t("newPropertyWizard.cancel")}
				</Link>
			</header>

			<div className="flex gap-2">
				{STEPS.map((n) => (
					<motion.div
						key={n}
						className="h-1 flex-1 rounded-full bg-muted"
						animate={{ backgroundColor: n <= step ? "var(--primary)" : "var(--muted)" }}
						transition={{ duration: 0.3 }}
					/>
				))}
			</div>

			<AnimatePresence mode="wait">
				{error && (
					<motion.div
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
					>
						{error}
					</motion.div>
				)}
			</AnimatePresence>

			{step === 1 && (
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						advanceToStep2();
					}}
				>
					<div className="space-y-1.5">
						<Label htmlFor="name">{t("newPropertyWizard.nameLabel")}</Label>
						<Input
							id="name"
							placeholder={t("newPropertyWizard.namePlaceholder")}
							{...register("name")}
						/>
						{errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="address">{t("newPropertyWizard.addressLabel")}</Label>
						<Input
							id="address"
							placeholder={t("newPropertyWizard.addressPlaceholder")}
							{...register("address")}
						/>
						{errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
					</div>
					<div className="space-y-1.5">
						<Label>{t("newPropertyWizard.layoutLabel")}</Label>
						<Controller
							control={control}
							name="layoutType"
							render={({ field }) => (
								<div className="flex gap-2">
									{(["NEW_BUILD", "SECONDARY"] as const).map((opt) => (
										<button
											type="button"
											key={opt}
											onClick={() => field.onChange(opt)}
											className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
												field.value === opt
													? "border-primary bg-primary/10 text-primary"
													: "border-input hover:bg-muted"
											}`}
										>
											{opt === "NEW_BUILD"
												? t("newPropertyWizard.layoutNewBuild")
												: t("newPropertyWizard.layoutSecondary")}
										</button>
									))}
								</div>
							)}
						/>
					</div>
					<div className="flex justify-end">
						<Button type="submit">{t("newPropertyWizard.next")}</Button>
					</div>
				</form>
			)}

			{step === 2 && (
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						advanceToStep3();
					}}
				>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<Label htmlFor="area">{t("newPropertyWizard.areaLabel")}</Label>
							<Input id="area" type="number" step="0.01" min="0.01" {...register("areaSqm")} />
							{errors.areaSqm && (
								<p className="text-sm text-destructive">{errors.areaSqm.message}</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="puc">{t("newPropertyWizard.plannedUnitCostLabel")}</Label>
							<Input id="puc" type="number" step="0.01" min="0" {...register("plannedUnitCost")} />
							{errors.plannedUnitCost && (
								<p className="text-sm text-destructive">{errors.plannedUnitCost.message}</p>
							)}
						</div>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="deadline">{t("newPropertyWizard.deadlineLabel")}</Label>
						<Input id="deadline" type="datetime-local" {...register("deadlineAt")} />
					</div>
					<div className="flex justify-between">
						<Button type="button" variant="outline" onClick={() => setStep(1)}>
							{t("newPropertyWizard.back")}
						</Button>
						<Button type="submit">{t("newPropertyWizard.next")}</Button>
					</div>
				</form>
			)}

			{step === 3 && (
				<div className="space-y-4">
					<div>
						<h2 className="text-lg font-medium">{t("newPropertyWizard.pickTemplateTitle")}</h2>
						<p className="text-sm text-muted-foreground">
							{t("newPropertyWizard.pickTemplateHelp")}
						</p>
					</div>
					{templatesQ.isLoading && (
						<p className="text-sm text-muted-foreground">
							{t("newPropertyWizard.loadingTemplates")}
						</p>
					)}
					{templatesQ.data && templatesQ.data.length === 0 && (
						<p className="text-sm text-destructive">{t("newPropertyWizard.noTemplates")}</p>
					)}
					<div className="space-y-2">
						{templatesQ.data?.map((tpl) => (
							<button
								type="button"
								key={tpl.id}
								onClick={() => {
									if (templateId !== tpl.id) {
										setTemplateId(tpl.id);
										setLocalTree(null);
										originalSnapshotRef.current = null;
									}
								}}
								className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
									templateId === tpl.id
										? "border-primary bg-primary/5"
										: "border-input hover:bg-muted"
								}`}
							>
								<div>
									<div className="font-medium">{tpl.name}</div>
									{tpl.isDefault && (
										<div className="text-xs text-muted-foreground">
											{t("newPropertyWizard.defaultBadge")}
										</div>
									)}
								</div>
								{templateId === tpl.id && <Check className="size-4 text-primary" />}
							</button>
						))}
					</div>
					<div className="flex justify-between">
						<Button type="button" variant="outline" onClick={() => setStep(2)}>
							{t("newPropertyWizard.back")}
						</Button>
						<Button type="button" disabled={!templateId} onClick={() => setStep(4)}>
							{t("newPropertyWizard.next")}
						</Button>
					</div>
				</div>
			)}

			{step === 4 && (
				<div className="space-y-4">
					<div>
						<h2 className="text-lg font-medium">{t("newPropertyWizard.tailorTitle")}</h2>
						<p className="text-sm text-muted-foreground">
							{t("newPropertyWizard.tailorHelp", { name: pickedTemplate?.name ?? "" })}
						</p>
					</div>
					{treeQ.isLoading && (
						<p className="text-sm text-muted-foreground">
							{t("newPropertyWizard.loadingSnapshot")}
						</p>
					)}
					{treeQ.error && <p className="text-sm text-destructive">{String(treeQ.error)}</p>}
					{localTree && (
						<TemplateTreeEditor
							tree={localTree}
							ops={ops}
							renameLabelSlot={
								<h3 className="text-lg font-semibold">{pickedTemplate?.name ?? ""}</h3>
							}
						/>
					)}
					<div className="flex items-center justify-between">
						<Button type="button" variant="outline" onClick={() => setStep(3)}>
							{t("newPropertyWizard.back")}
						</Button>
						<div className="flex gap-2">
							{treeQ.data && (
								<Button
									type="button"
									variant="ghost"
									onClick={() => {
										if (treeQ.data) {
											const cloned: TemplateTree = JSON.parse(JSON.stringify(treeQ.data));
											setLocalTree(cloned);
											originalSnapshotRef.current = treeToSnapshot(cloned);
										}
									}}
								>
									{t("newPropertyWizard.resetTemplate")}
								</Button>
							)}
							<Button
								type="button"
								onClick={submitBasics}
								disabled={createMut.isPending || !localTree}
							>
								{createMut.isPending
									? t("newPropertyWizard.creating")
									: t("newPropertyWizard.createAndContinue")}
							</Button>
						</div>
					</div>
				</div>
			)}

			{step === 5 && (
				<div className="space-y-5">
					<div className="rounded-md border bg-muted/30 p-3 text-sm">
						{t("newPropertyWizard.createdNotice")}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="floorplan">
							{t("newPropertyWizard.floorPlanLabel", { size: formatMb(FLOOR_PLAN_MAX_BYTES) })}
						</Label>
						<Input
							id="floorplan"
							type="file"
							accept="image/jpeg,image/png,image/webp,application/pdf"
							disabled={isBusy}
							onChange={(e) => {
								const f = e.target.files?.[0] ?? null;
								if (f && f.size > FLOOR_PLAN_MAX_BYTES) {
									setError(
										t("newPropertyWizard.floorPlanTooLarge", {
											actual: formatMb(f.size),
											max: formatMb(FLOOR_PLAN_MAX_BYTES),
										}),
									);
									setFloorPlanFile(null);
									e.target.value = "";
									return;
								}
								setError(null);
								setFloorPlanFile(f);
							}}
						/>
					</div>

					<AnimatePresence mode="wait">
						{floorPlanFile && (
							<motion.div
								key="picked"
								layout
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -6 }}
								transition={{ duration: 0.2 }}
								className="overflow-hidden rounded-lg border bg-card"
							>
								<div className="flex items-center gap-3 p-3">
									<motion.div
										className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary"
										animate={
											upload.kind === "uploading" || upload.kind === "attaching"
												? { scale: [1, 1.05, 1] }
												: { scale: 1 }
										}
										transition={{
											duration: 1.4,
											repeat:
												upload.kind === "uploading" || upload.kind === "attaching" ? Infinity : 0,
										}}
									>
										<AnimatePresence mode="wait">
											{upload.kind === "done" ? (
												<motion.div
													key="done"
													initial={{ scale: 0, rotate: -45 }}
													animate={{ scale: 1, rotate: 0 }}
													transition={{ type: "spring", stiffness: 400, damping: 18 }}
												>
													<Check className="h-5 w-5 text-emerald-600" />
												</motion.div>
											) : (
												<motion.div
													key="file"
													initial={{ opacity: 0 }}
													animate={{ opacity: 1 }}
													exit={{ opacity: 0 }}
												>
													<FileText className="h-5 w-5" />
												</motion.div>
											)}
										</AnimatePresence>
									</motion.div>

									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-medium">{floorPlanFile.name}</div>
										<div className="text-xs text-muted-foreground">
											{formatMb(floorPlanFile.size)}
											{upload.kind === "uploading" && (
												<span className="ml-1.5 tabular-nums">· {upload.pct}%</span>
											)}
											{upload.kind === "attaching" && (
												<span className="ml-1.5 inline-flex items-center gap-1">
													· <Loader2 className="h-3 w-3 animate-spin" />{" "}
													{t("newPropertyWizard.linkingToProperty")}
												</span>
											)}
											{upload.kind === "done" && (
												<span className="ml-1.5 text-emerald-600">
													· {t("newPropertyWizard.attached")}
												</span>
											)}
										</div>
									</div>

									{upload.kind === "uploading" && (
										<button
											type="button"
											onClick={cancelUpload}
											className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
											aria-label={t("newPropertyWizard.cancelUpload")}
										>
											<X className="h-4 w-4" />
										</button>
									)}
								</div>

								<AnimatePresence>
									{(upload.kind === "uploading" ||
										upload.kind === "attaching" ||
										upload.kind === "done") && (
										<motion.div
											key="bar"
											initial={{ height: 0, opacity: 0 }}
											animate={{ height: "auto", opacity: 1 }}
											exit={{ height: 0, opacity: 0 }}
											transition={{ duration: 0.2 }}
											className="overflow-hidden"
										>
											<div className="relative h-1.5 w-full overflow-hidden bg-primary/15">
												<motion.div
													className={`h-full ${upload.kind === "done" ? "bg-emerald-500" : "bg-primary"}`}
													initial={false}
													animate={{
														width:
															upload.kind === "uploading"
																? `${upload.pct}%`
																: upload.kind === "attaching"
																	? "100%"
																	: "100%",
													}}
													transition={{
														type: "spring",
														stiffness: 220,
														damping: 30,
														mass: 0.6,
													}}
												/>
												{/* Moving sheen while active. Hidden once done. */}
												{(upload.kind === "uploading" || upload.kind === "attaching") && (
													<motion.div
														className="absolute inset-y-0 w-1/3 bg-linear-to-r from-transparent via-white/45 to-transparent"
														initial={{ x: "-100%" }}
														animate={{ x: "350%" }}
														transition={{
															duration: 1.4,
															repeat: Infinity,
															ease: "linear",
														}}
													/>
												)}
											</div>
										</motion.div>
									)}
								</AnimatePresence>
							</motion.div>
						)}
					</AnimatePresence>

					<div className="flex justify-between">
						<Button type="button" variant="outline" onClick={finish} disabled={isBusy}>
							{t("newPropertyWizard.skip")}
						</Button>
						<Button type="button" onClick={uploadFloorPlan} disabled={!floorPlanFile || isBusy}>
							{upload.kind === "uploading" && t("newPropertyWizard.uploading", { pct: upload.pct })}
							{upload.kind === "attaching" && t("newPropertyWizard.linking")}
							{upload.kind === "done" && t("newPropertyWizard.done")}
							{upload.kind === "idle" && t("newPropertyWizard.uploadAndFinish")}
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}
