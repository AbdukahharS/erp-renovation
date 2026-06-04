import { createFileRoute, Link } from "@tanstack/react-router";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
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
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);

	if (isLoading || !data)
		return <p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>;
	if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

	const { subStage, stageName, property, assignment, media } = data;
	const requiredCount = subStage.mediaRequirements.filter((r) => r.required).length;
	const hasMedia = media.length > 0;
	const submitDisabled = subStage.status !== "IN_PROGRESS" || (requiredCount > 0 && !hasMedia);

	async function handleFile(file: File) {
		setUploadError(null);
		setUploading(true);
		try {
			const mediaType: "PHOTO" | "VIDEO" = file.type.startsWith("video/") ? "VIDEO" : "PHOTO";
			const { uploadUrl, assetId } = await presign.mutateAsync({
				mediaType,
				contentType: file.type,
			});
			await uploadToPresignedUrl(uploadUrl, file);
			await attach.mutateAsync(assetId);
		} catch (e) {
			setUploadError((e as Error).message);
		} finally {
			setUploading(false);
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
					<Badge>
						{t(`stageStatus.${subStage.status}`, subStage.status.replace("_", " ").toLowerCase())}
					</Badge>
				</div>
				<h1 className="text-xl font-semibold">{subStage.name}</h1>
				<p className="text-sm text-muted-foreground">
					{property.name} · {stageName}
				</p>
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

			{(subStage.status === "IN_PROGRESS" || subStage.status === "REJECTED") && (
				<Card className="space-y-4 p-4">
					<div>
						<h2 className="text-sm font-semibold">{t("masterStage.requiredPhotos")}</h2>
						<ul className="mt-2 space-y-1 text-sm text-muted-foreground">
							{subStage.mediaRequirements.map((r) => (
								<li key={r.id} className="flex items-start gap-2">
									<span
										className={`mt-1 inline-block h-1.5 w-1.5 rounded-full ${r.required ? "bg-amber-500" : "bg-zinc-300"}`}
									/>
									<span>
										{r.description} <span className="text-xs">({r.mediaType})</span>
										{r.required && (
											<span className="text-xs">{t("masterStage.requiredSuffix")}</span>
										)}
									</span>
								</li>
							))}
						</ul>
					</div>

					<MediaUploader
						label={t("masterStage.choosePhotoOrVideo")}
						hint={t("masterStage.tapToUpload")}
						accept="image/*,video/*"
						uploading={uploading}
						onFile={handleFile}
					/>

					{media.length > 0 && (
						<div className="space-y-2">
							<div className="text-xs font-medium text-muted-foreground">
								{t("masterStage.uploadedCount", { count: media.length })}
							</div>
							<MediaGrid
								media={media}
								onRemove={(assetId) => detach.mutate(assetId)}
								removingId={detach.isPending ? (detach.variables ?? null) : null}
								removeLabel={t("masterStage.removeMedia")}
							/>
						</div>
					)}

					{uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

					<Button
						size="lg"
						onClick={() => submit.mutate(subStageId)}
						disabled={submitDisabled || submit.isPending}
						className="w-full"
					>
						{submit.isPending ? t("masterStage.submitting") : t("masterStage.complete")}
					</Button>
					{submitDisabled && requiredCount > 0 && !hasMedia && (
						<p className="text-xs text-muted-foreground">{t("masterStage.needPhoto")}</p>
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
