import { createFileRoute, Link } from "@tanstack/react-router";
import { ArchiveIcon, ArchiveRestoreIcon, WalletIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format-money";
import { formatNumber } from "@/lib/format-number";
import {
	ArchiveActiveWorkError,
	type ArchiveBlocker,
	useArchiveProperty,
	useProperty,
	useUnarchiveProperty,
} from "@/lib/queries/properties";
import { useCurrencyCode } from "@/lib/queries/tenant-config";

export const Route = createFileRoute("/owner/properties/$propertyId/")({
	staticData: { crumbKey: "crumbs.detail" },
	component: PropertyDetail,
});

const STATUS_BADGE: Record<string, string> = {
	PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
	READY_FOR_PRODUCTION: "bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
	IN_PROGRESS: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
	COMPLETED: "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
	ARCHIVED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
};

const COLUMN_ORDER = [
	"LOCKED",
	"AVAILABLE",
	"IN_PROGRESS",
	"SUBMITTED",
	"ACCEPTED",
	"REJECTED",
] as const;

const COLUMN_STYLE: Record<string, string> = {
	LOCKED: "bg-zinc-50 border-zinc-200 dark:bg-zinc-900/40 dark:border-zinc-800",
	AVAILABLE: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/60",
	IN_PROGRESS: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/60",
	SUBMITTED: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/60",
	ACCEPTED: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/60",
	REJECTED: "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/60",
};

function PropertyDetail() {
	const { t } = useTranslation();
	const { propertyId } = Route.useParams();
	const { data, isLoading } = useProperty(propertyId);
	const currency = useCurrencyCode();
	const archive = useArchiveProperty(propertyId);
	const unarchive = useUnarchiveProperty(propertyId);
	const [archiveOpen, setArchiveOpen] = useState(false);
	const [unarchiveOpen, setUnarchiveOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [blockers, setBlockers] = useState<ArchiveBlocker[] | null>(null);

	if (isLoading || !data)
		return <p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>;

	const canManualArchive =
		data.status === "PENDING" ||
		data.status === "READY_FOR_PRODUCTION" ||
		data.status === "IN_PROGRESS";
	const isManualArchive = data.status === "ARCHIVED" && data.archivedAt !== null;

	const submitArchive = async (e: React.FormEvent) => {
		e.preventDefault();
		setBlockers(null);
		try {
			await archive.mutateAsync(reason.trim());
			setArchiveOpen(false);
			setReason("");
		} catch (err) {
			if (err instanceof ArchiveActiveWorkError) {
				setBlockers(err.blockers);
			}
		}
	};

	const allSubStages = data.stages.flatMap((s) => s.subStages);
	const byStatus = new Map<string, typeof allSubStages>();
	for (const ss of allSubStages) {
		const arr = byStatus.get(ss.status) ?? [];
		arr.push(ss);
		byStatus.set(ss.status, arr);
	}

	const layoutLabel =
		data.layoutType === "NEW_BUILD"
			? t("propertyDetail.layoutNewBuild")
			: t("propertyDetail.layoutSecondary");

	return (
		<section className="space-y-6">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Link to="/owner/properties" className="hover:underline">
							{t("propertyDetail.backToProperties")}
						</Link>
						<span>/</span>
					</div>
					<h1 className="text-2xl font-semibold">{data.name}</h1>
					<p className="text-sm text-muted-foreground">{data.address}</p>
					<div className="flex flex-wrap items-center gap-2 pt-1">
						<span
							className={`rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[data.status] ?? ""}`}
						>
							{t(`propertyStatus.${data.status}`, data.status)}
						</span>
						<span className="text-xs text-muted-foreground">
							{t("propertyDetail.metaLine", {
								layout: layoutLabel,
								area: formatNumber(data.areaSqm),
								cost: formatMoney(data.plannedUnitCost, currency),
							})}
						</span>
					</div>
				</div>
				<div className="flex flex-col items-end gap-2">
					<Link
						to="/owner/properties/$propertyId/finance"
						params={{ propertyId }}
						className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
					>
						<WalletIcon className="size-3.5" />
						{t("propertyDetail.openFinance", "Finance & materials")}
					</Link>
					{canManualArchive && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 text-xs"
							onClick={() => {
								setBlockers(null);
								setReason("");
								setArchiveOpen(true);
							}}
						>
							<ArchiveIcon className="size-3.5" />
							{t("propertyDetail.archive")}
						</Button>
					)}
					{isManualArchive && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 text-xs"
							disabled={unarchive.isPending}
							onClick={() => setUnarchiveOpen(true)}
						>
							<ArchiveRestoreIcon className="size-3.5" />
							{unarchive.isPending
								? t("propertyDetail.unarchiving")
								: t("propertyDetail.unarchive")}
						</Button>
					)}
					{data.floorPlanAsset && (
						<div className="text-xs text-muted-foreground">
							<div>{t("propertyDetail.floorPlanAttached")}</div>
							<div className="font-mono">{data.floorPlanAsset.contentType}</div>
						</div>
					)}
				</div>
			</header>

			{isManualArchive && data.archiveReason && data.archivedAt && (
				<div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
					{t("propertyDetail.archivedBanner", {
						date: new Date(data.archivedAt).toLocaleDateString(),
						reason: data.archiveReason,
					})}
				</div>
			)}

			<Dialog
				open={archiveOpen}
				onOpenChange={(o) => {
					setArchiveOpen(o);
					if (!o) {
						setReason("");
						setBlockers(null);
					}
				}}
			>
				<DialogContent>
					<form onSubmit={submitArchive}>
						<DialogHeader>
							<DialogTitle>{t("propertyDetail.archiveDialogTitle")}</DialogTitle>
							<DialogDescription>{t("propertyDetail.archiveDialogDesc")}</DialogDescription>
						</DialogHeader>
						<div className="my-4 space-y-2">
							<label htmlFor="archive-reason" className="text-sm font-medium">
								{t("propertyDetail.archiveReasonLabel")}
							</label>
							<textarea
								id="archive-reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder={t("propertyDetail.archiveReasonPlaceholder")}
								rows={3}
								required
								maxLength={500}
								className="w-full rounded-md border bg-background px-3 py-2 text-sm"
								autoFocus
							/>
							{blockers && blockers.length > 0 && (
								<div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
									<div className="font-medium">{t("propertyDetail.archiveBlockedTitle")}</div>
									<div className="mt-1">{t("propertyDetail.archiveBlockedDesc")}</div>
									<ul className="mt-1 list-disc pl-4">
										{blockers.map((b) => (
											<li key={b.code}>
												<span className="font-mono">{b.code}</span> — {b.name}
											</li>
										))}
									</ul>
								</div>
							)}
						</div>
						<DialogFooter>
							<Button type="button" variant="ghost" onClick={() => setArchiveOpen(false)}>
								{t("common.cancel")}
							</Button>
							<Button type="submit" disabled={!reason.trim() || archive.isPending}>
								{archive.isPending
									? t("propertyDetail.archiving")
									: t("propertyDetail.archiveConfirm")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<AlertDialog open={unarchiveOpen} onOpenChange={setUnarchiveOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("propertyDetail.unarchive")}</AlertDialogTitle>
						<AlertDialogDescription>{t("propertyDetail.unarchiveConfirm")}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<Button variant="outline" onClick={() => setUnarchiveOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button
							disabled={unarchive.isPending}
							onClick={() =>
								unarchive.mutate(undefined, {
									onSuccess: () => setUnarchiveOpen(false),
								})
							}
						>
							{unarchive.isPending
								? t("propertyDetail.unarchiving")
								: t("propertyDetail.unarchive")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{data.status === "PENDING" && (
				<div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">
					{t("propertyDetail.awaitingInspector")}
				</div>
			)}

			<div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
				{COLUMN_ORDER.map((status) => {
					const items = byStatus.get(status) ?? [];
					return (
						<div key={status} className={`rounded-lg border p-2 ${COLUMN_STYLE[status] ?? ""}`}>
							<div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								<span>{t(`stageStatus.${status}`, status.replace("_", " "))}</span>
								<span>{items.length}</span>
							</div>
							<div className="space-y-2">
								{items.map((ss) => (
									<div key={ss.id} className="rounded-md border bg-card p-2 text-xs shadow-sm">
										<div className="flex items-baseline justify-between gap-2">
											<span className="font-mono text-[10px] text-muted-foreground">{ss.code}</span>
											<span
												className={`rounded px-1.5 py-0.5 text-[10px] ${ss.performerType === "INSPECTOR" ? "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200" : "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"}`}
											>
												{t(`role.${ss.performerType.toLowerCase()}`, ss.performerType)}
											</span>
										</div>
										<div className="mt-1 leading-tight">{ss.name}</div>
										{ss.performerType === "MASTER" && Number(ss.wageAmount) > 0 && (
											<div className="mt-1 text-[11px] text-muted-foreground">
												{t("propertyDetail.wageLabel", { amount: ss.wageAmount })}
											</div>
										)}
										{ss.specialization && (
											<div className="text-[11px] text-muted-foreground">
												{t(`specializations.${ss.specialization}`)}
											</div>
										)}
									</div>
								))}
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}
