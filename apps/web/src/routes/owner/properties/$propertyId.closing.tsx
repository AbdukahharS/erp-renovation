import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { uploadToPresignedUrl } from "@/lib/queries/acceptance";
import {
	useCloseProperty,
	usePresignPortfolio,
	usePropertyFinance,
	useReopenProperty,
} from "@/lib/queries/finance";

export const Route = createFileRoute("/owner/properties/$propertyId/closing")({
	component: ClosingFlow,
});

function ClosingFlow() {
	const { t } = useTranslation();
	const { propertyId } = Route.useParams();
	const navigate = useNavigate();
	const { data, isLoading } = usePropertyFinance(propertyId);
	const closeMutation = useCloseProperty(propertyId);
	const reopenMutation = useReopenProperty(propertyId);

	const [materialsChecked, setMaterialsChecked] = useState(false);
	const [clientChecked, setClientChecked] = useState(false);
	const [notes, setNotes] = useState("");
	const [portfolioIds, setPortfolioIds] = useState<string[]>([]);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const presign = usePresignPortfolio(propertyId);

	async function handleFile(file: File) {
		setUploadError(null);
		setUploading(true);
		try {
			const presigned = await presign.mutateAsync(file.type);
			await uploadToPresignedUrl(presigned.uploadUrl, file);
			setPortfolioIds((ids) => [...ids, presigned.assetId]);
		} catch (err) {
			setUploadError((err as Error).message);
		} finally {
			setUploading(false);
		}
	}

	if (isLoading || !data)
		return <p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>;
	const { summary } = data;

	const canClose =
		summary.status === "COMPLETED" && materialsChecked && clientChecked && portfolioIds.length >= 1;

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!canClose) return;
		closeMutation.mutate(
			{
				materialsHandoverChecked: true,
				clientHandoverChecked: true,
				notes: notes.trim() || undefined,
				portfolioAssetIds: portfolioIds,
			},
			{
				onSuccess: () => {
					navigate({
						to: "/owner/properties/$propertyId/finance",
						params: { propertyId },
					});
				},
			},
		);
	}

	if (summary.status === "ARCHIVED") {
		const datePart = summary.closedAt
			? t("closing.archivedOn", { date: new Date(summary.closedAt).toISOString().slice(0, 10) })
			: "";
		return (
			<section className="space-y-4">
				<header>
					<h1 className="text-2xl font-semibold">
						{t("closing.closedTitle", { name: summary.propertyName })}
					</h1>
					<p className="text-sm text-muted-foreground">
						{t("closing.archivedSummary", { date: datePart, profit: summary.netProfit })}
					</p>
				</header>
				<button
					type="button"
					onClick={() => reopenMutation.mutate()}
					disabled={reopenMutation.isPending}
					className="rounded border px-3 py-1.5 text-xs"
				>
					{reopenMutation.isPending ? t("closing.reopening") : t("closing.reopenProperty")}
				</button>
				<div>
					<Link
						to="/owner/properties/$propertyId/finance"
						params={{ propertyId }}
						className="text-xs underline"
					>
						{t("closing.backToFinance")}
					</Link>
				</div>
			</section>
		);
	}

	return (
		<section className="space-y-6">
			<header className="space-y-1">
				<div className="text-xs text-muted-foreground">
					<Link
						to="/owner/properties/$propertyId/finance"
						params={{ propertyId }}
						className="hover:underline"
					>
						{t("closing.backToFinanceArrow")}
					</Link>
				</div>
				<h1 className="text-2xl font-semibold">
					{t("closing.title", { name: summary.propertyName })}
				</h1>
				<p className="text-sm text-muted-foreground">{t("closing.description")}</p>
			</header>

			{summary.status !== "COMPLETED" && (
				<div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
					<Trans
						i18nKey="closing.statusWarning"
						values={{ status: summary.status }}
						components={{ strong: <strong /> }}
					/>
				</div>
			)}

			<form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-4">
				<fieldset className="space-y-2">
					<legend className="text-sm font-semibold">{t("closing.portfolioPhotos")}</legend>
					<p className="text-xs text-muted-foreground">{t("closing.portfolioHelp")}</p>
					<input
						type="file"
						accept="image/jpeg,image/png,image/webp"
						disabled={uploading}
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) handleFile(f);
							e.target.value = "";
						}}
						className="block text-xs"
					/>
					<div className="text-xs text-muted-foreground">
						{t("closing.uploaded", { n: portfolioIds.length })}
					</div>
					{uploadError && <p className="text-xs text-rose-700">{uploadError}</p>}
				</fieldset>
				<fieldset className="space-y-2">
					<legend className="text-sm font-semibold">{t("closing.handoverChecklist")}</legend>
					<label className="flex items-start gap-2 text-sm">
						<input
							type="checkbox"
							checked={materialsChecked}
							onChange={(e) => setMaterialsChecked(e.target.checked)}
							className="mt-1"
						/>
						<span>{t("closing.checkMaterials")}</span>
					</label>
					<label className="flex items-start gap-2 text-sm">
						<input
							type="checkbox"
							checked={clientChecked}
							onChange={(e) => setClientChecked(e.target.checked)}
							className="mt-1"
						/>
						<span>{t("closing.checkClient")}</span>
					</label>
				</fieldset>
				<label className="block text-xs">
					<span className="mb-1 block text-muted-foreground">{t("closing.notesOptional")}</span>
					<textarea
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						rows={3}
						className="w-full rounded border px-2 py-1.5"
					/>
				</label>
				<button
					type="submit"
					disabled={!canClose || closeMutation.isPending}
					className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
				>
					{closeMutation.isPending ? t("closing.closing") : t("closing.closeAndArchive")}
				</button>
				{closeMutation.error && (
					<p className="text-xs text-rose-700">{(closeMutation.error as Error).message}</p>
				)}
			</form>
		</section>
	);
}
