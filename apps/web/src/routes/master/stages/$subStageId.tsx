import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangleIcon,
	CheckIcon,
	ClipboardCheckIcon,
	ClockIcon,
	ImagePlus,
	Loader2,
	RulerIcon,
	Trash2,
	WalletIcon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StageMediaView } from "@/lib/queries/acceptance";
import {
	uploadToPresignedUrl,
	useAttachStageMedia,
	useDetachStageMedia,
	usePresignStageMedia,
	useStageDetail,
	useSubmitStage,
	useTakeStage,
} from "@/lib/queries/acceptance";

export const Route = createFileRoute("/master/stages/$subStageId")({
	component: MasterStageDetail,
});

function MasterStageDetail() {
	const { t } = useTranslation();
	const { subStageId } = Route.useParams();
	const { data, isLoading, error } = useStageDetail("master", subStageId);
	const take = useTakeStage();
	const presign = usePresignStageMedia(subStageId);
	const attach = useAttachStageMedia(subStageId);
	const detach = useDetachStageMedia(subStageId);
	const submit = useSubmitStage();
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [uploadingFor, setUploadingFor] = useState<string | "extra" | null>(null);

	if (isLoading || !data)
		return <p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>;
	if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

	const { subStage, stageName, property, assignment, media, latestRejection } = data;
	const resultById = new Map(
		(latestRejection?.results ?? []).map((r) => [r.checklistItemInstanceId, r]),
	);
	const rejectionItems = subStage.checklistItems.map((item) => {
		const r = resultById.get(item.id);
		return {
			item,
			passed: r?.passed ?? null,
			note: r?.note ?? null,
		};
	});
	const failedCount = rejectionItems.filter((r) => r.passed === false).length;
	const passedCount = rejectionItems.filter((r) => r.passed === true).length;

	const mediaByRequirement = new Map<string, typeof media>();
	const extraMedia: typeof media = [];
	for (const m of media) {
		if (m.requirementId) {
			const arr = mediaByRequirement.get(m.requirementId) ?? [];
			arr.push(m);
			mediaByRequirement.set(m.requirementId, arr);
		} else {
			extraMedia.push(m);
		}
	}
	const missingRequired = subStage.mediaRequirements.filter(
		(r) => r.required && !(mediaByRequirement.get(r.id)?.length ?? 0),
	);
	const isUploadable = subStage.status === "IN_PROGRESS" || subStage.status === "REJECTED";
	const submitDisabled = !isUploadable || missingRequired.length > 0;

	async function handleFile(file: File, requirementId: string | null) {
		setUploadError(null);
		setUploadingFor(requirementId ?? "extra");
		try {
			const mediaType: "PHOTO" | "VIDEO" = file.type.startsWith("video/") ? "VIDEO" : "PHOTO";
			const { uploadUrl, assetId } = await presign.mutateAsync({
				mediaType,
				contentType: file.type,
			});
			await uploadToPresignedUrl(uploadUrl, file);
			await attach.mutateAsync({ assetId, requirementId });
		} catch (e) {
			setUploadError((e as Error).message);
		} finally {
			setUploadingFor(null);
		}
	}

	return (
		<section className="space-y-5">
			<div className="space-y-1">
				<Link to="/master" className="text-xs text-muted-foreground hover:underline">
					{t("masterStage.back")}
				</Link>
				<div className="flex items-baseline gap-2">
					<span className="font-mono text-sm text-muted-foreground">{subStage.code}</span>
					<Badge variant={subStage.status === "REJECTED" ? "destructive" : "default"}>
						{t(`stageStatus.${subStage.status}`, subStage.status.replace("_", " ").toLowerCase())}
					</Badge>
				</div>
				<h1 className="text-xl font-semibold">{subStage.name}</h1>
				<p className="text-sm text-muted-foreground">
					{property.name} · {stageName}
				</p>
				<div className="mt-1 flex flex-wrap items-center gap-1.5">
					<span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium tabular-nums">
						<ClockIcon className="size-3 text-muted-foreground" />
						{t("masterStage.durationLabel", { count: subStage.standardDurationDays })}
					</span>
					{Number(property.areaSqm) > 0 && (
						<span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium tabular-nums">
							<RulerIcon className="size-3 text-muted-foreground" />
							{t("masterStage.areaLabel", { area: property.areaSqm })}
						</span>
					)}
					{Number(subStage.wageAmount) > 0 && (
						<span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-50 px-2 py-0.5 text-xs font-medium tabular-nums text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-400">
							<WalletIcon className="size-3" />
							{t("masterStage.wageLabel", { amount: subStage.wageAmount })}
						</span>
					)}
				</div>
				{subStage.description && (
					<p className="text-sm text-muted-foreground">{subStage.description}</p>
				)}
			</div>

			{subStage.status === "AVAILABLE" && !assignment && (
				<Button
					size="lg"
					onClick={() => take.mutate(subStageId)}
					disabled={take.isPending}
					className="w-full"
				>
					{take.isPending ? t("masterStage.claiming") : t("masterStage.takeIntoWork")}
				</Button>
			)}

			{subStage.status === "REJECTED" && latestRejection && (
				<Card className="overflow-hidden border-destructive/40 p-0">
					<div className="space-y-3 border-b border-destructive/20 bg-destructive/10 p-4">
						<div className="flex items-center gap-2">
							<AlertTriangleIcon className="size-4 text-destructive" />
							<h2 className="text-sm font-semibold text-destructive">
								{t("masterStage.rejectedTitle")}
							</h2>
							<span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
								{new Date(latestRejection.rejectedAt).toLocaleString()}
							</span>
						</div>

						<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
							<div>
								<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
									{t("masterStage.rejectionComment")}
								</div>
								<p className="mt-1 whitespace-pre-wrap text-sm">{latestRejection.comment}</p>
							</div>
							{latestRejection.defect &&
								(latestRejection.defect.url &&
								latestRejection.defect.contentType.startsWith("image/") ? (
									<a
										href={latestRejection.defect.url}
										target="_blank"
										rel="noopener noreferrer"
										className="block"
										aria-label={t("masterStage.defectPhoto")}
									>
										<img
											src={latestRejection.defect.url}
											alt={t("masterStage.defectPhoto")}
											className="aspect-square w-24 rounded-md border border-destructive/30 object-cover sm:w-28"
										/>
									</a>
								) : (
									<div className="inline-block rounded-md border border-destructive/30 bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
										{latestRejection.defect.contentType}
									</div>
								))}
						</div>

						{rejectionItems.length > 0 && (failedCount > 0 || passedCount > 0) && (
							<div className="flex items-center gap-3 text-xs">
								<span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
									<XIcon className="size-3" />
									{t("masterStage.failedCountShort", { count: failedCount })}
								</span>
								<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
									<CheckIcon className="size-3" />
									{t("masterStage.passedCountShort", { count: passedCount })}
								</span>
							</div>
						)}
					</div>

					<div className="space-y-4 p-4">
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<ClipboardCheckIcon className="size-4 text-muted-foreground" />
								<h3 className="text-sm font-semibold">{t("masterStage.fixTheseItems")}</h3>
							</div>
							<p className="text-xs text-muted-foreground">{t("masterStage.fixTheseItemsHint")}</p>
						</div>

						<ol className="space-y-1.5 text-sm">
							{subStage.checklistItems.map((item, idx) => {
								const r = resultById.get(item.id);
								const passed = r?.passed === true;
								const failed = r?.passed === false;
								return (
									<li
										key={item.id}
										className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 ${
											failed
												? "border-destructive/40 bg-destructive/5"
												: passed
													? "border-emerald-300/40 bg-emerald-50/40 dark:border-emerald-800/40 dark:bg-emerald-950/20"
													: "border-border bg-muted/30"
										}`}
									>
										<span
											className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ${
												failed
													? "bg-destructive/15 text-destructive"
													: passed
														? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
														: "bg-muted text-muted-foreground"
											}`}
										>
											{failed ? (
												<XIcon className="size-3" />
											) : passed ? (
												<CheckIcon className="size-3" />
											) : (
												<span className="text-[10px] font-mono">{idx + 1}</span>
											)}
										</span>
										<div className="min-w-0 flex-1">
											<div className={passed ? "text-muted-foreground" : ""}>{item.text}</div>
											{item.criteria && (
												<div className="mt-0.5 text-xs text-muted-foreground">{item.criteria}</div>
											)}
											{failed && r?.note && (
												<div className="mt-0.5 text-xs text-destructive">
													{t("masterStage.inspectorNoted", { note: r.note })}
												</div>
											)}
										</div>
									</li>
								);
							})}
						</ol>

						<p className="text-xs text-muted-foreground">{t("masterStage.rejectedActionHint")}</p>
					</div>
				</Card>
			)}

			{subStage.status !== "REJECTED" &&
				(isUploadable || subStage.status === "AVAILABLE") &&
				subStage.checklistItems.length > 0 && (
					<Card className="space-y-3 p-4">
						<div className="flex items-center gap-2">
							<ClipboardCheckIcon className="size-4 text-muted-foreground" />
							<h2 className="text-sm font-semibold">{t("masterStage.inspectorChecklist")}</h2>
							<span className="ml-auto text-[10px] text-muted-foreground">
								{t("masterStage.checklistCount", { count: subStage.checklistItems.length })}
							</span>
						</div>
						<p className="text-xs text-muted-foreground">
							{t("masterStage.inspectorChecklistHint")}
						</p>
						<ol className="space-y-1.5 text-sm">
							{subStage.checklistItems.map((item, idx) => (
								<li key={item.id} className="flex items-start gap-2 rounded-md px-2 py-1.5">
									<span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-mono text-muted-foreground">
										{idx + 1}
									</span>
									<div className="min-w-0 flex-1">
										<div>{item.text}</div>
										{item.criteria && (
											<div className="mt-0.5 text-xs text-muted-foreground">{item.criteria}</div>
										)}
									</div>
								</li>
							))}
						</ol>
					</Card>
				)}

			{isUploadable && (
				<Card className="space-y-4 p-4">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold">{t("masterStage.requiredPhotos")}</h2>
						<span className="text-xs text-muted-foreground">
							{t("masterStage.slotsFilled", {
								filled: subStage.mediaRequirements.length - missingRequired.length,
								total: subStage.mediaRequirements.length,
							})}
						</span>
					</div>

					<ul className="space-y-3">
						{subStage.mediaRequirements.map((r) => {
							const attached = mediaByRequirement.get(r.id) ?? [];
							const slotUploading = uploadingFor === r.id;
							const filled = attached.length > 0;
							return (
								<li
									key={r.id}
									className={`rounded-lg border p-3 ${
										r.required && !filled
											? "border-amber-400/60 bg-amber-50/40 dark:border-amber-500/40 dark:bg-amber-950/20"
											: filled
												? "border-emerald-300/50 bg-emerald-50/40 dark:border-emerald-800/40 dark:bg-emerald-950/20"
												: "border-border"
									}`}
								>
									<div className="flex items-start gap-2">
										<span
											className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
												filled
													? "bg-emerald-500"
													: r.required
														? "bg-amber-500"
														: "bg-muted-foreground/40"
											}`}
										/>
										<div className="min-w-0 flex-1">
											<div className="text-sm">{r.description}</div>
											<div className="mt-0.5 text-[11px] text-muted-foreground">
												<span className="font-mono">{r.mediaType}</span>
												{r.required ? (
													<span className="ml-1.5 text-amber-700 dark:text-amber-400">
														{t("masterStage.requiredSuffix").trim()}
													</span>
												) : (
													<span className="ml-1.5">{t("masterStage.optionalSuffix")}</span>
												)}
											</div>
										</div>
									</div>

									{filled && (
										<div className="mt-3">
											<MediaGrid
												media={attached}
												onRemove={(assetId) => detach.mutate(assetId)}
												removingId={detach.isPending ? (detach.variables ?? null) : null}
												removeLabel={t("masterStage.removeMedia")}
											/>
										</div>
									)}

									<div className="mt-3">
										<SlotUploader
											accept={r.mediaType === "VIDEO" ? "video/*" : "image/*,video/*"}
											uploading={slotUploading}
											label={filled ? t("masterStage.addAnother") : t("masterStage.uploadForSlot")}
											onFile={(file) => handleFile(file, r.id)}
										/>
									</div>
								</li>
							);
						})}
					</ul>

					<div className="space-y-2">
						<div className="text-xs font-medium text-muted-foreground">
							{t("masterStage.otherPhotos")}
						</div>
						{extraMedia.length > 0 && (
							<MediaGrid
								media={extraMedia}
								onRemove={(assetId) => detach.mutate(assetId)}
								removingId={detach.isPending ? (detach.variables ?? null) : null}
								removeLabel={t("masterStage.removeMedia")}
							/>
						)}
						<SlotUploader
							accept="image/*,video/*"
							uploading={uploadingFor === "extra"}
							label={t("masterStage.addExtra")}
							onFile={(file) => handleFile(file, null)}
						/>
					</div>

					{uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

					<Button
						size="lg"
						onClick={() => submit.mutate(subStageId)}
						disabled={submitDisabled || submit.isPending}
						className="w-full"
					>
						{submit.isPending ? t("masterStage.submitting") : t("masterStage.complete")}
					</Button>
					{isUploadable && missingRequired.length > 0 && (
						<p className="text-xs text-amber-700 dark:text-amber-400">
							{t("masterStage.needSlots", { count: missingRequired.length })}
						</p>
					)}
				</Card>
			)}

			{subStage.status === "SUBMITTED" && (
				<Card className="p-4">
					<p className="text-sm">{t("masterStage.submittedNotice")}</p>
				</Card>
			)}

			{subStage.status === "ACCEPTED" && (
				<Card className="border-emerald-200 bg-emerald-50 p-4">
					<p className="text-sm">{t("masterStage.acceptedNotice")}</p>
				</Card>
			)}
		</section>
	);
}

function SlotUploader({
	label,
	accept,
	uploading,
	onFile,
}: {
	label: string;
	accept: string;
	uploading: boolean;
	onFile: (file: File) => void;
}) {
	return (
		<label
			className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-accent ${
				uploading ? "pointer-events-none opacity-60" : ""
			}`}
		>
			{uploading ? (
				<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
			) : (
				<ImagePlus className="h-4 w-4 text-muted-foreground" />
			)}
			<span className="font-medium">{label}</span>
			<input
				type="file"
				accept={accept}
				capture="environment"
				disabled={uploading}
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) onFile(file);
					e.target.value = "";
				}}
				className="sr-only"
			/>
		</label>
	);
}

function MediaGrid({
	media,
	onRemove,
	removingId,
	removeLabel,
}: {
	media: StageMediaView[];
	onRemove?: (assetId: string) => void;
	removingId?: string | null;
	removeLabel?: string;
}) {
	return (
		<div className="grid grid-cols-3 gap-2">
			{media.map((m) => {
				const isImage = m.contentType.startsWith("image/") && m.url;
				const isRemoving = removingId === m.assetId;
				return (
					<div
						key={m.id}
						className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
					>
						{isImage ? (
							<img src={m.url ?? ""} alt="" className="h-full w-full object-cover" />
						) : (
							<div className="flex h-full items-center justify-center p-2 text-center text-[10px] font-mono text-muted-foreground">
								{m.contentType}
							</div>
						)}
						{onRemove && (
							<button
								type="button"
								onClick={() => onRemove(m.assetId)}
								disabled={isRemoving}
								aria-label={removeLabel}
								className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
							>
								{isRemoving ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Trash2 className="h-3.5 w-3.5" />
								)}
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}
