import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2Icon, ClockIcon, LockIcon, XCircleIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { apiBaseUrl } from "@/lib/api";
import { formatNumber } from "@/lib/format-number";

export const Route = createFileRoute("/p/$tenantSlug/$linkSlug")({
	component: PublicProgressPage,
});

type PublicView = {
	property: {
		name: string;
		address: string;
		areaSqm: string;
		status: string;
		deadlineAt: string | null;
	};
	stages: Array<{
		id: string;
		order: number;
		name: string;
		progressPct: number;
		subStages: Array<{
			id: string;
			code: string;
			name: string;
			performerType: "MASTER" | "INSPECTOR";
			status: string;
			standardDurationDays: number;
			acceptedAt: string | null;
			photos: Array<{
				id: string;
				url: string | null;
				contentType: string;
				uploadedAt: string;
			}>;
		}>;
	}>;
	computedEta: {
		currentStageEndsAt: string | null;
		propertyEndsAt: string | null;
	};
};

function tokenKey(tenantSlug: string, linkSlug: string) {
	return `share_token:${tenantSlug}:${linkSlug}`;
}

async function authenticate(
	tenantSlug: string,
	linkSlug: string,
	password: string,
): Promise<string> {
	const res = await fetch(
		`${apiBaseUrl}/public/property-share/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(linkSlug)}/auth`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ password }),
		},
	);
	if (!res.ok) {
		if (res.status === 429) throw new Error("TOO_MANY_ATTEMPTS");
		throw new Error("INVALID_PASSWORD");
	}
	const data = (await res.json()) as { token: string };
	return data.token;
}

async function fetchView(token: string): Promise<PublicView> {
	const res = await fetch(`${apiBaseUrl}/public/property-share/view`, {
		headers: { authorization: `Bearer ${token}` },
	});
	if (res.status === 401) throw new Error("UNAUTHORIZED");
	if (!res.ok) throw new Error("FETCH_FAILED");
	return (await res.json()) as PublicView;
}

function PublicProgressPage() {
	const { t } = useTranslation();
	const { tenantSlug, linkSlug } = Route.useParams();
	const storageKey = tokenKey(tenantSlug, linkSlug);
	const [token, setToken] = useState<string | null>(() =>
		typeof window === "undefined" ? null : sessionStorage.getItem(storageKey),
	);

	const clearToken = useCallback(() => {
		if (typeof window !== "undefined") sessionStorage.removeItem(storageKey);
		setToken(null);
	}, [storageKey]);

	const view = useQuery({
		queryKey: ["public-share-view", tenantSlug, linkSlug, token],
		queryFn: () => fetchView(token as string),
		enabled: !!token,
		refetchInterval: 60_000,
		retry: false,
	});

	useEffect(() => {
		if (view.isError && (view.error as Error).message === "UNAUTHORIZED") {
			clearToken();
		}
	}, [view.isError, view.error, clearToken]);

	if (!token) {
		return (
			<PasswordGate
				onAuthed={(t) => {
					if (typeof window !== "undefined") sessionStorage.setItem(storageKey, t);
					setToken(t);
				}}
				tenantSlug={tenantSlug}
				linkSlug={linkSlug}
			/>
		);
	}

	if (view.isLoading || !view.data) {
		return (
			<div className="flex min-h-screen items-center justify-center p-6">
				<p className="text-sm text-muted-foreground">{t("customerView.loading")}</p>
			</div>
		);
	}

	return <ProgressView data={view.data} onSignOut={clearToken} />;
}

function PasswordGate({
	tenantSlug,
	linkSlug,
	onAuthed,
}: {
	tenantSlug: string;
	linkSlug: string;
	onAuthed: (token: string) => void;
}) {
	const { t } = useTranslation();
	const [password, setPassword] = useState("");
	const mut = useMutation({
		mutationFn: () => authenticate(tenantSlug, linkSlug, password),
		onSuccess: (token) => onAuthed(token),
	});

	const errorMessage = (() => {
		if (!mut.isError) return null;
		const code = (mut.error as Error)?.message;
		if (code === "TOO_MANY_ATTEMPTS") return t("customerView.tooManyAttempts");
		if (code === "INVALID_PASSWORD") return t("customerView.invalidPassword");
		return t("customerView.signInFailed");
	})();

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
			<div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
				<div className="flex items-start justify-between gap-2">
					<h1 className="text-lg font-semibold">{t("customerView.signIn")}</h1>
					<LanguageSwitcher />
				</div>
				<p className="mt-1 text-sm text-muted-foreground">{t("customerView.signInDescription")}</p>
				<form
					className="mt-4 space-y-3"
					onSubmit={(e) => {
						e.preventDefault();
						mut.mutate();
					}}
				>
					<input
						type="password"
						className="w-full rounded-md border bg-background px-3 py-2 text-sm"
						placeholder={t("customerView.passwordPlaceholder")}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
					<button
						type="submit"
						className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
						disabled={mut.isPending || !password}
					>
						{mut.isPending ? t("customerView.checking") : t("customerView.viewProgress")}
					</button>
					{errorMessage && <p className="text-xs text-rose-600">{errorMessage}</p>}
				</form>
			</div>
		</div>
	);
}

