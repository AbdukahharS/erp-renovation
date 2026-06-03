import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Combobox,
	ComboboxCollection,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { api, unwrap } from "@/lib/api";
import { ISO_4217_CURRENCIES, type IsoCurrency } from "@/lib/iso-currencies";

export const Route = createFileRoute("/owner/settings/")({
	staticData: { crumbKey: "nav.settings" },
	component: OwnerSettings,
});

interface TenantConfig {
	tenantId: string;
	currencyCode: string;
	targetUnitCost: string | null;
	ratingWeights: { speed: number; defect: number };
	branding: { displayName?: string; primaryColor?: string; logoKey?: string };
	photoRetentionDays: number;
	notificationRetentionDays: number;
}

function OwnerSettings() {
	const { t } = useTranslation();
	const qc = useQueryClient();
	const { data, isLoading } = useQuery({
		queryKey: ["tenant-config"],
		queryFn: () => unwrap(api.tenant.config.get()),
	});
	const cfg = data as unknown as TenantConfig | undefined;
	const [form, setForm] = useState<Partial<TenantConfig>>({});
	const dirty = Object.keys(form).length > 0;

	const save = useMutation({
		mutationFn: (patch: Partial<TenantConfig>) => unwrap(api.tenant.config.patch(patch as never)),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["tenant-config"] });
			setForm({});
			toast.success(t("settings.saved"));
		},
		onError: (e: Error) => toast.error(e.message),
	});

	if (isLoading || !cfg) {
		return (
			<div className="space-y-4">
				<PageHeader title={t("settings.title")} description={t("settings.shortDescription")} />
				<Skeleton className="h-48 w-full max-w-2xl" />
				<Skeleton className="h-48 w-full max-w-2xl" />
			</div>
		);
	}

	const value = { ...cfg, ...form } as TenantConfig;

	return (
		<div className="space-y-6">
			<PageHeader
				title={t("settings.title")}
				description={t("settings.description")}
				actions={
					<Button onClick={() => save.mutate(form)} disabled={save.isPending || !dirty}>
						{save.isPending ? t("common.saving") : t("common.saveChanges")}
					</Button>
				}
			/>

			<div className="grid gap-6 max-w-3xl">
				<Card>
					<CardHeader>
						<CardTitle>{t("settings.currency.title")}</CardTitle>
						<CardDescription>{t("settings.currency.description")}</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="currency">{t("settings.currency.code")}</Label>
							<Combobox
								items={ISO_4217_CURRENCIES}
								value={ISO_4217_CURRENCIES.find((c) => c.code === value.currencyCode) ?? null}
								onValueChange={(v: IsoCurrency | null) => {
									if (v) setForm((f) => ({ ...f, currencyCode: v.code }));
								}}
								itemToStringLabel={(item: IsoCurrency) => `${item.code} — ${item.name}`}
								itemToStringValue={(item: IsoCurrency) => item.code}
								isItemEqualToValue={(a: IsoCurrency, b: IsoCurrency) => a.code === b.code}
							>
								<ComboboxInput id="currency" placeholder="USD" />
								<ComboboxContent>
									<ComboboxList>
										<ComboboxCollection>
											{(item: IsoCurrency) => (
												<ComboboxItem key={item.code} value={item}>
													<span className="font-mono text-xs text-muted-foreground">
														{item.code}
													</span>
													<span>{item.name}</span>
												</ComboboxItem>
											)}
										</ComboboxCollection>
										<ComboboxEmpty>{t("common.empty")}</ComboboxEmpty>
									</ComboboxList>
								</ComboboxContent>
							</Combobox>
							<p className="text-xs text-muted-foreground">{t("settings.currency.codeHelp")}</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="target">{t("settings.currency.target")}</Label>
							<Input
								id="target"
								inputMode="decimal"
								value={value.targetUnitCost ?? ""}
								onChange={(e) => setForm((f) => ({ ...f, targetUnitCost: e.target.value || null }))}
							/>
							<p className="text-xs text-muted-foreground">{t("settings.currency.targetHelp")}</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{t("settings.rating.title")}</CardTitle>
						<CardDescription>{t("settings.rating.description")}</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-6 sm:grid-cols-2">
						<div className="space-y-3">
							<div className="flex items-baseline justify-between">
								<Label htmlFor="ws">{t("settings.rating.speed")}</Label>
								<span className="font-mono text-sm tabular-nums text-muted-foreground">
									{value.ratingWeights.speed.toFixed(1)}
								</span>
							</div>
							<Slider
								id="ws"
								min={0}
								max={2}
								step={0.1}
								value={[value.ratingWeights.speed]}
								onValueChange={(v) => {
									const speed = Array.isArray(v) ? (v[0] ?? 0) : v;
									setForm((f) => ({
										...f,
										ratingWeights: {
											speed: Number(speed.toFixed(1)),
											defect: Number((2 - speed).toFixed(1)),
										},
									}));
								}}
							/>
						</div>
						<div className="space-y-3">
							<div className="flex items-baseline justify-between">
								<Label htmlFor="wd">{t("settings.rating.defect")}</Label>
								<span className="font-mono text-sm tabular-nums text-muted-foreground">
									{value.ratingWeights.defect.toFixed(1)}
								</span>
							</div>
							<Slider
								id="wd"
								min={0}
								max={2}
								step={0.1}
								value={[value.ratingWeights.defect]}
								onValueChange={(v) => {
									const defect = Array.isArray(v) ? (v[0] ?? 0) : v;
									setForm((f) => ({
										...f,
										ratingWeights: {
											speed: Number((2 - defect).toFixed(1)),
											defect: Number(defect.toFixed(1)),
										},
									}));
								}}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Branding card hidden until the shared shell actually consumes
				    branding.displayName / primaryColor / logoKey. The jsonb column
				    still exists on tenant_config; restore this card when wiring it. */}
				{/* <Card>
					<CardHeader>
						<CardTitle>{t("settings.branding.title")}</CardTitle>
						<CardDescription>{t("settings.branding.description")}</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<Label htmlFor="brand-name">{t("settings.branding.displayName")}</Label>
							<Input
								id="brand-name"
								value={value.branding.displayName ?? ""}
								onChange={(e) =>
									setForm((f) => ({
										...f,
										branding: { ...value.branding, displayName: e.target.value },
									}))
								}
							/>
						</div>
					</CardContent>
				</Card> */}

				<Card>
					<CardHeader>
						<CardTitle>{t("settings.retention.title")}</CardTitle>
						<CardDescription>{t("settings.retention.description")}</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="photo-ret">{t("settings.retention.photoDays")}</Label>
							<Input
								id="photo-ret"
								type="number"
								min={30}
								max={3650}
								value={value.photoRetentionDays}
								onChange={(e) =>
									setForm((f) => ({ ...f, photoRetentionDays: Number(e.target.value) }))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="notif-ret">{t("settings.retention.notificationDays")}</Label>
							<Input
								id="notif-ret"
								type="number"
								min={7}
								max={730}
								value={value.notificationRetentionDays}
								onChange={(e) =>
									setForm((f) => ({
										...f,
										notificationRetentionDays: Number(e.target.value),
									}))
								}
							/>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
