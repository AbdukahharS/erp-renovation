import type { Role } from "@repo/validators";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDownIcon, CopyIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { type Column, DataTable } from "@/components/layout/data-table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-number";
import i18n from "@/lib/i18n";
import {
	type MasterRosterRow,
	useCreateInvitation,
	useInvitations,
	useMasters,
	useRevokeInvitation,
} from "@/lib/queries/hr";

export const Route = createFileRoute("/owner/masters/")({
	staticData: { crumbKey: "nav.masters" },
	component: OwnerMasters,
});

function inviteUrl(token: string) {
	return `${window.location.origin}/invite/${token}`;
}

function copy(text: string) {
	navigator.clipboard?.writeText(text);
	toast.success(i18n.t("common.copied"));
}

function initialsOf(name: string) {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase())
		.join("");
}

function OwnerMasters() {
	const { t } = useTranslation();
	const invitations = useInvitations();
	const masters = useMasters();
	const revoke = useRevokeInvitation();

	return (
		<div className="space-y-6">
			<PageHeader
				title={t("masters.title")}
				description={t("masters.description")}
				actions={<InviteDialog />}
			/>

			<section className="space-y-2">
				<h2 className="text-sm font-semibold">{t("masters.roster")}</h2>
				{masters.isLoading ? (
					<div className="space-y-2 rounded-lg border bg-card p-4">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				) : (
					<RosterTable rows={masters.data ?? []} />
				)}
			</section>

			{(() => {
				const all = invitations.data ?? [];
				const withStatus = all.map((inv) => {
					const expired = new Date(inv.expiresAt).getTime() <= Date.now();
					const status: "PENDING" | "CONSUMED" | "EXPIRED" = inv.consumedAt
						? "CONSUMED"
						: expired
							? "EXPIRED"
							: "PENDING";
					return { inv, status };
				});
				const pending = withStatus.filter((x) => x.status === "PENDING");
				const history = withStatus.filter((x) => x.status !== "PENDING");

				const renderRow = ({ inv, status }: (typeof withStatus)[number]) => (
					<div
						key={inv.token}
						className="grid items-center gap-3 border-b px-3 py-2 last:border-b-0 md:grid-cols-[auto_1fr_auto_auto_auto]"
					>
						<Badge variant="outline">{t(`role.${inv.role.toLowerCase()}`, inv.role)}</Badge>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<span>{inv.email ?? t("masters.anyEmail")}</span>
							{status === "PENDING" && (
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-1.5 text-xs"
									onClick={() => copy(inviteUrl(inv.token))}
								>
									<CopyIcon className="mr-1 size-3" /> {t("masters.copyLink")}
								</Button>
							)}
						</div>
						<div className="text-xs">{new Date(inv.expiresAt).toLocaleString()}</div>
						<Badge variant={status === "PENDING" ? "default" : "secondary"}>
							{t(`masters.invitationStatus.${status}`, status)}
						</Badge>
						<Button
							size="sm"
							variant="outline"
							disabled={status !== "PENDING"}
							onClick={() => revoke.mutate(inv.token)}
						>
							<Trash2Icon className="size-3.5" />
						</Button>
					</div>
				);

				return (
					<>
						<section className="space-y-2">
							<h2 className="text-sm font-semibold">{t("masters.pendingInvitations")}</h2>
							{invitations.isLoading ? (
								<Skeleton className="h-16 w-full" />
							) : pending.length === 0 ? (
								<EmptyState
									title={t("masters.noInvitations")}
									description={t("masters.noInvitationsDesc")}
								/>
							) : (
								<div className="rounded-lg border bg-card">{pending.map(renderRow)}</div>
							)}
						</section>

						{history.length > 0 && (
							<Collapsible className="space-y-2">
								<CollapsibleTrigger className="group/trigger flex w-full items-center justify-between rounded-md border border-transparent px-1 py-1 text-sm font-semibold hover:bg-muted/40">
									<span>
										{t("masters.invitationHistory")}{" "}
										<span className="text-muted-foreground font-normal">({history.length})</span>
									</span>
									<ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/trigger:rotate-180" />
								</CollapsibleTrigger>
								<CollapsibleContent>
									<div className="rounded-lg border bg-card">{history.map(renderRow)}</div>
								</CollapsibleContent>
							</Collapsible>
						)}
					</>
				);
			})()}
		</div>
	);
}

