import { createFileRoute, Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
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
import {
	useAdjustMaterial,
	useMaterial,
	useMaterialMovements,
	useMaterials,
	useRestockMaterial,
	useUpdateMaterial,
} from "@/lib/queries/warehouse";

export const Route = createFileRoute("/owner/warehouse/$materialId")({
	staticData: { crumbKey: "nav.warehouse" },
	component: MaterialDetail,
});

function MaterialDetail() {
	const { t } = useTranslation();
	const { materialId } = Route.useParams();
	const { data: material, isLoading } = useMaterial(materialId);
	const { data: movements } = useMaterialMovements(materialId);

	if (isLoading || !material)
		return <p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>;

	return (
		<section className="space-y-6">
			<header className="space-y-1">
				<div className="text-xs text-muted-foreground">
					<Link to="/owner/warehouse" className="hover:underline">
						{t("warehouse.backToList")}
					</Link>
				</div>
				<div className="flex items-center justify-between">
					<h1 className="text-2xl font-semibold">{material.name}</h1>
					<div className="flex gap-2">
						<EditMaterialDialog
							id={material.id}
							name={material.name}
							price={material.price}
							category={material.category}
						/>
						<RestockDialog id={material.id} />
						<AdjustDialog id={material.id} />
					</div>
				</div>
				<p className="text-sm text-muted-foreground">
					{material.category ?? t("common.em")} ·{" "}
					{t(`warehouse.unit.${material.unit}`, material.unit)} · ${material.price}/{material.unit}
				</p>
			</header>

			<div className="grid gap-3 sm:grid-cols-3">
				<Stat label={t("warehouse.stats.onHand")} value={material.onHand} />
				<Stat label={t("warehouse.stats.price")} value={`$${material.price}`} />
				<Stat
					label={t("warehouse.stats.totalValue")}
					value={`$${(Number(material.onHand) * Number(material.price)).toFixed(2)}`}
				/>
			</div>

			<div className="rounded-lg border">
				<div className="border-b bg-muted/50 px-3 py-2 text-xs uppercase">
					{t("warehouse.movements")}
				</div>
				{!movements ? (
					<div className="p-3">
						<Skeleton className="h-8 w-full" />
					</div>
				) : movements.length === 0 ? (
					<p className="px-3 py-6 text-center text-sm text-muted-foreground">
						{t("warehouse.noMovements")}
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("warehouse.col.date")}</TableHead>
								<TableHead>{t("warehouse.col.type")}</TableHead>
								<TableHead className="text-right">{t("warehouse.col.delta")}</TableHead>
								<TableHead className="text-right">{t("warehouse.col.unitPrice")}</TableHead>
								<TableHead>{t("warehouse.col.reason")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{movements.map((m) => (
								<TableRow key={m.id}>
									<TableCell className="text-xs">
										{new Date(m.createdAt).toISOString().slice(0, 10)}
									</TableCell>
									<TableCell className="text-xs">
										{t(`warehouse.movementType.${m.type}`, m.type)}
									</TableCell>
									<TableCell
										className={`text-right tabular-nums ${
											Number(m.delta) < 0 ? "text-rose-700" : "text-emerald-700"
										}`}
									>
										{Number(m.delta) > 0 ? "+" : ""}
										{m.delta}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{m.unitPriceSnapshot ? `$${m.unitPriceSnapshot}` : t("common.em")}
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{renderReason(m.reason, t)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</div>
		</section>
	);
}

// Map system-generated movement reasons to localized strings. Recognizes both
// the new sentinel format ("system:opening_balance") and legacy literals that
// were written before the sentinel was introduced.
function renderReason(reason: string | null, t: TFunction): string {
	if (!reason) return t("common.em");
	if (reason.startsWith("system:")) {
		return t(`warehouse.systemReason.${reason.slice(7)}`, reason);
	}
	if (reason === "opening balance") return t("warehouse.systemReason.opening_balance", reason);
	if (reason.startsWith("Reversal of issuance ")) return t("warehouse.systemReason.reversal", reason);
	return reason;
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border bg-card p-3">
			<div className="text-[11px] uppercase text-muted-foreground">{label}</div>
			<div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
		</div>
	);
}

function EditMaterialDialog({
	id,
	name: initName,
	price: initPrice,
	category: initCategory,
}: {
	id: string;
	name: string;
	price: string;
	category: string | null;
}) {
	const { t } = useTranslation();
	const { data: materials } = useMaterials();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(initName);
	const [price, setPrice] = useState(initPrice);
	const [category, setCategory] = useState(initCategory ?? "");
	const update = useUpdateMaterial(id);

	const existingCategories = Array.from(
		new Set((materials ?? []).map((m) => m.category).filter((c): c is string => !!c)),
	).sort();

	function submit(e: React.FormEvent) {
		e.preventDefault();
		update.mutate(
			{
				name: name.trim() || undefined,
				price: price.trim() || undefined,
				category: category.trim() ? category.trim() : null,
			},
			{ onSuccess: () => setOpen(false) },
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button variant="outline" size="sm">
						{t("common.edit")}
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={submit}>
					<DialogHeader>
						<DialogTitle>{t("warehouse.editTitle")}</DialogTitle>
					</DialogHeader>
					<div className="my-4 space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="e-name">{t("warehouse.field.name")}</Label>
							<Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="e-category">{t("warehouse.field.categoryOptional")}</Label>
							<Input
								id="e-category"
								value={category}
								onChange={(e) => setCategory(e.target.value)}
								list="material-categories-edit"
								autoComplete="off"
							/>
							<datalist id="material-categories-edit">
								{existingCategories.map((c) => (
									<option key={c} value={c} />
								))}
							</datalist>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="e-price">{t("warehouse.field.price")}</Label>
							<Input
								id="e-price"
								value={price}
								onChange={(e) => setPrice(e.target.value)}
								pattern="^\d+(\.\d{1,2})?$"
								className="font-mono"
							/>
							<p className="text-xs text-muted-foreground">{t("warehouse.field.priceEditHelp")}</p>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={update.isPending}>
							{update.isPending ? t("common.saving") : t("common.save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function RestockDialog({ id }: { id: string }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [quantity, setQuantity] = useState("");
	const [unitPrice, setUnitPrice] = useState("");
	const [note, setNote] = useState("");
	const restock = useRestockMaterial(id);

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!quantity.trim()) return;
		restock.mutate(
			{
				quantity: quantity.trim(),
				unitPrice: unitPrice.trim() || undefined,
				note: note.trim() || undefined,
			},
			{
				onSuccess: () => {
					setOpen(false);
					setQuantity("");
					setUnitPrice("");
					setNote("");
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button size="sm">{t("warehouse.restock")}</Button>} />
			<DialogContent>
				<form onSubmit={submit}>
					<DialogHeader>
						<DialogTitle>{t("warehouse.restockTitle")}</DialogTitle>
					</DialogHeader>
					<div className="my-4 space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="r-qty">{t("warehouse.field.quantity")}</Label>
							<Input
								id="r-qty"
								value={quantity}
								onChange={(e) => setQuantity(e.target.value)}
								pattern="^\d+(\.\d{1,3})?$"
								className="font-mono"
								required
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="r-price">{t("warehouse.field.unitPriceOptional")}</Label>
							<Input
								id="r-price"
								value={unitPrice}
								onChange={(e) => setUnitPrice(e.target.value)}
								pattern="^\d+(\.\d{1,2})?$"
								className="font-mono"
							/>
							<p className="text-xs text-muted-foreground">{t("warehouse.field.unitPriceHelp")}</p>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="r-note">{t("warehouse.field.noteOptional")}</Label>
							<Input id="r-note" value={note} onChange={(e) => setNote(e.target.value)} />
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={restock.isPending || !quantity.trim()}>
							{restock.isPending ? t("common.saving") : t("warehouse.restock")}
						</Button>
					</DialogFooter>
					{restock.error && (
						<p className="mt-2 text-xs text-rose-700">{(restock.error as Error).message}</p>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}

function AdjustDialog({ id }: { id: string }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [delta, setDelta] = useState("");
	const [reason, setReason] = useState("");
	const adjust = useAdjustMaterial(id);

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!delta.trim() || !reason.trim()) return;
		adjust.mutate(
			{ delta: delta.trim(), reason: reason.trim() },
			{
				onSuccess: () => {
					setOpen(false);
					setDelta("");
					setReason("");
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button variant="outline" size="sm">
						{t("warehouse.adjust")}
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={submit}>
					<DialogHeader>
						<DialogTitle>{t("warehouse.adjustTitle")}</DialogTitle>
					</DialogHeader>
					<div className="my-4 space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="a-delta">{t("warehouse.field.delta")}</Label>
							<Input
								id="a-delta"
								value={delta}
								onChange={(e) => setDelta(e.target.value)}
								pattern="^-?\d+(\.\d{1,3})?$"
								placeholder="e.g. -2 or 5"
								className="font-mono"
								required
							/>
							<p className="text-xs text-muted-foreground">{t("warehouse.field.deltaHelp")}</p>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="a-reason">{t("warehouse.field.reason")}</Label>
							<Input
								id="a-reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								required
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={adjust.isPending || !delta.trim() || !reason.trim()}>
							{adjust.isPending ? t("common.saving") : t("warehouse.adjust")}
						</Button>
					</DialogFooter>
					{adjust.error && (
						<p className="mt-2 text-xs text-rose-700">{(adjust.error as Error).message}</p>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