function statusTone(status: string): string {
	switch (status) {
		case "ACCEPTED":
			return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
		case "IN_PROGRESS":
			return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
		case "SUBMITTED":
			return "bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-200";
		case "REJECTED":
			return "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
		case "AVAILABLE":
			return "bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200";
		default:
			return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
	}
}

function StatusIcon({ status }: { status: string }) {
	if (status === "ACCEPTED") return <CheckCircle2Icon className="size-3.5" />;
	if (status === "REJECTED") return <XCircleIcon className="size-3.5" />;
	if (status === "LOCKED") return <LockIcon className="size-3.5" />;
	return <ClockIcon className="size-3.5" />;
}

function ProgressView({ data, onSignOut }: { data: PublicView; onSignOut: () => void }) {
	const { t, i18n } = useTranslation();
	const [lightbox, setLightbox] = useState<string | null>(null);

	const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);

	const overallProgress = data.stages.length
		? Math.round(data.stages.reduce((sum, s) => sum + s.progressPct, 0) / data.stages.length)
		: 0;

	return (
		<div className="mx-auto min-h-screen max-w-3xl space-y-6 p-4 sm:p-6">
			<header className="space-y-3 rounded-lg border bg-card p-5 shadow-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h1 className="text-xl font-semibold">{data.property.name}</h1>
						<p className="text-sm text-muted-foreground">{data.property.address}</p>
					</div>
					<div className="flex items-center gap-2">
						<LanguageSwitcher />
						<button
							type="button"
							className="text-xs text-muted-foreground hover:underline"
							onClick={onSignOut}
						>
							{t("customerView.signOut")}
						</button>
					</div>
				</div>
				<dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
					<div>
						<dt className="text-muted-foreground">{t("customerView.status")}</dt>
						<dd className="font-medium">
							{t(`propertyStatus.${data.property.status}`, data.property.status)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{t("customerView.area")}</dt>
						<dd className="font-medium">{formatNumber(data.property.areaSqm)} m²</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">{t("customerView.overallProgress")}</dt>
						<dd className="font-medium">{overallProgress}%</dd>
					</div>
					{data.property.deadlineAt && (
						<div>
							<dt className="text-muted-foreground">{t("customerView.deadline")}</dt>
							<dd className="font-medium">{dateFmt(data.property.deadlineAt)}</dd>
						</div>
					)}
					{data.computedEta.propertyEndsAt && (
						<div>
							<dt className="text-muted-foreground">{t("customerView.estimatedCompletion")}</dt>
							<dd className="font-medium">{dateFmt(data.computedEta.propertyEndsAt)}</dd>
						</div>
					)}
					{data.computedEta.currentStageEndsAt && (
						<div>
							<dt className="text-muted-foreground">{t("customerView.currentStageEnds")}</dt>
							<dd className="font-medium">{dateFmt(data.computedEta.currentStageEndsAt)}</dd>
						</div>
					)}
				</dl>
			</header>

			<div className="space-y-4">
				{data.stages.map((stage) => {
					const accepted = stage.subStages.filter((s) => s.status === "ACCEPTED").length;
					return (
						<section key={stage.id} className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
							<div className="flex items-start justify-between gap-3">
								<div>
									<h2 className="text-sm font-semibold">
										{stage.order}. {stage.name}
									</h2>
									<p className="text-xs text-muted-foreground">
										{t("customerView.stepsComplete", {
											accepted,
											total: stage.subStages.length,
										})}
									</p>
								</div>
								<span className="text-xs font-medium text-muted-foreground">
									{stage.progressPct}%
								</span>
							</div>
							<div className="h-1.5 overflow-hidden rounded-full bg-muted">
								<div
									className="h-full bg-primary transition-all"
									style={{ width: `${stage.progressPct}%` }}
								/>
							</div>
							<ul className="space-y-2 pt-1">
								{stage.subStages.map((ss) => (
									<li key={ss.id} className="space-y-2 rounded border bg-background p-2">
										<div className="flex items-center justify-between gap-2">
											<div className="min-w-0">
												<div className="truncate text-xs font-medium">
													{ss.code} — {ss.name}
												</div>
												{ss.acceptedAt && (
													<div className="text-[11px] text-muted-foreground">
														{t("customerView.acceptedOn", {
															date: dateFmt(ss.acceptedAt),
														})}
													</div>
												)}
											</div>
											<span
												className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusTone(ss.status)}`}
											>
												<StatusIcon status={ss.status} />
												{t(`stageStatus.${ss.status}`, ss.status)}
											</span>
										</div>
										{ss.photos.length > 0 && (
											<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
												{ss.photos.map((photo) =>
													photo.url ? (
														<button
															key={photo.id}
															type="button"
															onClick={() => setLightbox(photo.url)}
															className="aspect-square overflow-hidden rounded border bg-muted"
														>
															<img
																src={photo.url}
																alt=""
																className="size-full object-cover transition-transform hover:scale-105"
																loading="lazy"
															/>
														</button>
													) : null,
												)}
											</div>
										)}
									</li>
								))}
							</ul>
						</section>
					);
				})}
			</div>

			{lightbox && (
				<button
					type="button"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
					onClick={() => setLightbox(null)}
				>
					<img
						src={lightbox}
						alt=""
						className="max-h-[90vh] max-w-[95vw] rounded-md object-contain"
					/>
				</button>
			)}
		</div>
	);
}
