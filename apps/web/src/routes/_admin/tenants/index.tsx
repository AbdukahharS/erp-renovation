import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	Building2Icon,
	CheckCircle2Icon,
	DownloadIcon,
	EyeIcon,
	EyeOffIcon,
	PauseIcon,
	PlayIcon,
	PlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { apiBaseUrl } from "@/lib/api";

export const Route = createFileRoute("/_admin/tenants/")({
	staticData: { crumbKey: "nav.tenants" },
	component: AdminTenants,
});

interface TenantRow {
	id: string;
	name: string;
	slug: string;
	schemaName: string;
	status: "ACTIVE" | "SUSPENDED";
	createdAt: string;
	deletedAt: string | null;
	currencyCode: string | null;
}

async function adminFetch(path: string, init?: RequestInit) {
	const res = await fetch(`${apiBaseUrl}${path}`, {
		credentials: "include",
		headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
		...init,
	});
	if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
	return res.json();
}

function slugify(s: string) {
	return s
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 50);
}

function AdminTenants() {
	const { t } = useTranslation();
	const qc = useQueryClient();
	const navigate = useNavigate();
	const { data: tenants, isLoading } = useQuery<TenantRow[]>({
		queryKey: ["admin-tenants"],
		queryFn: () => adminFetch("/admin/tenants"),
	});

	const [createOpen, setCreateOpen] = useState(false);
	const [confirm, setConfirm] = useState<{ kind: "suspend" | "resume"; tenant: TenantRow } | null>(
		null,
	);

	const suspend = useMutation({
		mutationFn: (id: string) => adminFetch(`/admin/tenants/${id}/suspend`, { method: "POST" }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["admin-tenants"] });
			toast.success(t("tenants.suspended"));
			setConfirm(null);
		},
		onError: (e: Error) => toast.error(e.message),
	});
	const resume = useMutation({
		mutationFn: (id: string) => adminFetch(`/admin/tenants/${id}/resume`, { method: "POST" }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["admin-tenants"] });
			toast.success(t("tenants.resumed"));
			setConfirm(null);
		},
		onError: (e: Error) => toast.error(e.message),
	});

	return (
		<div className="space-y-6">
			<PageHeader
				title={t("tenants.title")}
				description={t("tenants.description")}
				actions={
					<Button onClick={() => setCreateOpen(true)}>
						<PlusIcon className="mr-1 size-4" />
						{t("tenants.newTenant")}
					</Button>
				}
			/>

			{isLoading ? (
				<div className="space-y-2 rounded-lg border bg-card p-4">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : !tenants?.length ? (
				<EmptyState
					icon={Building2Icon}
					title={t("tenants.emptyTitle")}
					description={t("tenants.emptyDescription")}
					action={
						<Button onClick={() => setCreateOpen(true)}>
							<PlusIcon className="mr-1 size-4" />
							{t("tenants.newTenant")}
						</Button>
					}
				/>
			) : (
				<div className="rounded-lg border bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("tenants.colName")}</TableHead>
								<TableHead>{t("tenants.colSchema")}</TableHead>
								<TableHead>{t("tenants.colCurrency")}</TableHead>
								<TableHead>{t("tenants.colStatus")}</TableHead>
								<TableHead className="text-right">{t("tenants.colActions")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{tenants.map((row) => (
								<TableRow
									key={row.id}
									className="cursor-pointer"
									onClick={() =>
										navigate({ to: "/tenants/$tenantId", params: { tenantId: row.id } })
									}
								>
									<TableCell>
										<div className="font-medium">{row.name}</div>
										<div className="text-xs text-muted-foreground font-mono">{row.slug}</div>
									</TableCell>
									<TableCell className="font-mono text-xs">{row.schemaName}</TableCell>
									<TableCell className="text-xs">{row.currencyCode ?? t("common.em")}</TableCell>
									<TableCell>
										<Badge
											variant={row.status === "ACTIVE" ? "default" : "secondary"}
											className="text-[10px]"
										>
											{t(`tenants.status.${row.status}`, row.status.toLowerCase())}
										</Badge>
									</TableCell>
									<TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
										<div className="flex items-center justify-end gap-1">
											{row.status === "ACTIVE" ? (
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setConfirm({ kind: "suspend", tenant: row })}
												>
													<PauseIcon className="mr-1 size-3.5" />
													{t("tenants.suspend")}
												</Button>
											) : (
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setConfirm({ kind: "resume", tenant: row })}
												>
													<PlayIcon className="mr-1 size-3.5" />
													{t("tenants.resume")}
												</Button>
											)}
											<Button
												variant="ghost"
												size="sm"
												onClick={() => {
													window.location.href = `${apiBaseUrl}/admin/tenants/${row.id}/export`;
												}}
												aria-label={t("tenants.exportAria", { name: row.name })}
											>
												<DownloadIcon className="mr-1 size-3.5" />
												{t("tenants.export")}
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<CreateTenantDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={() => qc.invalidateQueries({ queryKey: ["admin-tenants"] })}
			/>

			<AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirm?.kind === "suspend" ? t("tenants.suspendTitle") : t("tenants.resumeTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{confirm?.kind === "suspend"
								? t("tenants.suspendBody", { name: confirm.tenant.name })
								: t("tenants.resumeBody", { name: confirm?.tenant.name ?? "" })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<Button variant="outline" onClick={() => setConfirm(null)}>
							{t("common.cancel")}
						</Button>
						<Button
							variant={confirm?.kind === "suspend" ? "destructive" : "default"}
							onClick={() => {
								if (!confirm) return;
								if (confirm.kind === "suspend") suspend.mutate(confirm.tenant.id);
								else resume.mutate(confirm.tenant.id);
							}}
							disabled={suspend.isPending || resume.isPending}
						>
							{confirm?.kind === "suspend" ? t("tenants.suspend") : t("tenants.resume")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function CreateTenantDialog({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	onCreated: () => void;
}) {
	const { t } = useTranslation();
	const [draft, setDraft] = useState({
		name: "",
		slug: "",
		ownerEmail: "",
		ownerName: "",
		ownerPassword: "",
		defaultTemplateLanguage: "en" as "en" | "ru" | "uz",
	});
	const [slugDirty, setSlugDirty] = useState(false);
	const [showPwd, setShowPwd] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) {
			setDraft({
				name: "",
				slug: "",
				ownerEmail: "",
				ownerName: "",
				ownerPassword: "",
				defaultTemplateLanguage: "en",
			});
			setSlugDirty(false);
			setShowPwd(false);
			setError(null);
		}
	}, [open]);

	useEffect(() => {
		if (!slugDirty) {
			setDraft((d) => ({ ...d, slug: slugify(d.name) }));
		}
	}, [slugDirty]);

	const create = useMutation({
		mutationFn: (body: typeof draft) =>
			adminFetch("/admin/tenants", { method: "POST", body: JSON.stringify(body) }),
		onSuccess: () => {
			toast.success(t("tenants.provisioned", { name: draft.name }));
			onCreated();
			onOpenChange(false);
		},
		onError: (e: Error) => setError(e.message),
	});

	const pwdScore = scorePassword(draft.ownerPassword);
	const canSubmit =
		draft.name.trim().length >= 2 &&
		/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(draft.slug) &&
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.ownerEmail) &&
		draft.ownerName.trim().length >= 2 &&
		draft.ownerPassword.length >= 12;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("tenants.provisionTitle")}</DialogTitle>
					<DialogDescription>{t("tenants.provisionDesc")}</DialogDescription>
				</DialogHeader>

				<form
					id="create-tenant-form"
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						if (!canSubmit) return;
						create.mutate(draft);
					}}
				>
					<div className="space-y-2">
						<Label htmlFor="t-name">{t("tenants.companyName")}</Label>
						<Input
							id="t-name"
							autoFocus
							value={draft.name}
							onChange={(e) => {
								const name = e.target.value;
								setDraft((d) => ({
									...d,
									name,
									slug: slugDirty ? d.slug : slugify(name),
								}));
							}}
							placeholder={t("tenants.companyPh")}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="t-slug">{t("tenants.slug")}</Label>
						<Input
							id="t-slug"
							value={draft.slug}
							onChange={(e) => {
								setSlugDirty(true);
								setDraft((d) => ({ ...d, slug: slugify(e.target.value) }));
							}}
							placeholder={t("tenants.slugPh")}
						/>
						<p className="text-[11px] text-muted-foreground">{t("tenants.slugHelp")}</p>
					</div>

					<fieldset className="space-y-2">
						<legend className="text-sm font-medium">{t("tenants.defaultTemplateLanguage")}</legend>
						<p className="text-[11px] text-muted-foreground">
							{t("tenants.defaultTemplateLanguageDesc")}
						</p>
						<div className="grid grid-cols-3 gap-2">
							{(["en", "ru", "uz"] as const).map((code) => (
								<label
									key={code}
									className="flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-muted/30"
								>
									<input
										type="radio"
										name="default-template-language"
										value={code}
										checked={draft.defaultTemplateLanguage === code}
										onChange={() => setDraft((d) => ({ ...d, defaultTemplateLanguage: code }))}
										className="sr-only"
									/>
									<span className="font-medium">{t(`tenants.lang.${code}`)}</span>
								</label>
							))}
						</div>
					</fieldset>

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="t-oname">{t("tenants.ownerName")}</Label>
							<Input
								id="t-oname"
								value={draft.ownerName}
								onChange={(e) => setDraft((d) => ({ ...d, ownerName: e.target.value }))}
								placeholder={t("tenants.ownerNamePh")}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="t-oemail">{t("tenants.ownerEmail")}</Label>
							<Input
								id="t-oemail"
								type="email"
								value={draft.ownerEmail}
								onChange={(e) => setDraft((d) => ({ ...d, ownerEmail: e.target.value }))}
								placeholder={t("tenants.ownerEmailPh")}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="t-opwd">{t("tenants.ownerPassword")}</Label>
						<div className="relative">
							<Input
								id="t-opwd"
								type={showPwd ? "text" : "password"}
								value={draft.ownerPassword}
								onChange={(e) => setDraft((d) => ({ ...d, ownerPassword: e.target.value }))}
								placeholder={t("tenants.passwordPh")}
								className="pr-10"
							/>
							<button
								type="button"
								onClick={() => setShowPwd((v) => !v)}
								className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
								aria-label={showPwd ? t("tenants.hidePassword") : t("tenants.showPassword")}
							>
								{showPwd ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
							</button>
						</div>
						<PasswordMeter score={pwdScore} length={draft.ownerPassword.length} />
					</div>

					{error ? (
						<div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
							{error}
						</div>
					) : null}
				</form>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
						{t("common.cancel")}
					</Button>
					<Button type="submit" form="create-tenant-form" disabled={!canSubmit || create.isPending}>
						{create.isPending ? (
							t("tenants.provisioning")
						) : (
							<>
								<CheckCircle2Icon className="mr-1 size-4" />
								{t("tenants.provision")}
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function scorePassword(pwd: string): number {
	if (!pwd) return 0;
	let s = 0;
	if (pwd.length >= 8) s += 1;
	if (pwd.length >= 12) s += 1;
	if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) s += 1;
	if (/\d/.test(pwd)) s += 1;
	if (/[^A-Za-z0-9]/.test(pwd)) s += 1;
	return Math.min(s, 4);
}

function PasswordMeter({ score, length }: { score: number; length: number }) {
	const { t } = useTranslation();
	const labels = [
		t("tenants.password.veryWeak"),
		t("tenants.password.weak"),
		t("tenants.password.fair"),
		t("tenants.password.good"),
		t("tenants.password.strong"),
	];
	const colors = [
		"bg-destructive",
		"bg-destructive",
		"bg-amber-500",
		"bg-emerald-500",
		"bg-emerald-600",
	];
	return (
		<div className="space-y-1">
			<div className="flex gap-1">
				{[0, 1, 2, 3].map((i) => (
					<div
						key={i}
						className={`h-1 flex-1 rounded-full ${i < score ? (colors[score] ?? "bg-muted") : "bg-muted"}`}
					/>
				))}
			</div>
			<div className="flex justify-between text-[10px] text-muted-foreground">
				<span>{length === 0 ? t("tenants.password.enter") : (labels[score] ?? "")}</span>
				<span className={length < 12 ? "text-destructive" : ""}>
					{t("tenants.password.meter", { length })}
				</span>
			</div>
		</div>
	);
}
