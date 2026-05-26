import { zodResolver } from "@hookform/resolvers/zod";
import { CreatePropertyInput, z } from "@repo/validators";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, FileText, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	useAttachFloorPlan,
	useCreateProperty,
	usePresignFloorPlan,
} from "@/lib/queries/properties";

type Step = 1 | 2 | 3;

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
// We validate the remaining fields against the shared schema and convert
// deadlineAt on submit.
const FormSchema = CreatePropertyInput.omit({ deadlineAt: true }).extend({
	deadlineAt: z.string(),
});
type FormValues = z.infer<typeof FormSchema>;

export function NewPropertyWizard() {
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

	// Step 3 (upload) — UI state, not form state
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

	const submitBasics = handleSubmit(async (values) => {
		setError(null);
		try {
			const res = await createMut.mutateAsync({
				name: values.name,
				address: values.address,
				layoutType: values.layoutType,
				areaSqm: values.areaSqm,
				plannedUnitCost: values.plannedUnitCost,
				deadlineAt: values.deadlineAt ? new Date(values.deadlineAt).toISOString() : null,
			});
			setPropertyId(res.id);
			setStep(3);
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

	return (
		<section className="mx-auto max-w-2xl space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">New property</h1>
					<p className="text-sm text-muted-foreground">Step {step} of 3</p>
				</div>
				<Link to="/owner/properties" className="text-sm text-muted-foreground hover:underline">
					Cancel
				</Link>
			</header>

			<div className="flex gap-2">
				{[1, 2, 3].map((n) => (
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
						<Label htmlFor="name">Name / unit label</Label>
						<Input id="name" placeholder="Apt 14, Building A" {...register("name")} />
						{errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="address">Address</Label>
						<Input id="address" placeholder="123 Main St, Floor 4" {...register("address")} />
						{errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
					</div>
					<div className="space-y-1.5">
						<Label>Layout type</Label>
						<Controller
							control={control}
							name="layoutType"
							render={({ field }) => (
								<div className="flex gap-2">
									{(["NEW_BUILD", "SECONDARY"] as const).map((t) => (
										<button
											type="button"
											key={t}
											onClick={() => field.onChange(t)}
											className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
												field.value === t
													? "border-primary bg-primary/10 text-primary"
													: "border-input hover:bg-muted"
											}`}
										>
											{t === "NEW_BUILD" ? "New build" : "Secondary"}
										</button>
									))}
								</div>
							)}
						/>
					</div>
					<div className="flex justify-end">
						<Button type="submit">Next</Button>
					</div>
				</form>
			)}

			{step === 2 && (
				<form className="space-y-4" onSubmit={submitBasics}>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<Label htmlFor="area">Area (m²)</Label>
							<Input id="area" type="number" step="0.01" min="0.01" {...register("areaSqm")} />
							{errors.areaSqm && (
								<p className="text-sm text-destructive">{errors.areaSqm.message}</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="puc">Planned unit cost</Label>
							<Input id="puc" type="number" step="0.01" min="0" {...register("plannedUnitCost")} />
							{errors.plannedUnitCost && (
								<p className="text-sm text-destructive">{errors.plannedUnitCost.message}</p>
							)}
						</div>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="deadline">Deadline (optional)</Label>
						<Input id="deadline" type="datetime-local" {...register("deadlineAt")} />
					</div>
					<div className="flex justify-between">
						<Button type="button" variant="outline" onClick={() => setStep(1)}>
							Back
						</Button>
						<Button type="submit" disabled={createMut.isPending}>
							{createMut.isPending ? "Creating…" : "Create & continue"}
						</Button>
					</div>
				</form>
			)}

			{step === 3 && (
				<div className="space-y-5">
					<div className="rounded-md border bg-muted/30 p-3 text-sm">
						Property created. Optionally attach a floor plan now, or skip and add it later.
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="floorplan">
							Floor plan (image or PDF, max {formatMb(FLOOR_PLAN_MAX_BYTES)})
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
										`Floor plan is ${formatMb(f.size)}; maximum is ${formatMb(FLOOR_PLAN_MAX_BYTES)}.`,
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
													· <Loader2 className="h-3 w-3 animate-spin" /> linking to property
												</span>
											)}
											{upload.kind === "done" && (
												<span className="ml-1.5 text-emerald-600">· attached</span>
											)}
										</div>
									</div>

									{upload.kind === "uploading" && (
										<button
											type="button"
											onClick={cancelUpload}
											className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
											aria-label="Cancel upload"
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
							Skip
						</Button>
						<Button type="button" onClick={uploadFloorPlan} disabled={!floorPlanFile || isBusy}>
							{upload.kind === "uploading" && `Uploading… ${upload.pct}%`}
							{upload.kind === "attaching" && "Linking…"}
							{upload.kind === "done" && "Done"}
							{upload.kind === "idle" && "Upload & finish"}
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}
