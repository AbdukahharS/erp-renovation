import { Link } from "@tanstack/react-router";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { StageMediaView } from "@/lib/queries/acceptance";
import {
	uploadToPresignedUrl,
	useAcceptStage,
	useAttachInspectorMedia,
	useDetachInspectorMedia,
	useManualOverride,
	usePresignInspectorMedia,
	useRejectStage,
	useStageDetail,
	useSubmitSelfStage,
} from "@/lib/queries/acceptance";
import { useApplyFine, useLatestRejection } from "@/lib/queries/finance";

type Result = { passed: boolean; note: string };

export function InspectorStageReview({ subStageId }: { subStageId: string }) {
	const { t } = useTranslation();
	const { data, isLoading, error } = useStageDetail("inspector", subStageId);
	const presign = usePresignInspectorMedia(subStageId);
	const attach = useAttachInspectorMedia(subStageId);
	const detach = useDetachInspectorMedia(subStageId);
	const submitSelf = useSubmitSelfStage();
	const accept = useAcceptStage();
	const reject = useRejectStage();
	const override = useManualOverride();

	const [results, setResults] = useState<Record<string, Result>>({});
	const [materialsOnSite, setMaterialsOnSite] = useState(false);
	const [rejectMode, setRejectMode] = useState(false);
	const [rejectComment, setRejectComment] = useState("");
	const [defectAssetId, setDefectAssetId] = useState<string | null>(null);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [overrideMode, setOverrideMode] = useState(false);
	const [overrideReason, setOverrideReason] = useState("");
	const [fineAmount, setFineAmount] = useState("");
	const [fineReason, setFineReason] = useState("");
	const latestRejection = useLatestRejection(subStageId);
	const applyFine = useApplyFine(latestRejection.data?.id);

	const items = data?.subStage.checklistItems ?? [];

	const allPass = useMemo(() => {
		if (items.length === 0) return true;
		return items.every((i) => results[i.id]?.passed);
	}, [items, results]);

	if (isLoading || !data)
		return <p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>;
	if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

	const { subStage, stageName, property, media } = data;
	const isInspectorStage = subStage.performerType === "INSPECTOR";
	const canSubmitSelf = isInspectorStage && subStage.status === "AVAILABLE" && media.length > 0;
	const canResolve = subStage.status === "SUBMITTED";
	const beforeMedia = media.filter((m) => m.kind === "BEFORE_PHOTO");
	const otherMedia = media.filter((m) => m.kind !== "BEFORE_PHOTO");

	async function handleFile(file: File, kind: "BEFORE_PHOTO" | "DEFECT_PHOTO") {
		setUploadError(null);
		setUploading(true);
		try {
			const { uploadUrl, assetId } = await presign.mutateAsync({
				kind,
				contentType: file.type,
			});
			await uploadToPresignedUrl(uploadUrl, file);
			await attach.mutateAsync({ assetId, kind });
			if (kind === "DEFECT_PHOTO") setDefectAssetId(assetId);
		} catch (e) {
			setUploadError((e as Error).message);
		} finally {
			setUploading(false);
		}
	}

	function setItemResult(id: string, partial: Partial<Result>) {
		setResults((prev) => ({
			...prev,
			[id]: { passed: false, note: "", ...prev[id], ...partial },
		}));
	}

	return (
		<section className="space-y-5">
			<div className="space-y-1">
				<Link to="/inspector" className="text-xs text-muted-foreground hover:underline">
					{t("inspectorStage.queueBack")}
				</Link>
				<div className="flex items-baseline gap-2">
					<span className="font-mono text-sm text-muted-foreground">{subStage.code}</span>
					<Badge>
						{t(`stageStatus.${subStage.status}`, subStage.status.replace("_", " ").toLowerCase())}
					</Badge>
					<Badge variant="secondary">{subStage.performerType}</Badge>
				</div>
				<h1 className="text-xl font-semibold">{subStage.name}</h1>
				<p className="text-sm text-muted-foreground">
					{property.name} · {stageName}
				</p>
				{subStage.description && (
					<p className="text-sm text-muted-foreground">{subStage.description}</p>
				)}
			</div>

			{/* INSPECTOR-PERFORMED stage (e.g. 1.1) — upload BEFORE_PHOTO + materials toggle, then submit-self */}
			{isInspectorStage && subStage.status === "AVAILABLE" && (
				<Card className="space-y-4 p-4">
					<div>
						<h2 className="text-sm font-semibold">{t("inspectorStage.initialAcceptance")}</h2>
						<p className="mt-1 text-xs text-muted-foreground">{t("inspectorStage.initialDesc")}</p>
					</div>

					<MediaUploader
						label={t("inspectorStage.choosePhotoOrVideo")}
						hint={t("inspectorStage.tapToUpload")}
						accept="image/*,video/*"
						uploading={uploading}
						onFile={(file) => handleFile(file, "BEFORE_PHOTO")}
					/>

					{beforeMedia.length > 0 && (
						<MediaGrid
							media={beforeMedia}
							onRemove={(assetId) => detach.mutate(assetId)}
							removingId={detach.isPending ? (detach.variables ?? null) : null}
							removeLabel={t("inspectorStage.removeMedia")}
						/>
					)}

					<div className="flex items-center gap-2">
						<Switch id="materials" checked={materialsOnSite} onCheckedChange={setMaterialsOnSite} />
						<Label htmlFor="materials">{t("inspectorStage.materialsOnSite")}</Label>
					</div>

					<Button
						size="lg"
						onClick={() => submitSelf.mutate({ id: subStageId, materialsOnSite })}
						disabled={!canSubmitSelf || submitSelf.isPending}
						className="w-full"
					>
						{submitSelf.isPending
							? t("inspectorStage.submitting")
							: t("inspectorStage.submitForAcceptance")}
					</Button>
					{!canSubmitSelf && (
						<p className="text-xs text-muted-foreground">{t("inspectorStage.needPhoto")}</p>
					)}
				</Card>
			)}

			{/* Read-only gallery for non-AVAILABLE inspector stages or master-performed stages,
			    grouped by the requirement slot each asset was uploaded for. */}
			{!(isInspectorStage && subStage.status === "AVAILABLE") &&
				(otherMedia.length > 0 || beforeMedia.length > 0) && (
					<Card className="space-y-4 p-4">
						<div className="flex items-center justify-between">
							<h2 className="text-sm font-semibold">
								{t("inspectorStage.mediaCount", { count: media.length })}
							</h2>
						</div>

						{beforeMedia.length > 0 && (
							<div className="space-y-2">
								<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
									{t("inspectorStage.beforePhotos")}
								</div>
								<MediaGrid media={beforeMedia} />
							</div>
						)}

						{subStage.mediaRequirements.map((r) => {
							const slotMedia = otherMedia.filter((m) => m.requirementId === r.id);
							const filled = slotMedia.length > 0;
							return (
								<div
									key={r.id}
									className={`space-y-2 rounded-lg border p-3 ${
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
											<div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
												<span className="font-mono">{r.mediaType}</span>
												<span>·</span>
												<span className={r.required ? "text-amber-700 dark:text-amber-400" : ""}>
													{r.required
														? t("inspectorStage.requiredLabel")
														: t("inspectorStage.optionalLabel")}
												</span>
												<span>·</span>
												<span>{t("inspectorStage.itemCount", { count: slotMedia.length })}</span>
											</div>
										</div>
									</div>

									{filled ? (
										<MediaGrid media={slotMedia} />
									) : (
										<p className="text-xs italic text-muted-foreground">
											{r.required ? t("inspectorStage.slotMissing") : t("inspectorStage.slotEmpty")}
										</p>
									)}
								</div>
							);
						})}

						{(() => {
							const unlinked = otherMedia.filter((m) => !m.requirementId);
							if (unlinked.length === 0) return null;
							return (
								<div className="space-y-2">
									<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
										{t("inspectorStage.otherMedia", { count: unlinked.length })}
									</div>
									<MediaGrid media={unlinked} />
								</div>
							);
						})()}
					</Card>
				)}

			{/* Checklist + Accept/Reject for SUBMITTED */}
			{canResolve && (
				<Card className="space-y-3 p-4">
					<h2 className="text-sm font-semibold">{t("inspectorStage.checklist")}</h2>
					<ul className="space-y-3">
						{items.map((item) => {
							const r = results[item.id] ?? { passed: false, note: "" };
							return (
								<li key={item.id} className="rounded border p-3">
									<div className="flex items-start justify-between gap-3">
										<div className="space-y-1">
											<div className="text-sm font-medium">{item.text}</div>
											{item.criteria && (
												<div className="text-xs text-muted-foreground">{item.criteria}</div>
											)}
										</div>
										<div className="flex items-center gap-2 whitespace-nowrap">
											<Switch
												id={`item-${item.id}`}
												checked={r.passed}
												onCheckedChange={(v) => setItemResult(item.id, { passed: v })}
											/>
											<Label htmlFor={`item-${item.id}`}>{t("inspectorStage.pass")}</Label>
										</div>
									</div>
									{!r.passed && (
										<Textarea
											placeholder={t("inspectorStage.noteOptional")}
											className="mt-2"
											value={r.note}
											onChange={(e) => setItemResult(item.id, { note: e.target.value })}
										/>
									)}
								</li>
							);
						})}
					</ul>

					{!rejectMode ? (
						<div className="flex gap-2">
							<Button
								size="lg"
								className="flex-1"
								disabled={!allPass || accept.isPending}
								onClick={() =>
									accept.mutate({
										id: subStageId,
										results: items.map((i) => ({
											checklistItemInstanceId: i.id,
											passed: results[i.id]?.passed ?? false,
											note: results[i.id]?.note || null,
										})),
									})
								}
							>
								{accept.isPending ? t("inspectorStage.accepting") : t("inspectorStage.accept")}
							</Button>
							<Button
								size="lg"
								variant="destructive"
								className="flex-1"
								onClick={() => setRejectMode(true)}
							>
								{t("inspectorStage.reject")}
							</Button>
						</div>
					) : (
						<div className="space-y-3 rounded border border-destructive/30 bg-destructive/5 p-3">
							<Label>{t("inspectorStage.defectComment")}</Label>
							<Textarea
								value={rejectComment}
								onChange={(e) => setRejectComment(e.target.value)}
								placeholder={t("inspectorStage.defectCommentPh")}
								rows={3}
							/>
							<Label>{t("inspectorStage.defectPhotoOptional")}</Label>
							<MediaUploader
								label={t("inspectorStage.choosePhoto")}
								hint={t("inspectorStage.tapToUpload")}
								accept="image/*"
								uploading={uploading}
								onFile={(file) => handleFile(file, "DEFECT_PHOTO")}
							/>
							{defectAssetId && (
								<p className="text-xs text-emerald-700">
									{t("inspectorStage.defectPhotoAttached")}
								</p>
							)}
							<div className="flex gap-2">
								<Button
									variant="destructive"
									className="flex-1"
									disabled={rejectComment.trim().length === 0 || reject.isPending}
									onClick={() =>
										reject.mutate({
											id: subStageId,
											comment: rejectComment.trim(),
											defectAssetId,
											results: items.map((i) => ({
												checklistItemInstanceId: i.id,
												passed: results[i.id]?.passed ?? false,
												note: results[i.id]?.note || null,
											})),
										})
									}
								>
									{reject.isPending
										? t("inspectorStage.rejecting")
										: t("inspectorStage.confirmReject")}
								</Button>
								<Button variant="outline" onClick={() => setRejectMode(false)}>
									{t("common.cancel")}
								</Button>
							</div>
						</div>
					)}
				</Card>
			)}

			{/* Manual block/unblock control — distinct from accept/reject */}
			<Card className="space-y-2 p-4">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-semibold">{t("inspectorStage.manualOverride")}</h2>
					<Button size="sm" variant="ghost" onClick={() => setOverrideMode((v) => !v)}>
						{overrideMode ? t("inspectorStage.hide") : t("inspectorStage.open")}
					</Button>
				</div>
				{overrideMode && (
					<div className="space-y-2">
						<Label>{t("inspectorStage.overrideReason")}</Label>
						<Textarea
							rows={2}
							value={overrideReason}
							onChange={(e) => setOverrideReason(e.target.value)}
							placeholder={t("inspectorStage.overrideReasonPh")}
						/>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								disabled={overrideReason.trim().length === 0 || override.isPending}
								onClick={() =>
									override.mutate({
										id: subStageId,
										action: "BLOCK",
										reason: overrideReason.trim(),
									})
								}
							>
								{t("inspectorStage.block")}
							</Button>
							<Button
								variant="outline"
								disabled={overrideReason.trim().length === 0 || override.isPending}
								onClick={() =>
									override.mutate({
										id: subStageId,
										action: "UNBLOCK",
										reason: overrideReason.trim(),
									})
								}
							>
								{t("inspectorStage.unblock")}
							</Button>
							<Button
								variant="destructive"
								disabled={overrideReason.trim().length === 0 || override.isPending}
								onClick={() =>
									override.mutate({
										id: subStageId,
										action: "FORCE_UNBLOCK",
										reason: overrideReason.trim(),
									})
								}
							>
								{t("inspectorStage.forceUnblock")}
							</Button>
						</div>
					</div>
				)}
			</Card>

			{/* Apply fine — only when the stage has a recent rejection and it
			    hasn't been fined yet. TZ §2 Inspector right; deducts from master
			    balance via the single financial-transactions ledger. */}
			{latestRejection.data && !latestRejection.data.fined && (
				<Card className="space-y-3 p-4">
					<div>
						<h2 className="text-sm font-semibold">{t("inspectorStage.applyFineTitle")}</h2>
						<p className="text-xs text-muted-foreground">
							{t("inspectorStage.rejectionOn", {
								date: new Date(latestRejection.data.rejectedAt).toISOString().slice(0, 10),
								comment: latestRejection.data.comment,
							})}
						</p>
					</div>
					<div className="grid gap-2 sm:grid-cols-2">
						<div className="space-y-1">
							<Label>{t("inspectorStage.amountUsd")}</Label>
							<input
								value={fineAmount}
								onChange={(e) => setFineAmount(e.target.value)}
								placeholder="0.00"
								pattern="^\d+(\.\d{1,2})?$"
								className="w-full rounded border px-2 py-1.5 font-mono text-sm"
							/>
						</div>
						<div className="space-y-1">
							<Label>{t("inspectorStage.reason")}</Label>
							<input
								value={fineReason}
								onChange={(e) => setFineReason(e.target.value)}
								className="w-full rounded border px-2 py-1.5 text-sm"
							/>
						</div>
					</div>
					<Button
						variant="destructive"
						disabled={!fineAmount.trim() || !fineReason.trim() || applyFine.isPending}
						onClick={() =>
							applyFine.mutate(
								{ amount: fineAmount.trim(), reason: fineReason.trim() },
								{
									onSuccess: () => {
										setFineAmount("");
										setFineReason("");
									},
								},
							)
						}
					>
						{applyFine.isPending ? t("inspectorStage.applying") : t("inspectorStage.applyFine")}
					</Button>
					{applyFine.error && (
						<p className="text-xs text-destructive">{(applyFine.error as Error).message}</p>
					)}
				</Card>
			)}
			{latestRejection.data?.fined && (
				<p className="text-xs text-muted-foreground">{t("inspectorStage.fineAlreadyApplied")}</p>
			)}

			{uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
		</section>
	);
}

function MediaUploader({
	label,
	hint,
	accept,
	uploading,
	onFile,
}: {
	label: string;
	hint: string;
	accept: string;
	uploading: boolean;
	onFile: (file: File) => void;
}) {
	return (
		<label
			className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-center transition-colors hover:bg-muted/60 ${
				uploading ? "pointer-events-none opacity-60" : ""
			}`}
		>
			{uploading ? (
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			) : (
				<ImagePlus className="h-6 w-6 text-muted-foreground" />
			)}
			<div className="space-y-0.5">
				<div className="text-sm font-medium">{label}</div>
				<div className="text-xs text-muted-foreground">{hint}</div>
			</div>
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
