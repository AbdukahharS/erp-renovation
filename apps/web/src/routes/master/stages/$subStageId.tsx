import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	uploadToPresignedUrl,
	useAttachStageMedia,
	usePresignStageMedia,
	useStageDetail,
	useSubmitStage,
	useTakeStage,
} from "@/lib/queries/acceptance";

export const Route = createFileRoute("/master/stages/$subStageId")({
	component: MasterStageDetail,
});

function MasterStageDetail() {
	const { subStageId } = Route.useParams();
	const { data, isLoading, error } = useStageDetail("master", subStageId);
	const take = useTakeStage();
	const presign = usePresignStageMedia(subStageId);
	const attach = useAttachStageMedia(subStageId);
	const submit = useSubmitStage();
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);

	if (isLoading || !data) return <p className="text-sm text-muted-foreground">loading…</p>;
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
					← Back
				</Link>
				<div className="flex items-baseline gap-2">
					<span className="font-mono text-sm text-muted-foreground">{subStage.code}</span>
					<Badge>{subStage.status}</Badge>
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
					{take.isPending ? "Claiming…" : "Take into Work"}
				</Button>
			)}

			{(subStage.status === "IN_PROGRESS" || subStage.status === "REJECTED") && (
				<>
					<Card className="space-y-3 p-4">
						<h2 className="text-sm font-semibold">Required photos</h2>
						<ul className="space-y-1 text-sm text-muted-foreground">
							{subStage.mediaRequirements.map((r) => (
								<li key={r.id} className="flex items-start gap-2">
									<span
										className={`mt-1 inline-block h-1.5 w-1.5 rounded-full ${r.required ? "bg-amber-500" : "bg-zinc-300"}`}
									/>
									<span>
										{r.description} <span className="text-xs">({r.mediaType})</span>
										{r.required && <span className="text-xs"> — required</span>}
									</span>
								</li>
							))}
						</ul>
						<label className="block">
							<span className="sr-only">Take a photo</span>
							<input
								type="file"
								accept="image/*,video/*"
								capture="environment"
								disabled={uploading}
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) handleFile(file);
									e.target.value = "";
								}}
								className="block w-full text-sm"
							/>
						</label>
						{uploading && <p className="text-sm">Uploading…</p>}
						{uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
					</Card>

					{media.length > 0 && (
						<Card className="space-y-2 p-4">
							<h2 className="text-sm font-semibold">Uploaded ({media.length})</h2>
							<div className="grid grid-cols-3 gap-2">
								{media.map((m) =>
									m.contentType.startsWith("image/") && m.url ? (
										<img
											key={m.id}
											src={m.url}
											alt=""
											className="aspect-square w-full rounded object-cover"
										/>
									) : (
										<div
											key={m.id}
											className="aspect-square rounded bg-muted text-center text-xs leading-tight"
										>
											<div className="p-2 font-mono">{m.contentType}</div>
										</div>
									),
								)}
							</div>
						</Card>
					)}

					<Button
						size="lg"
						onClick={() => submit.mutate(subStageId)}
						disabled={submitDisabled || submit.isPending}
						className="w-full"
					>
						{submit.isPending ? "Submitting…" : "Complete"}
					</Button>
					{submitDisabled && requiredCount > 0 && !hasMedia && (
						<p className="text-xs text-muted-foreground">
							Upload at least one photo to enable Complete.
						</p>
					)}
				</>
			)}

			{subStage.status === "SUBMITTED" && (
				<Card className="p-4">
					<p className="text-sm">Submitted for acceptance. Waiting for inspector review.</p>
				</Card>
			)}

			{subStage.status === "ACCEPTED" && (
				<Card className="border-emerald-200 bg-emerald-50 p-4">
					<p className="text-sm">Accepted. Wage credited.</p>
				</Card>
			)}
		</section>
	);
}
