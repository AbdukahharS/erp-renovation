import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { adminFetch } from "@/lib/admin-fetch";

export const Route = createFileRoute("/_admin/tenants/$tenantId/masters/$masterId")({
	staticData: { crumbKey: "crumbs.detail" },
	component: MasterDetailPage,
});

// ── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
	subStageInstanceId: string;
	propertyId: string;
	propertyName: string;
	subStageName: string;
	status: string;
	claimedAt: string;
	releasedAt: string | null;
}

interface Transaction {
	id: string;
	type: string;
	amount: string;
	description: string | null;
	propertyId: string | null;
	createdAt: string;
}

interface MasterDetail {
	profile: {
		id: string;
		userId: string;
		displayName: string;
		email: string | null;
		phone: string | null;
		specializations: string[];
		isExternalContractor: boolean;
		createdAt: string;
	};
	rating: { acceptedCount: number; rejectedCount: number; avgDurationRatio: string | null } | null;
	balance: string;
	recentAssignments: Assignment[];
	transactions: Transaction[];
	wagesCredited: string;
	finesDeducted: string;
	payoutsSettled: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

function MasterDetailPage() {
	const { t } = useTranslation();
	const { tenantId, masterId } = Route.useParams();

	const { data, isLoading, error } = useQuery<MasterDetail>({
		queryKey: ["admin-tenant-master", tenantId, masterId],
		queryFn: () => adminFetch(`/admin/tenants/${tenantId}/masters/${masterId}`),
	});

	if (isLoading) return <LoadingSkeleton />;

	if (error || !data) {
		return (
			<div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
				{(error as Error)?.message ?? t("common.error")}
			</div>
		);
	}

	const { profile, rating, balance, recentAssignments, transactions } = data;
	const fmt = (v: string) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 });
	const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString() : t("common.em"));

	return (
		<div className="space-y-6">
			<PageHeader
				title={profile.displayName}
				description={
					profile.email ? (
						<span className="text-xs text-muted-foreground">{profile.email}</span>
					) : undefined
				}
				actions={
					<Button
						variant="outline"
						size="sm"
						render={<Link to="/tenants/$tenantId" params={{ tenantId }} />}
					>
						<ArrowLeftIcon className="mr-1 size-3.5" />
						{t("tenants.masterDetail.backToTenant")}
					</Button>
				}
			/>

			{/* ── Profile ────────────────────────────────────────── */}
			<Section title={t("tenants.masterDetail.profile")}>
				<dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 text-sm">
					<ConfigItem
						label={t("tenants.detail.phone")}
						value={profile.phone ?? t("masters.noPhone")}
					/>
					<ConfigItem label={t("tenants.masterDetail.specializations")}>
						{profile.specializations.length === 0 ? (
							<span className="text-muted-foreground">{t("masters.noSpecs")}</span>
						) : (
							<div className="flex flex-wrap gap-1">
								{profile.specializations.map((s) => (
									<Badge key={s} variant="outline" className="text-[10px]">
										{t(`specializations.${s}`, s)}
									</Badge>
								))}
							</div>
						)}
					</ConfigItem>
					<ConfigItem label={t("tenants.masterDetail.balance")} value={fmt(balance)} />
					<ConfigItem
						label={t("tenants.masterDetail.rating")}
						value={
							rating
								? t("tenants.masterDetail.acceptedRejected", {
										accepted: rating.acceptedCount,
										rejected: rating.rejectedCount,
									})
								: t("masters.noActivity")
						}
					/>
				</dl>
			</Section>

			{/* ── Earn history ───────────────────────────────────── */}
			<Section title={t("tenants.masterDetail.earnHistory")}>
				<div className="mb-3 flex flex-wrap gap-2">
					<StatChip
						label={t("tenants.masterDetail.wagesCredited")}
						value={fmt(data.wagesCredited)}
					/>
					<StatChip
						label={t("tenants.masterDetail.finesDeducted")}
						value={fmt(data.finesDeducted)}
					/>
					<StatChip
						label={t("tenants.masterDetail.payoutsSettled")}
						value={fmt(data.payoutsSettled)}
					/>
				</div>
				{transactions.length === 0 ? (
					<EmptyNote text={t("tenants.masterDetail.noEarnHistory")} />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("tenants.masterDetail.txType")}</TableHead>
								<TableHead className="text-right">{t("tenants.masterDetail.amount")}</TableHead>
								<TableHead>{t("tenants.masterDetail.date")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{transactions.map((txn) => (
								<TableRow key={txn.id}>
									<TableCell>
										<Badge variant="outline" className="text-[10px]">
											{txn.type.replace(/_/g, " ").toLowerCase()}
										</Badge>
									</TableCell>
									<TableCell className="text-right tabular-nums">{fmt(txn.amount)}</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{fmtDate(txn.createdAt)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Section>

			{/* ── Work history ───────────────────────────────────── */}
			<Section title={t("tenants.masterDetail.workHistory")}>
				{recentAssignments.length === 0 ? (
					<EmptyNote text={t("tenants.masterDetail.noWorkHistory")} />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("tenants.masterDetail.property")}</TableHead>
								<TableHead>{t("tenants.masterDetail.subStage")}</TableHead>
								<TableHead>{t("tenants.masterDetail.status")}</TableHead>
								<TableHead>{t("tenants.masterDetail.claimedAt")}</TableHead>
								<TableHead>{t("tenants.masterDetail.releasedAt")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{recentAssignments.map((a) => (
								<TableRow key={a.subStageInstanceId}>
									<TableCell className="font-medium">{a.propertyName}</TableCell>
									<TableCell className="text-sm">{a.subStageName}</TableCell>
									<TableCell>
										<Badge variant="outline" className="text-[10px]">
											{t(`stageStatus.${a.status}`, a.status)}
										</Badge>
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{fmtDate(a.claimedAt)}
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{fmtDate(a.releasedAt)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Section>
		</div>
	);
}

// ── Small sub-components ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="rounded-lg border bg-card">
			<div className="border-b px-4 py-3">
				<h2 className="text-sm font-semibold">{title}</h2>
			</div>
			<div className="p-4">{children}</div>
		</div>
	);
}

function ConfigItem({
	label,
	value,
	children,
}: {
	label: string;
	value?: string;
	children?: React.ReactNode;
}) {
	return (
		<div>
			<dt className="text-[11px] text-muted-foreground mb-0.5">{label}</dt>
			<dd className="font-medium">{children ?? value}</dd>
		</div>
	);
}

function StatChip({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="rounded-md border bg-muted/30 px-3 py-2 text-center min-w-[7rem]">
			<div className="text-[11px] text-muted-foreground">{label}</div>
			<div className="text-sm font-semibold tabular-nums">{value}</div>
		</div>
	);
}

function EmptyNote({ text }: { text: string }) {
	return (
		<div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
			<UserIcon className="size-4 shrink-0" />
			{text}
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-16 w-full" />
			{[1, 2, 3].map((i) => (
				<div key={i} className="rounded-lg border bg-card">
					<div className="border-b px-4 py-3">
						<Skeleton className="h-4 w-32" />
					</div>
					<div className="p-4 space-y-2">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-3/4" />
					</div>
				</div>
			))}
		</div>
	);
}