function RosterTable({ rows }: { rows: MasterRosterRow[] }) {
	const { t } = useTranslation();

	const columns: Column<MasterRosterRow>[] = [
		{
			key: "name",
			header: t("masters.columns.name"),
			cell: (m) => (
				<div className="flex items-center gap-3">
					<Avatar className="size-9">
						<AvatarFallback>{initialsOf(m.displayName)}</AvatarFallback>
					</Avatar>
					<div className="space-y-0.5">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium">{m.displayName}</span>
							<Badge variant="secondary" className="text-[10px]">
								{t(`role.${m.role.toLowerCase()}`, m.role)}
							</Badge>
						</div>
						<div className="text-xs text-muted-foreground">{m.phone ?? t("masters.noPhone")}</div>
					</div>
				</div>
			),
		},
		{
			key: "specializations",
			header: t("masters.columns.specializations"),
			cell: (m) => {
				if (m.role !== "MASTER") {
					return <span className="text-xs text-muted-foreground">{t("common.em")}</span>;
				}
				if (m.specializations.length === 0) {
					return <span className="text-xs text-muted-foreground">{t("masters.noSpecs")}</span>;
				}
				return (
					<div className="flex flex-wrap gap-1">
						{m.specializations.map((s) => (
							<Badge key={s} variant="outline" className="text-[10px]">
								{t(`specializations.${s}`)}
							</Badge>
						))}
					</div>
				);
			},
		},
		{
			key: "rating",
			header: t("masters.columns.rating"),
			cell: (m) => {
				if (m.role !== "MASTER") {
					return <span className="text-xs text-muted-foreground">{t("common.em")}</span>;
				}
				if (!m.rating) {
					return <span className="text-xs text-muted-foreground">{t("masters.noActivity")}</span>;
				}
				return (
					<div className="text-xs">
						<div>
							{t("masters.acceptedRejected", {
								accepted: m.rating.acceptedCount,
								rejected: m.rating.rejectedCount,
							})}
						</div>
						<div className="text-muted-foreground">
							{t("masters.avgRatio", {
								value: m.rating.avgDurationRatio
									? formatNumber(m.rating.avgDurationRatio, { maxDecimals: 2 })
									: t("common.em"),
							})}
						</div>
					</div>
				);
			},
		},
		{
			key: "availability",
			header: t("masters.columns.availability"),
			cell: (m) => (
				<div className="text-xs">
					<div className="font-medium">
						{t(`masters.availabilityState.${m.availability.state}`, m.availability.state)}
					</div>
					{m.availability.detail ? (
						<div className="text-muted-foreground">{m.availability.detail}</div>
					) : null}
					{m.availability.until ? (
						<div className="text-muted-foreground">
							{t("masters.until", {
								date: new Date(m.availability.until).toLocaleDateString(),
							})}
						</div>
					) : null}
				</div>
			),
		},
		{
			key: "actions",
			header: "",
			headerClassName: "w-px",
			className: "text-right",
			cell: (m) =>
				m.role === "MASTER" ? (
					<Button
						size="sm"
						variant="outline"
						nativeButton={false}
						render={<Link to="/owner/masters/$id" params={{ id: m.id }} />}
					>
						{t("masters.open")}
					</Button>
				) : null,
		},
	];

	return (
		<DataTable
			columns={columns}
			rows={rows}
			rowKey={(r) => r.id}
			empty={
				<EmptyState
					icon={UsersIcon}
					title={t("masters.noMasters")}
					description={t("masters.noMastersDesc")}
				/>
			}
		/>
	);
}

function InviteDialog() {
	const { t } = useTranslation();
	const create = useCreateInvitation();
	const [open, setOpen] = useState(false);
	const [role, setRole] = useState<Role>("MASTER");
	const [email, setEmail] = useState("");
	const [days, setDays] = useState(14);
	const [lastLink, setLastLink] = useState<string | null>(null);

	function reset() {
		setRole("MASTER");
		setEmail("");
		setDays(14);
		setLastLink(null);
	}

	function submit(e: React.FormEvent) {
		e.preventDefault();
		create.mutate(
			{ role, email: email.trim() || undefined, expiresInDays: days },
			{
				onSuccess: (row) => {
					setLastLink(inviteUrl(row.token));
					setEmail("");
					toast.success(t("masters.invitationCreated"));
				},
				onError: (e) => toast.error((e as Error).message),
			},
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) reset();
			}}
		>
			<DialogTrigger
				render={
					<Button>
						<UserPlusIcon className="mr-1 size-4" />
						{t("masters.inviteMember")}
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={submit}>
					<DialogHeader>
						<DialogTitle>{t("masters.newInvitation")}</DialogTitle>
						<DialogDescription>{t("masters.createInvitationDesc")}</DialogDescription>
					</DialogHeader>
					<div className="my-4 space-y-3">
						<div className="space-y-1.5">
							<Label>{t("masters.role")}</Label>
							<Select value={role} onValueChange={(v) => setRole(v as Role)}>
								<SelectTrigger className="w-full">
									<SelectValue>
										{(v) => (v ? t(`role.${String(v).toLowerCase()}`, String(v)) : "")}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="MASTER">{t("role.master")}</SelectItem>
									<SelectItem value="INSPECTOR">{t("role.inspector")}</SelectItem>
									<SelectItem value="OWNER">{t("role.owner")}</SelectItem>
									<SelectItem value="PROCUREMENT">{t("role.procurement")}</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label>{t("masters.emailOptional")}</Label>
							<Input
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder={t("masters.emailPlaceholder")}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>{t("masters.expiresInDays")}</Label>
							<NumberInput
								type="number"
								min={1}
								max={60}
								value={days}
								onChange={(e) => setDays(Number(e.target.value))}
							/>
						</div>
						{lastLink ? (
							<div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
								<span className="text-muted-foreground">{t("masters.singleUseLink")}</span>
								<code className="flex-1 truncate font-mono">{lastLink}</code>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="h-7 px-2"
									onClick={() => copy(lastLink)}
								>
									<CopyIcon className="mr-1 size-3.5" /> {t("common.copy")}
								</Button>
							</div>
						) : null}
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							{t("masters.close")}
						</Button>
						<Button type="submit" disabled={create.isPending}>
							{create.isPending ? t("masters.creating") : t("masters.createInvite")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
