import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, unwrap } from "@/lib/api";

export const Route = createFileRoute("/owner/settings/")({
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
	const value = { ...(cfg ?? {}), ...form } as TenantConfig;

	const save = useMutation({
		mutationFn: (patch: Partial<TenantConfig>) => unwrap(api.tenant.config.patch(patch as never)),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["tenant-config"] });
			setForm({});
		},
	});

	if (isLoading || !cfg) return <p className="text-sm text-muted-foreground">Loading…</p>;

	return (
		<section className="space-y-6 max-w-2xl">
			<h1 className="text-2xl font-semibold">Tenant settings</h1>

			<div className="space-y-2">
				<Label htmlFor="currency">Currency code (ISO 4217)</Label>
				<Input
					id="currency"
					value={value.currencyCode}
					maxLength={3}
					onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value.toUpperCase() }))}
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

			<fieldset className="space-y-2">
				<legend className="text-sm font-medium">Rating weights</legend>
				<div className="flex gap-3">
					<div className="flex-1 space-y-1">
						<Label htmlFor="ws">Speed</Label>
						<Input
							id="ws"
							type="number"
							step="0.1"
							value={value.ratingWeights.speed}
							onChange={(e) =>
								setForm((f) => ({
									...f,
									ratingWeights: {
										...value.ratingWeights,
										speed: Number(e.target.value),
									},
								}))
							}
						/>
					</div>
					<div className="flex-1 space-y-1">
						<Label htmlFor="wd">Defect</Label>
						<Input
							id="wd"
							type="number"
							step="0.1"
							value={value.ratingWeights.defect}
							onChange={(e) =>
								setForm((f) => ({
									...f,
									ratingWeights: {
										...value.ratingWeights,
										defect: Number(e.target.value),
									},
								}))
							}
						/>
					</div>
				</div>
			</fieldset>

			<div className="space-y-2">
				<Label htmlFor="brand-name">Brand display name</Label>
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

			<div className="grid grid-cols-2 gap-3">
				<div className="space-y-1">
					<Label htmlFor="photo-ret">Photo retention (days)</Label>
					<Input
						id="photo-ret"
						type="number"
						min={30}
						max={3650}
						value={value.photoRetentionDays}
						onChange={(e) => setForm((f) => ({ ...f, photoRetentionDays: Number(e.target.value) }))}
					/>
				</div>
				<div className="space-y-1">
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
			</div>

			<div className="flex items-center gap-2">
				<Button
					onClick={() => save.mutate(form)}
					disabled={save.isPending || Object.keys(form).length === 0}
				>
					{save.isPending ? "Saving…" : "Save changes"}
				</Button>
				{save.isError ? (
					<span className="text-xs text-destructive">{(save.error as Error).message}</span>
				) : null}
			</div>
		</section>
	);
}
