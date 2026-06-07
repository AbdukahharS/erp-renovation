import { createFileRoute } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RatingBreakdownCard } from "@/components/master-rating";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/lib/auth";
import { useMasterMe } from "@/lib/queries/hr";

export const Route = createFileRoute("/master/profile")({
	staticData: { crumbKey: "fieldTabs.profile" },
	component: MasterProfile,
});

function MasterProfile() {
	const { t } = useTranslation();
	const { me } = Route.useRouteContext();
	const user = me?.user;
	const membership = me?.memberships.find((m) => m.tenantId === me?.activeTenantId);
	const { data: self } = useMasterMe();
	const specializations = self?.profile.specializations ?? [];
	const initials =
		user?.name
			?.split(" ")
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?";

	return (
		<section className="space-y-4">
			<header>
				<h1 className="text-xl font-semibold">{t("fieldTabs.profile")}</h1>
			</header>

			<Card className="flex flex-row items-center gap-3 p-4">
				<Avatar className="size-12">
					<AvatarFallback>{initials}</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<div className="truncate text-base font-medium">{user?.name ?? "—"}</div>
					<div className="truncate text-sm text-muted-foreground">{user?.email ?? ""}</div>
				</div>
			</Card>

			<RatingBreakdownCard rating={self?.rating ?? null} />

			<Card className="divide-y p-0">
				<Row
					label={t("profile.role", { defaultValue: "Role" })}
					value={
						me?.activeRole
							? t(`role.${me.activeRole.toLowerCase()}`, { defaultValue: me.activeRole })
							: "—"
					}
				/>
				<Row
					label={t("profile.company", { defaultValue: "Company" })}
					value={membership?.tenantName ?? "—"}
				/>
				<div className="flex flex-col gap-2 px-4 py-3 text-sm">
					<span className="text-muted-foreground">
						{t("profile.specializations", { defaultValue: "Specializations" })}
					</span>
					{specializations.length > 0 ? (
						<div className="flex flex-wrap gap-1.5">
							{specializations.map((s) => (
								<Badge key={s} variant="secondary" className="font-normal">
									{t(`specializations.${s}`)}
								</Badge>
							))}
						</div>
					) : (
						<span className="font-medium">—</span>
					)}
				</div>
				{self?.profile.phone ? (
					<Row label={t("profile.phone", { defaultValue: "Phone" })} value={self.profile.phone} />
				) : null}
			</Card>

			<Button
				variant="outline"
				className="w-full"
				onClick={async () => {
					await signOut();
					window.location.href = "/login";
				}}
			>
				<LogOutIcon className="mr-2 size-4" />
				{t("auth.signOut")}
			</Button>
		</section>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between px-4 py-3 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium">{value}</span>
		</div>
	);
}
