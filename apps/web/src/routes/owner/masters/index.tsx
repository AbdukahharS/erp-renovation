import type { Role } from "@repo/validators";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDownIcon, CopyIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import i18n from "@/lib/i18n";
import {
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
	const create = useCreateInvitation();
	const revoke = useRevokeInvitation();

	const [role, setRole] = useState<Role>("MASTER");
	const [email, setEmail] = useState("");
	const [days, setDays] = useState(14);
	const [lastLink, setLastLink] = useState<string | null>(null);

	function submit() {
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
		<div className="space-y-6">
			<PageHeader title={t("masters.title")} description={t("masters.description")} />

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<UserPlusIcon className="size-4" /> {t("masters.createInvitation")}
					</CardTitle>
					<CardDescription>{t("masters.createInvitationDesc")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 md:grid-cols-4">
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
						<div className="space-y-1.5 md:col-span-2">
							<Label>{t("masters.emailOptional")}</Label>
							<Input
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder={t("masters.emailPlaceholder")}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>{t("masters.expiresInDays")}</Label>
							<Input
								type="number"
								min={1}
								max={60}
								value={days}
								onChange={(e) => setDays(Number(e.target.value))}
							/>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Button onClick={submit} disabled={create.isPending}>
							{create.isPending ? t("masters.creating") : t("masters.createInvite")}
						</Button>
					</div>
					{lastLink ? (
						<div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
							<span className="text-muted-foreground">{t("masters.singleUseLink")}</span>
							<code className="flex-1 truncate font-mono">{lastLink}</code>
							<Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copy(lastLink)}>
								<CopyIcon className="mr-1 size-3.5" /> {t("common.copy")}
							</Button>
						</div>
					) : null}
				</CardContent>
			</Card>

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
					<Card key={inv.token} className="p-3">
						<div className="grid items-center gap-3 md:grid-cols-[auto_1fr_auto_auto_auto]">
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
					</Card>
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
								<div className="space-y-2">{pending.map(renderRow)}</div>
							)}
						</section>

						{history.length > 0 && (
							<Collapsible className="space-y-2">
								<CollapsibleTrigger className="group/trigger flex w-full items-center justify-between rounded-md border border-transparent px-1 py-1 text-sm font-semibold hover:bg-muted/40">
									<span>
										{t("masters.invitationHistory", "Invitation history")}{" "}
										<span className="text-muted-foreground font-normal">({history.length})</span>
									</span>
									<ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/trigger:rotate-180" />
								</CollapsibleTrigger>
								<CollapsibleContent className="space-y-2">
									{history.map(renderRow)}
								</CollapsibleContent>
							</Collapsible>
						)}
					</>
				);
			})()}

			<section className="space-y-2">
				<h2 className="text-sm font-semibold">{t("masters.roster")}</h2>
				{masters.isLoading ? (
					<Skeleton className="h-24 w-full" />
				) : masters.data?.length === 0 ? (
					<EmptyState
						icon={UsersIcon}
						title={t("masters.noMasters")}
						description={t("masters.noMastersDesc")}
					/>
				) : (
					<div className="grid gap-2">
						{masters.data?.map((m) => {
							const isMaster = m.role === "MASTER";
							return (
								<Card key={m.id} className="p-3">
									<div className="grid items-center gap-3 md:grid-cols-[auto_1fr_1fr_1fr_1fr_auto]">
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
											<div className="text-xs text-muted-foreground">
												{m.phone ?? t("masters.noPhone")}
											</div>
										</div>
										<div className="flex flex-wrap gap-1">
											{isMaster ? (
												m.specializations.length === 0 ? (
													<span className="text-xs text-muted-foreground">
														{t("masters.noSpecs")}
													</span>
												) : (
													m.specializations.map((s) => (
														<Badge key={s} variant="outline" className="text-[10px]">
															{s}
														</Badge>
													))
												)
											) : (
												<span className="text-xs text-muted-foreground">{t("common.em")}</span>
											)}
										</div>
										<div className="text-xs">
											{isMaster ? (
												m.rating ? (
													<>
														<div>
															{t("masters.acceptedRejected", {
																accepted: m.rating.acceptedCount,
																rejected: m.rating.rejectedCount,
															})}
														</div>
														<div className="text-muted-foreground">
															{t("masters.avgRatio", {
																value: m.rating.avgDurationRatio
																	? Number(m.rating.avgDurationRatio).toFixed(2)
																	: t("common.em"),
															})}
														</div>
													</>
												) : (
													<span className="text-muted-foreground">{t("masters.noActivity")}</span>
												)
											) : (
												<span className="text-muted-foreground">{t("common.em")}</span>
											)}
										</div>
										<div className="text-xs">
											<div className="font-medium">{m.availability.state}</div>
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
										{isMaster ? (
											<Button
												size="sm"
												variant="outline"
												nativeButton={false}
												render={<Link to="/owner/masters/$id" params={{ id: m.id }} />}
											>
												{t("masters.open")}
											</Button>
										) : (
											<span />
										)}
									</div>
								</Card>
							);
						})}
					</div>
				)}
			</section>
		</div>
	);
}
