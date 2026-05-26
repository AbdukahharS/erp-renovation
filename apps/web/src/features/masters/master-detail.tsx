import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGrantClosingPermission, useMarkPayout, useMasterFinance } from "@/lib/queries/finance";
import { useMaster, useUpdateMaster, useUpdateMasterAvailability } from "@/lib/queries/hr";

type MasterDetailPayload = {
	profile: {
		id: string;
		userId: string;
		displayName: string;
		phone: string | null;
		specializations: string[];
		availabilityOverride: string | null;
		availabilityOverrideUntil: string | null;
	};
	rating: {
		acceptedCount: number;
		rejectedCount: number;
		avgDurationRatio: string | null;
		computedAt: string;
	} | null;
	balance: string;
	recentAssignments: Array<{
		subStageInstanceId: string;
		propertyId: string;
		propertyName: string;
		subStageName: string;
		status: string;
		claimedAt: string;
		releasedAt: string | null;
	}>;
};

export function MasterDetail({ id }: { id: string }) {
	const query = useMaster(id);
	const update = useUpdateMaster();
	const availability = useUpdateMasterAvailability();

	const data = query.data as MasterDetailPayload | undefined;

	const [override, setOverride] = useState("");
	const [until, setUntil] = useState("");
	const [payoutAmount, setPayoutAmount] = useState("");
	const [payoutNote, setPayoutNote] = useState("");
	const masterFinance = useMasterFinance(data?.profile.userId);
	const markPayout = useMarkPayout(data?.profile.userId);
	const grantPermission = useGrantClosingPermission(data?.profile.userId);

	if (query.isLoading) return <p className="text-sm text-muted-foreground">loading…</p>;
	if (!data) return <p className="text-sm text-destructive">not found</p>;

	const p = data.profile;

	return (
		<section className="space-y-4">
			<Link to="/owner/masters" className="text-xs text-muted-foreground hover:underline">
				← Back to roster
			</Link>
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold">{p.displayName}</h1>
				<p className="font-mono text-xs text-muted-foreground">{p.userId}</p>
			</header>

			<div className="grid gap-3 md:grid-cols-3">
				<Card className="p-4">
					<div className="text-xs text-muted-foreground">Balance</div>
					<div className="text-2xl font-semibold">${data.balance}</div>
				</Card>
				<Card className="p-4">
					<div className="text-xs text-muted-foreground">Accepted / Rejected</div>
					<div className="text-2xl font-semibold">
						{data.rating?.acceptedCount ?? 0} / {data.rating?.rejectedCount ?? 0}
					</div>
				</Card>
				<Card className="p-4">
					<div className="text-xs text-muted-foreground">Avg duration ratio</div>
					<div className="text-2xl font-semibold">
						{data.rating?.avgDurationRatio ? Number(data.rating.avgDurationRatio).toFixed(2) : "—"}
					</div>
				</Card>
			</div>

			<Card className="space-y-3 p-4">
				<h2 className="text-sm font-semibold">Specializations</h2>
				<div className="flex flex-wrap gap-1">
					{p.specializations.map((s) => (
						<Badge key={s} variant="outline">
							{s}
						</Badge>
					))}
					{p.specializations.length === 0 && (
						<span className="text-xs text-muted-foreground">none</span>
					)}
				</div>
				<EditSpecializations
					initial={p.specializations}
					phone={p.phone}
					displayName={p.displayName}
					onSave={(displayName, phone, specs) =>
						update.mutate({ id: p.id, displayName, phone, specializations: specs })
					}
					pending={update.isPending}
				/>
			</Card>

			<Card className="space-y-3 p-4">
				<h2 className="text-sm font-semibold">Availability override</h2>
				<p className="text-xs text-muted-foreground">
					While the override window is active, notifications for new stages skip this master.
				</p>
				<div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
					<Input
						value={override}
						onChange={(e) => setOverride(e.target.value)}
						placeholder={p.availabilityOverride ?? "Reason (e.g. on leave)"}
					/>
					<Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
					<Button
						size="sm"
						disabled={availability.isPending}
						onClick={() =>
							availability.mutate({
								id: p.id,
								availabilityOverride: override || null,
								availabilityOverrideUntil: until ? new Date(until).toISOString() : null,
							})
						}
					>
						Save
					</Button>
				</div>
				{p.availabilityOverrideUntil && (
					<div className="text-xs">
						Current: <strong>{p.availabilityOverride ?? "set"}</strong> until{" "}
						{new Date(p.availabilityOverrideUntil).toLocaleString()}{" "}
						<button
							type="button"
							className="ml-2 underline"
							onClick={() =>
								availability.mutate({
									id: p.id,
									availabilityOverride: null,
									availabilityOverrideUntil: null,
								})
							}
						>
							clear
						</button>
					</div>
				)}
			</Card>

			<Card className="space-y-3 p-4">
				<h2 className="text-sm font-semibold">Finance</h2>
				{masterFinance.isLoading && (
					<p className="text-xs text-muted-foreground">loading transactions…</p>
				)}
				{masterFinance.data && (
					<>
						<div className="grid grid-cols-3 gap-2 text-xs">
							<div>
								<div className="text-muted-foreground">Wages</div>
								<div className="font-semibold tabular-nums">
									${masterFinance.data.wagesCredited}
								</div>
							</div>
							<div>
								<div className="text-muted-foreground">Fines</div>
								<div className="font-semibold tabular-nums text-rose-700">
									${masterFinance.data.finesDeducted}
								</div>
							</div>
							<div>
								<div className="text-muted-foreground">Settled</div>
								<div className="font-semibold tabular-nums">
									${masterFinance.data.payoutsSettled}
								</div>
							</div>
						</div>
						<div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
							<Input
								value={payoutAmount}
								onChange={(e) => setPayoutAmount(e.target.value)}
								placeholder="0.00"
								pattern="^\d+(\.\d{1,2})?$"
								className="font-mono"
							/>
							<Input
								value={payoutNote}
								onChange={(e) => setPayoutNote(e.target.value)}
								placeholder="Note (optional)"
							/>
							<Button
								size="sm"
								disabled={
									!payoutAmount.trim() ||
									Number(payoutAmount) > Number(masterFinance.data.balance) ||
									markPayout.isPending
								}
								onClick={() =>
									markPayout.mutate(
										{ amount: payoutAmount.trim(), note: payoutNote.trim() || undefined },
										{
											onSuccess: () => {
												setPayoutAmount("");
												setPayoutNote("");
											},
										},
									)
								}
							>
								Mark paid
							</Button>
						</div>
						<details className="text-xs">
							<summary className="cursor-pointer text-muted-foreground">
								Transactions ({masterFinance.data.transactions.length})
							</summary>
							<div className="mt-2 grid gap-1">
								{masterFinance.data.transactions.slice(0, 30).map((t) => (
									<div key={t.id} className="grid grid-cols-[80px_1fr_auto] items-center gap-2">
										<span className="text-muted-foreground">
											{new Date(t.createdAt).toISOString().slice(0, 10)}
										</span>
										<span>
											{t.type}
											{t.description ? (
												<span className="text-muted-foreground"> · {t.description}</span>
											) : null}
										</span>
										<span
											className={`tabular-nums ${Number(t.amount) < 0 ? "text-rose-700" : "text-emerald-700"}`}
										>
											${t.amount}
										</span>
									</div>
								))}
							</div>
						</details>
					</>
				)}
			</Card>

			<Card className="space-y-2 p-4">
				<h2 className="text-sm font-semibold">Closing permission</h2>
				<p className="text-xs text-muted-foreground">
					Per A7: the TZ's "Chief Technical Supervisor" maps to an Inspector with this permission.
					Master accounts shown here can also receive it for cross-tenant flexibility, though only
					Inspectors act on it in practice.
				</p>
				<Button
					size="sm"
					variant="outline"
					disabled={grantPermission.isPending}
					onClick={() => grantPermission.mutate(true)}
				>
					Grant
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={grantPermission.isPending}
					onClick={() => grantPermission.mutate(false)}
				>
					Revoke
				</Button>
				{grantPermission.error && (
					<p className="text-xs text-destructive">{(grantPermission.error as Error).message}</p>
				)}
			</Card>

			<Card className="space-y-3 p-4">
				<h2 className="text-sm font-semibold">Recent activity</h2>
				{data.recentAssignments.length === 0 && (
					<p className="text-xs text-muted-foreground">No assignments yet.</p>
				)}
				<div className="grid gap-2">
					{data.recentAssignments.map((a) => (
						<div
							key={a.subStageInstanceId + a.claimedAt}
							className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2 text-xs"
						>
							<div>{a.propertyName}</div>
							<div className="text-muted-foreground">{a.subStageName}</div>
							<Badge variant="outline">{a.status}</Badge>
							<div className="text-muted-foreground">
								{new Date(a.claimedAt).toLocaleDateString()}
							</div>
						</div>
					))}
				</div>
			</Card>
		</section>
	);
}

function EditSpecializations({
	initial,
	phone,
	displayName,
	onSave,
	pending,
}: {
	initial: string[];
	phone: string | null;
	displayName: string;
	onSave: (displayName: string, phone: string | null, specs: string[]) => void;
	pending: boolean;
}) {
	const [name, setName] = useState(displayName);
	const [phoneVal, setPhoneVal] = useState(phone ?? "");
	const [specs, setSpecs] = useState(initial.join(", "));
	return (
		<div className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto]">
			<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="display name" />
			<Input value={phoneVal} onChange={(e) => setPhoneVal(e.target.value)} placeholder="phone" />
			<Input
				value={specs}
				onChange={(e) => setSpecs(e.target.value)}
				placeholder="electrician, tiler"
			/>
			<Button
				size="sm"
				disabled={pending}
				onClick={() =>
					onSave(
						name.trim(),
						phoneVal.trim() || null,
						specs
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean),
					)
				}
			>
				Save
			</Button>
		</div>
	);
}
