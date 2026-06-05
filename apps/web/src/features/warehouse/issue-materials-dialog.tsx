import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
import { formatMoney } from "@/lib/format-money";
import { formatNumber } from "@/lib/format-number";
import { useCurrencyCode } from "@/lib/queries/tenant-config";
import { useIssueMaterials, useMaterials } from "@/lib/queries/warehouse";

type Line = { id: string; materialId: string; quantity: string; note: string };

function makeLine(): Line {
	return { id: crypto.randomUUID(), materialId: "", quantity: "", note: "" };
}

type Props = {
	propertyId: string;
	disabled?: boolean;
	trigger?: React.ReactNode;
};

type IssueError = {
	error?: string;
	materialId?: string;
	requested?: string;
	available?: string;
};

export function IssueMaterialsDialog({ propertyId, disabled, trigger }: Props) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [lines, setLines] = useState<Line[]>(() => [makeLine()]);
	const [lineError, setLineError] = useState<{ index: number; message: string } | null>(null);

	const { data: materials } = useMaterials();
	const available = (materials ?? []).filter((m) => !m.archivedAt);
	const issue = useIssueMaterials(propertyId);
	const currency = useCurrencyCode();

	function addLine() {
		setLines((prev) => [...prev, makeLine()]);
	}

	function removeLine(i: number) {
		setLines((prev) => prev.filter((_, idx) => idx !== i));
	}

	function updateLine(i: number, patch: Partial<Line>) {
		setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
	}

	function reset() {
		setLines([makeLine()]);
		setLineError(null);
	}

	function submit(e: React.FormEvent) {
		e.preventDefault();
		setLineError(null);
		const cleaned = lines
			.filter((l) => l.materialId && l.quantity.trim())
			.map((l) => ({
				materialId: l.materialId,
				quantity: l.quantity.trim(),
				note: l.note.trim() || undefined,
			}));
		if (cleaned.length === 0) return;

		issue.mutate(
			{ propertyId, lines: cleaned },
			{
				onSuccess: () => {
					setOpen(false);
					reset();
				},
				onError: (err) => {
					// Best-effort: surface INSUFFICIENT_STOCK on the offending line.
					try {
						const body = JSON.parse((err as Error).message) as IssueError;
						if (body.error === "INSUFFICIENT_STOCK" && body.materialId) {
							const idx = cleaned.findIndex((l) => l.materialId === body.materialId);
							if (idx >= 0) {
								setLineError({
									index: idx,
									message: t("warehouse.insufficientStock", {
										requested: body.requested ?? "?",
										available: body.available ?? "?",
									}),
								});
								return;
							}
						}
					} catch {
						// fall through; render generic error below
					}
				},
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
				disabled={disabled}
				render={
					(trigger as React.ReactElement) ?? (
						<Button size="sm" disabled={disabled}>
							{t("warehouse.issueMaterials")}
						</Button>
					)
				}
			/>
			<DialogContent className="sm:max-w-xl">
				<form onSubmit={submit}>
					<DialogHeader>
						<DialogTitle>{t("warehouse.issueTitle")}</DialogTitle>
						<DialogDescription>{t("warehouse.issueDesc")}</DialogDescription>
					</DialogHeader>
					<div className="my-4 space-y-3">
						{lines.map((line, i) => {
							const sel = available.find((m) => m.id === line.materialId);
							const errOnThisLine = lineError?.index === i ? lineError.message : null;
							return (
								<div
									key={line.id}
									className={`grid grid-cols-[1fr_120px_auto] gap-2 rounded border p-2 ${
										errOnThisLine ? "border-rose-300 bg-rose-50/40" : ""
									}`}
								>
									<div className="space-y-1">
										<Label className="text-xs">{t("warehouse.col.material")}</Label>
										<Select
											value={line.materialId}
											onValueChange={(v) => updateLine(i, { materialId: v ?? "" })}
										>
											<SelectTrigger className="w-full">
												<SelectValue>
													{(v) => {
														const m = available.find((mm) => mm.id === v);
														return m
															? `${m.name} (${formatNumber(m.onHand)} ${t(`warehouse.unit.${m.unit}`, m.unit)})`
															: t("warehouse.selectMaterial");
													}}
												</SelectValue>
											</SelectTrigger>
											<SelectContent>
												{available.map((m) => (
													<SelectItem key={m.id} value={m.id}>
														{m.name} — {formatNumber(m.onHand)}{" "}
														{t(`warehouse.unit.${m.unit}`, m.unit)} @{" "}
														{formatMoney(m.price, currency)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-1">
										<Label className="text-xs">{t("warehouse.col.quantity")}</Label>
										<NumberInput
											value={line.quantity}
											onChange={(e) => updateLine(i, { quantity: e.target.value })}
											pattern="^\d+(\.\d{1,3})?$"
											placeholder="0"
											className="font-mono"
											required
										/>
									</div>
									<div className="flex items-end">
										<button
											type="button"
											onClick={() => removeLine(i)}
											disabled={lines.length === 1}
											className="text-muted-foreground hover:text-rose-700 disabled:opacity-30"
											aria-label={t("common.remove")}
										>
											<Trash2 className="size-4" />
										</button>
									</div>
									<div className="col-span-3 space-y-1">
										<Input
											value={line.note}
											onChange={(e) => updateLine(i, { note: e.target.value })}
											placeholder={t("warehouse.field.lineNotePlaceholder")}
										/>
									</div>
									{sel && line.quantity.trim() && /^\d+(\.\d{1,3})?$/.test(line.quantity) && (
										<div className="col-span-3 text-xs text-muted-foreground">
											{t("warehouse.lineSubtotal", {
												amount: formatMoney(Number(line.quantity) * Number(sel.price), currency),
											})}
										</div>
									)}
									{errOnThisLine && (
										<div className="col-span-3 text-xs text-rose-700">{errOnThisLine}</div>
									)}
								</div>
							);
						})}
						<Button type="button" variant="outline" size="sm" onClick={addLine}>
							{t("warehouse.addLine")}
						</Button>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={issue.isPending}>
							{issue.isPending ? t("common.saving") : t("warehouse.issueMaterials")}
						</Button>
					</DialogFooter>
					{issue.error && !lineError && (
						<p className="mt-2 text-xs text-rose-700">{(issue.error as Error).message}</p>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
