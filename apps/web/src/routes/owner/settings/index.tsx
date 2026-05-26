import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, unwrap } from "@/lib/api";

export const Route = createFileRoute("/owner/settings/")({
	staticData: { crumb: "Settings" },
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
			toast.success("Settings saved");
		},
		onError: (e: Error) => toast.error(e.message),
	});

	if (isLoading || !cfg) {
		return (
			<div className="space-y-4">
				<PageHeader title="Tenant settings" description="Currency, targets, branding, retention." />
				<Skeleton className="h-48 w-full max-w-2xl" />
				<Skeleton className="h-48 w-full max-w-2xl" />
			</div>
		);
	}

	const value = { ...cfg, ...form } as TenantConfig;

	return (
		<div className="space-y-6">
			<PageHeader
				title="Tenant settings"
				description="Currency, targets, branding and retention policies for this tenant."
				actions={
					<Button onClick={() => save.mutate(form)} disabled={save.isPending || !dirty}>
						{save.isPending ? "Saving…" : "Save changes"}
					</Button>
				}
			/>

			<div className="grid gap-6 max-w-3xl">
				<Card>
					<CardHeader>
						<CardTitle>Currency &amp; targets</CardTitle>
						<CardDescription>
							Display currency and the per-unit cost goal used by the green-marker indicator.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="currency">Currency code (ISO 4217)</Label>
							<Input
								id="currency"
								value={value.currencyCode}
								maxLength={3}
								onChange={(e) =>
									setForm((f) => ({ ...f, currencyCode: e.target.value.toUpperCase() }))
								}
							/>
							<p className="text-xs text-muted-foreground">
								Only changeable when no non-archived properties exist.
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="target">Target unit cost</Label>
							<Input
								id="target"
								value={value.targetUnitCost ?? ""}
								onChange={(e) => setForm((f) => ({ ...f, targetUnitCost: e.target.value || null }))}
							/>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Rating weights</CardTitle>
						<CardDescription>
							How master speed and defects contribute to the rating.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="ws">Speed</Label>
							<Input
								id="ws"
								type="number"
								step="0.1"
								value={value.ratingWeights.speed}
								onChange={(e) =>
									setForm((f) => ({
										...f,
										ratingWeights: { ...value.ratingWeights, speed: Number(e.target.value) },
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="wd">Defect</Label>
							<Input
								id="wd"
								type="number"
								step="0.1"
								value={value.ratingWeights.defect}
								onChange={(e) =>
									setForm((f) => ({
										...f,
										ratingWeights: { ...value.ratingWeights, defect: Number(e.target.value) },
									}))
								}
							/>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Branding</CardTitle>
						<CardDescription>How this tenant appears in shared UI.</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<Label htmlFor="brand-name">Display name</Label>
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
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Retention</CardTitle>
						<CardDescription>How long photos and notifications stay around.</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="photo-ret">Photo retention (days)</Label>
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
							<Label htmlFor="notif-ret">Notification retention (days)</Label>
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
