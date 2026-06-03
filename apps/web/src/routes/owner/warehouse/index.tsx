import type { MaterialUnit } from "@repo/validators";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PackageIcon, Plus } from "lucide-react";
import { useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useArchiveMaterial, useCreateMaterial, useMaterials } from "@/lib/queries/warehouse";

export const Route = createFileRoute("/owner/warehouse/")({
	staticData: { crumbKey: "nav.warehouse" },
	component: WarehouseList,
});

const UNITS: MaterialUnit[] = ["pcs", "m", "m2", "m3", "kg", "l"];

function WarehouseList() {
	const { t } = useTranslation();
	const { data, isLoading } = useMaterials();
	const archive = useArchiveMaterial();

	const [categoryFilter, setCategoryFilter] = useState<string>("");
	const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);

	const categories = Array.from(
		new Set((data ?? []).map((m) => m.category).filter((c): c is string => !!c)),
	).sort();

	const filtered = (data ?? []).filter((m) =>
		categoryFilter ? m.category === categoryFilter : true,
	);

	return (
		<div className="space-y-4">
			<PageHeader
				title={t("warehouse.title")}
				description={t("warehouse.description")}
				actions={<CreateMaterialDialog />}
			/>

			{categories.length > 0 && (
				<div className="flex flex-wrap gap-2 text-xs">
					<button
						type="button"
						onClick={() => setCategoryFilter("")}
						className={`rounded-full border px-3 py-1 ${
							categoryFilter === "" ? "border-foreground bg-foreground text-background" : ""
						}`}
					>
						{t("warehouse.allCategories")}
					</button>
					{categories.map((c) => (
						<button
							key={c}
							type="button"
							onClick={() => setCategoryFilter(c)}
							className={`rounded-full border px-3 py-1 ${
								categoryFilter === c ? "border-foreground bg-foreground text-background" : ""
							}`}
						>
							{c}
						</button>
					))}
				</div>
			)}

			{isLoading ? (
				<div className="space-y-2 rounded-lg border bg-card p-4">
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
				</div>
			) : !data || data.length === 0 ? (
				<EmptyState
					icon={PackageIcon}
					title={t("warehouse.emptyTitle")}
					description={t("warehouse.emptyDescription")}
				/>
			) : (
				<div className="rounded-lg border bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("warehouse.columns.name")}</TableHead>
								<TableHead>{t("warehouse.columns.category")}</TableHead>
								<TableHead>{t("warehouse.columns.unit")}</TableHead>
								<TableHead className="text-right">{t("warehouse.columns.onHand")}</TableHead>
								<TableHead className="text-right">{t("warehouse.columns.price")}</TableHead>
								<TableHead className="text-right">{t("warehouse.columns.value")}</TableHead>
								<TableHead></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.map((m) => {
								const value = (Number(m.onHand) * Number(m.price)).toFixed(2);
								return (
									<TableRow key={m.id}>
										<TableCell className="font-medium">
											<Link
												to="/owner/warehouse/$materialId"
												params={{ materialId: m.id }}
												className="hover:underline"
											>
												{m.name}
											</Link>
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{m.category ?? t("common.em")}
										</TableCell>
										<TableCell className="text-xs">
											{t(`warehouse.unit.${m.unit}`, m.unit)}
										</TableCell>
										<TableCell className="text-right tabular-nums">{m.onHand}</TableCell>
										<TableCell className="text-right tabular-nums">${m.price}</TableCell>
										<TableCell className="text-right tabular-nums font-medium">${value}</TableCell>
										<TableCell className="text-right">
											<button
												type="button"
												onClick={() => {
													if (Number(m.onHand) !== 0) {
														toast.error(t("warehouse.archiveBlockedStock"));
														return;
													}
													setArchiveTarget({ id: m.id, name: m.name });
												}}
												className="text-xs underline text-muted-foreground hover:text-foreground"
											>
												{t("warehouse.archive")}
											</button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			<AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("warehouse.archiveTitle", { name: archiveTarget?.name ?? "" })}
						</AlertDialogTitle>
						<AlertDialogDescription>{t("warehouse.archiveConfirmDesc")}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<Button variant="outline" onClick={() => setArchiveTarget(null)}>
							{t("common.cancel")}
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (!archiveTarget) return;
								archive.mutate(archiveTarget.id, {
									onSuccess: () => {
										toast.success(t("warehouse.archived", { name: archiveTarget.name }));
										setArchiveTarget(null);
									},
									onError: (e: Error) => toast.error(e.message),
								});
							}}
							disabled={archive.isPending}
						>
							{archive.isPending ? t("common.saving") : t("warehouse.archive")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function CreateMaterialDialog() {
	const { t } = useTranslation();
	const { data: materials } = useMaterials();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [category, setCategory] = useState("");
	const [unit, setUnit] = useState<MaterialUnit>("pcs");
	const [price, setPrice] = useState("");
	const [initialQuantity, setInitialQuantity] = useState("");
	const create = useCreateMaterial();

	const existingCategories = Array.from(
		new Set((materials ?? []).map((m) => m.category).filter((c): c is string => !!c)),
	).sort();

	function reset() {
		setName("");
		setCategory("");
		setUnit("pcs");
		setPrice("");
		setInitialQuantity("");
	}

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim() || !price.trim()) return;
		create.mutate(
			{
				name: name.trim(),
				category: category.trim() || undefined,
				unit,
				price: price.trim(),
				initialQuantity: initialQuantity.trim() || undefined,
			},
			{
				onSuccess: () => {
					setOpen(false);
					reset();
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
				render={
					<Button size="sm">
						<Plus className="size-4" />
						{t("warehouse.addMaterial")}
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={submit}>
					<DialogHeader>
						<DialogTitle>{t("warehouse.addMaterialTitle")}</DialogTitle>
						<DialogDescription>{t("warehouse.addMaterialDesc")}</DialogDescription>
					</DialogHeader>
					<div className="my-4 space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="m-name">{t("warehouse.field.name")}</Label>
							<Input
								id="m-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoFocus
								required
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="m-category">{t("warehouse.field.categoryOptional")}</Label>
							<Input
								id="m-category"
								value={category}
								onChange={(e) => setCategory(e.target.value)}
								placeholder={t("warehouse.field.categoryPlaceholder")}
								list="material-categories"
								autoComplete="off"
							/>
							<datalist id="material-categories">
								{existingCategories.map((c) => (
									<option key={c} value={c} />
								))}
							</datalist>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label htmlFor="m-unit">{t("warehouse.field.unit")}</Label>
								<Select value={unit} onValueChange={(v) => setUnit(v as MaterialUnit)}>
									<SelectTrigger className="w-full" id="m-unit">
										<SelectValue>
											{(v) => (v ? t(`warehouse.unit.${v}`, String(v)) : "")}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{UNITS.map((u) => (
											<SelectItem key={u} value={u}>
												{t(`warehouse.unit.${u}`, u)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="m-price">{t("warehouse.field.price")}</Label>
								<Input
									id="m-price"
									value={price}
									onChange={(e) => setPrice(e.target.value)}
									pattern="^\d+(\.\d{1,2})?$"
									placeholder="0.00"
									className="font-mono"
									required
								/>
							</div>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="m-init">{t("warehouse.field.initialQuantity")}</Label>
							<Input
								id="m-init"
								value={initialQuantity}
								onChange={(e) => setInitialQuantity(e.target.value)}
								pattern="^\d+(\.\d{1,3})?$"
								placeholder="0"
								className="font-mono"
							/>
							<p className="text-xs text-muted-foreground">
								{t("warehouse.field.initialQuantityHelp")}
							</p>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={create.isPending || !name.trim() || !price.trim()}>
							{create.isPending ? t("common.saving") : t("common.create")}
						</Button>
					</DialogFooter>
					{create.error && (
						<p className="mt-2 text-xs text-rose-700">{(create.error as Error).message}</p>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
