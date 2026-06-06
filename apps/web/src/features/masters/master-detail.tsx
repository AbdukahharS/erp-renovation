import { SPECIALIZATIONS, type SpecializationKey } from "@repo/validators";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SpecializationsPicker } from "@/components/specializations-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format-money";
import { formatNumber } from "@/lib/format-number";
import { useGrantClosingPermission, useMarkPayout, useMasterFinance } from "@/lib/queries/finance";
import { useMaster, useUpdateMaster, useUpdateMasterAvailability } from "@/lib/queries/hr";
import { useCurrencyCode } from "@/lib/queries/tenant-config";

type MasterDetailPayload = {
	profile: {
		id: string;
		userId: string;
		displayName: string;
		phone: string | null;
		specializations: SpecializationKey[];
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
	const { t } = useTranslation();
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
	const currency = useCurrencyCode();

	if (query.isLoading)
		return <p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>;
	if (!data) return <p className="text-sm text-destructive">{t("masterDetail.notFound")}</p>;

	const p = data.profile;

	return (
		<section className="space-y-4">
			<Link to="/owner/masters" className="text-xs text-muted-foreground hover:underline">
				{t("masterDetail.backToRoster")}
			</Link>
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold">{p.displayName}</h1>
				<p className="font-mono text-xs text-muted-foreground">{p.userId}</p>
			</header>

			<div className="grid gap-3 md:grid-cols-3">
				<Card className="p-4">
					<div className="text-xs text-muted-foreground">{t("masterDetail.balance")}</div>
					<div className="text-2xl font-semibold">{formatMoney(data.balance, currency)}</div>
				</Card>
				<Card className="p-4">
					<div className="text-xs text-muted-foreground">{t("masterDetail.acceptedRejected")}</div>
					<div className="text-2xl font-semibold">
						{data.rating?.acceptedCount ?? 0} / {data.rating?.rejectedCount ?? 0}
					</div>
				</Card>
				<Card className="p-4">
					<div className="text-xs text-muted-foreground">{t("masterDetail.avgDurationRatio")}</div>
					<div className="text-2xl font-semibold">
						{data.rating?.avgDurationRatio
							? formatNumber(data.rating.avgDurationRatio, { maxDecimals: 2 })
							: t("common.em")}
					</div>
				</Card>
			</div>

			<Card className="space-y-3 p-4">
				<h2 className="text-sm font-semibold">{t("masterDetail.specializations")}</h2>
				<div className="flex flex-wrap gap-1">
					{p.specializations.map((s) => (
						<Badge key={s} variant="outline">
							{t(`specializations.${s}`)}
						</Badge>
					))}
					{p.specializations.length === 0 && (
						<span className="text-xs text-muted-foreground">{t("common.none")}</span>
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
				<h2 className="text-sm font-semibold">{t("masterDetail.availabilityOverride")}</h2>
				<p className="text-xs text-muted-foreground">{t("masterDetail.availabilityHelp")}</p>
				<div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
					<Input
						value={override}
						onChange={(e) => setOverride(e.target.value)}
						placeholder={p.availabilityOverride ?? t("masterDetail.overrideReason")}
					/>
					<DateTimePicker value={until} onChange={setUntil} withTime={false} />
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
						{t("common.save")}
					</Button>
				</div>
				{p.availabilityOverrideUntil && (
					<div className="text-xs">
						{t("masterDetail.current")}{" "}
						<strong>{p.availabilityOverride ?? t("masterDetail.set")}</strong> until{" "}
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
							{t("masterDetail.clear")}
						</button>
					</div>
				)}
			</Card>

			<Card className="space-y-3 p-4">
				<h2 className="text-sm font-semibold">{t("masterDetail.finance")}</h2>
				{masterFinance.isLoading && (
					<p className="text-xs text-muted-foreground">{t("masterDetail.loadingTransactions")}</p>
				)}
				{masterFinance.data && (
					<>
						<div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
							<div>
								<div className="text-muted-foreground">{t("masterDetail.wages")}</div>
								<div className="font-semibold tabular-nums">
									{formatMoney(masterFinance.data.wagesCredited, currency)}
								</div>
							</div>
							<div>
								<div className="text-muted-foreground">{t("masterDetail.fines")}</div>
								<div className="font-semibold tabular-nums text-rose-700">
									{formatMoney(masterFinance.data.finesDeducted, currency)}
								</div>
							</div>
							<div>
								<div className="text-muted-foreground">{t("masterDetail.settled")}</div>
								<div className="font-semibold tabular-nums">
									{formatMoney(masterFinance.data.payoutsSettled, currency)}
								</div>
							</div>
							<div>
								<div className="text-muted-foreground">{t("masterDetail.outstanding")}</div>
								<div className="font-semibold tabular-nums text-emerald-700">
									{formatMoney(masterFinance.data.balance, currency)}
								</div>
							</div>
						</div>
						<div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
							<NumberInput
								value={payoutAmount}
								onChange={(e) => setPayoutAmount(e.target.value)}
								placeholder="0.00"
								pattern="^\d+(\.\d{1,2})?$"
								className="font-mono"
							/>
							<Input
								value={payoutNote}
								onChange={(e) => setPayoutNote(e.target.value)}
								placeholder={t("masterDetail.noteOptional")}
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
								{t("masterDetail.markPaid")}
							</Button>
						</div>
						<details className="text-xs">
							<summary className="cursor-pointer text-muted-foreground">
								{t("masterDetail.transactionsCount", {
									count: masterFinance.data.transactions.length,
								})}
							</summary>
							<div className="mt-2 overflow-hidden rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-[110px]">
												{t("masterDetail.txDate", "Date")}
											</TableHead>
											<TableHead className="w-[140px]">
												{t("masterDetail.txType", "Type")}
											</TableHead>
											<TableHead>{t("masterDetail.txDescription", "Description")}</TableHead>
											<TableHead className="w-[110px] text-right">
												{t("masterDetail.txAmount", "Amount")}
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{masterFinance.data.transactions.length === 0 ? (
											<TableRow>
												<TableCell colSpan={4} className="text-center text-muted-foreground">
													{t("masterDetail.noTransactions", "No transactions yet")}
												</TableCell>
											</TableRow>
										) : (
											masterFinance.data.transactions.slice(0, 30).map((tx) => (
												<TableRow key={tx.id}>
													<TableCell className="text-muted-foreground tabular-nums">
														{new Date(tx.createdAt).toISOString().slice(0, 10)}
													</TableCell>
													<TableCell>
														<Badge variant="outline" className="text-[10px]">
															{t(`transactionType.${tx.type}`, tx.type)}
														</Badge>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{tx.description ?? "—"}
													</TableCell>
													<TableCell
														className={`text-right font-medium tabular-nums ${Number(tx.amount) < 0 ? "text-rose-700" : "text-emerald-700"}`}
													>
														{formatMoney(tx.amount, currency)}
													</TableCell>
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</div>
						</details>
					</>
				)}
			</Card>

			<Card className="space-y-2 p-4">
				<h2 className="text-sm font-semibold">{t("masterDetail.closingPermission")}</h2>
				<p className="text-xs text-muted-foreground">{t("masterDetail.closingPermissionDesc")}</p>
				<Button
					size="sm"
					variant="outline"
					disabled={grantPermission.isPending}
					onClick={() => grantPermission.mutate(true)}
				>
					{t("masterDetail.grant")}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={grantPermission.isPending}
					onClick={() => grantPermission.mutate(false)}
				>
					{t("masterDetail.revoke")}
				</Button>
				{grantPermission.error && (
					<p className="text-xs text-destructive">{(grantPermission.error as Error).message}</p>
				)}
			</Card>

			<Card className="space-y-3 p-4">
				<h2 className="text-sm font-semibold">{t("masterDetail.recentActivity")}</h2>
				{data.recentAssignments.length === 0 && (
					<p className="text-xs text-muted-foreground">{t("masterDetail.noAssignments")}</p>
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
	initial: SpecializationKey[];
	phone: string | null;
	displayName: string;
	onSave: (displayName: string, phone: string | null, specs: SpecializationKey[]) => void;
	pending: boolean;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState(displayName);
	const [phoneVal, setPhoneVal] = useState(phone ?? "");
	const [specs, setSpecs] = useState<SpecializationKey[]>(initial);
	return (
		<div className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto]">
			<Input
				value={name}
				onChange={(e) => setName(e.target.value)}
				placeholder={t("masterDetail.displayNamePh")}
			/>
			<Input
				value={phoneVal}
				onChange={(e) => setPhoneVal(e.target.value)}
				placeholder={t("masterDetail.phonePh")}
			/>
			<SpecializationsPicker
				value={specs}
				options={SPECIALIZATIONS}
				onChange={setSpecs}
				placeholder={t("masterDetail.specsPh")}
				emptyHint={t("common.none")}
			/>
			<Button
				size="sm"
				disabled={pending}
				onClick={() => onSave(name.trim(), phoneVal.trim() || null, specs)}
			>
				{t("common.save")}
			</Button>
		</div>
	);
}
