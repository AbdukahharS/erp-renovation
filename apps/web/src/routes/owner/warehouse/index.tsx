import { type FolderRow, type MaterialUnit, z } from "@repo/validators";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderIcon, FolderPlus, PackageIcon, Pencil, Plus, Trash2 } from "lucide-react";
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
import { NumberInput } from "@/components/ui/number-input";
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
import { formatMoney } from "@/lib/format-money";
import { formatNumber } from "@/lib/format-number";
import { useCurrencyCode } from "@/lib/queries/tenant-config";
import {
	useArchiveFolder,
	useArchiveMaterial,
	useCreateFolder,
	useCreateMaterial,
	useFolders,
	useMaterials,
	useRenameFolder,
} from "@/lib/queries/warehouse";

const searchSchema = z.object({
	folder: z.string().optional(),
});

export const Route = createFileRoute("/owner/warehouse/")({
	staticData: { crumbKey: "nav.warehouse" },
	validateSearch: searchSchema,
	component: WarehouseList,
});

const UNITS: MaterialUnit[] = ["pcs", "m", "m2", "m3", "kg", "l"];

type FolderSelection = "all" | "unfiled" | { id: string };

function parseSelection(s: string | undefined): FolderSelection {
	if (!s || s === "all") return "all";
	if (s === "unfiled") return "unfiled";
	return { id: s };
}

function selectionToParam(sel: FolderSelection): string | undefined {
	if (sel === "all") return undefined;
	if (sel === "unfiled") return "unfiled";
	return sel.id;
}

function WarehouseList() {
	const { t } = useTranslation();
	const { data: materials, isLoading } = useMaterials();
	const { data: folders } = useFolders();
	const archive = useArchiveMaterial();
	const currency = useCurrencyCode();

	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const selection = parseSelection(search.folder);

	const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);

	function setSelection(next: FolderSelection) {
		navigate({ search: { folder: selectionToParam(next) } });
	}

	const all = materials ?? [];
	const unfiledCount = all.filter((m) => !m.folderId).length;

	const filtered = all.filter((m) => {
		if (selection === "all") return true;
		if (selection === "unfiled") return !m.folderId;
		return m.folderId === selection.id;
	});

	const selectedFolder =
		typeof selection === "object" ? (folders ?? []).find((f) => f.id === selection.id) : null;

	const headerTitle =
		selection === "all"
			? t("warehouse.folders.all")
			: selection === "unfiled"
				? t("warehouse.folders.unfiled")
				: (selectedFolder?.name ?? t("warehouse.folders.unknown"));

	return (
		<div className="space-y-4">
			<PageHeader
				title={t("warehouse.title")}
				description={t("warehouse.description")}
				actions={<CreateMaterialDialog initialFolderId={selectedFolder?.id ?? null} />}
			/>

			<div className="grid gap-4 lg:grid-cols-[240px_1fr]">
				<FolderSidebar
					folders={folders ?? []}
					totalCount={all.length}
					unfiledCount={unfiledCount}
					selection={selection}
					onSelect={setSelection}
				/>

				<div className="min-w-0 space-y-2">
					<div className="flex items-baseline justify-between">
						<h2 className="text-lg font-semibold">{headerTitle}</h2>
						<p className="text-xs text-muted-foreground">
							{t("warehouse.folders.itemCount", { count: filtered.length })}
						</p>
					</div>

					{isLoading ? (
						<div className="space-y-2 rounded-lg border bg-card p-4">
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
						</div>
					) : all.length === 0 ? (
						<EmptyState
							icon={PackageIcon}
							title={t("warehouse.emptyTitle")}
							description={t("warehouse.emptyDescription")}
						/>
					) : filtered.length === 0 ? (
						<EmptyState
							icon={FolderIcon}
							title={t("warehouse.folders.emptyFolderTitle")}
							description={t("warehouse.folders.emptyFolderDescription")}
						/>
					) : (
						<div className="rounded-lg border bg-card">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t("warehouse.columns.name")}</TableHead>
										<TableHead className="text-right">{t("warehouse.columns.onHand")}</TableHead>
										<TableHead>{t("warehouse.columns.unit")}</TableHead>
										<TableHead className="text-right">{t("warehouse.columns.price")}</TableHead>
										<TableHead className="text-right">{t("warehouse.columns.value")}</TableHead>
										<TableHead></TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filtered.map((m) => {
										const value = Number(m.onHand) * Number(m.price);
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
												<TableCell className="text-right tabular-nums">
													{formatNumber(m.onHand)}
												</TableCell>
												<TableCell className="text-xs">
													{t(`warehouse.unit.${m.unit}`, m.unit)}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{formatMoney(m.price, currency)}
												</TableCell>
												<TableCell className="text-right tabular-nums font-medium">
													{formatMoney(value, currency)}
												</TableCell>
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
				</div>
			</div>

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

function FolderSidebar({
	folders,
	totalCount,
	unfiledCount,
	selection,
	onSelect,
}: {
	folders: FolderRow[];
	totalCount: number;
	unfiledCount: number;
	selection: FolderSelection;
	onSelect: (next: FolderSelection) => void;
}) {
	const { t } = useTranslation();
	const [renameTarget, setRenameTarget] = useState<FolderRow | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<FolderRow | null>(null);

	const isAllSelected = selection === "all";
	const isUnfiledSelected = selection === "unfiled";
	const selectedId = typeof selection === "object" ? selection.id : null;

	return (
		<aside className="space-y-2 self-start rounded-lg border bg-card p-2 lg:sticky lg:top-4">
			<SidebarRow
				label={t("warehouse.folders.all")}
				count={totalCount}
				active={isAllSelected}
				onClick={() => onSelect("all")}
				icon={<PackageIcon className="size-4" />}
			/>
			<SidebarRow
				label={t("warehouse.folders.unfiled")}
				count={unfiledCount}
				active={isUnfiledSelected}
				onClick={() => onSelect("unfiled")}
				icon={<FolderIcon className="size-4 text-muted-foreground" />}
			/>
			<div className="my-2 border-t" />
			{folders.length === 0 ? (
				<p className="px-2 py-1 text-xs text-muted-foreground">
					{t("warehouse.folders.emptyList")}
				</p>
			) : (
				folders.map((f) => (
					<SidebarRow
						key={f.id}
						label={f.name}
						count={f.materialCount}
						active={selectedId === f.id}
						onClick={() => onSelect({ id: f.id })}
						icon={<FolderIcon className="size-4" />}
						onRename={() => setRenameTarget(f)}
						onDelete={() => setDeleteTarget(f)}
						deleteDisabled={f.materialCount > 0}
					/>
				))
			)}
			<div className="border-t pt-2">
				<CreateFolderDialog />
			</div>

			<RenameFolderDialog
				folder={renameTarget}
				onClose={() => setRenameTarget(null)}
				existingNames={folders.map((f) => f.name)}
			/>
			<DeleteFolderAlert folder={deleteTarget} onClose={() => setDeleteTarget(null)} />
		</aside>
	);
}

function SidebarRow({
	label,
	count,
	active,
	onClick,
	icon,
	onRename,
	onDelete,
	deleteDisabled,
}: {
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	onRename?: () => void;
	onDelete?: () => void;
	deleteDisabled?: boolean;
}) {
	const { t } = useTranslation();
	return (
		<div
			className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
				active ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
			}`}
		>
			<button
				type="button"
				onClick={onClick}
				className="flex flex-1 items-center gap-2 truncate text-left"
			>
				{icon}
				<span className="truncate">{label}</span>
				<span className="ml-auto text-xs text-muted-foreground tabular-nums">{count}</span>
			</button>
			{(onRename || onDelete) && (
				<div className="ml-1 flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
					{onRename && (
						<button
							type="button"
							onClick={onRename}
							className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
							aria-label={t("warehouse.folders.rename")}
							title={t("warehouse.folders.rename")}
						>
							<Pencil className="size-3.5" />
						</button>
					)}
					{onDelete && (
						<button
							type="button"
							onClick={onDelete}
							disabled={deleteDisabled}
							className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
							aria-label={t("warehouse.folders.delete")}
							title={
								deleteDisabled
									? t("warehouse.folders.deleteBlockedHasMaterials")
									: t("warehouse.folders.delete")
							}
						>
							<Trash2 className="size-3.5" />
						</button>
					)}
				</div>
			)}
		</div>
	);
}

function CreateFolderDialog() {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const create = useCreateFolder();

	function submit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		create.mutate(
			{ name: trimmed },
			{
				onSuccess: () => {
					toast.success(t("warehouse.folders.created", { name: trimmed }));
					setName("");
					setOpen(false);
				},
				onError: (e: Error) => toast.error(e.message),
			},
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setName("");
			}}
		>
			<DialogTrigger
				render={
					<Button variant="ghost" size="sm" className="w-full justify-start gap-2">
						<FolderPlus className="size-4" />
						{t("warehouse.folders.new")}
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={submit}>
					<DialogHeader>
						<DialogTitle>{t("warehouse.folders.newTitle")}</DialogTitle>
					</DialogHeader>
					<div className="my-4 space-y-1.5">
						<Label htmlFor="folder-name">{t("warehouse.folders.nameLabel")}</Label>
						<Input
							id="folder-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoFocus
							required
							maxLength={100}
						/>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={create.isPending || !name.trim()}>
							{create.isPending ? t("common.saving") : t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function RenameFolderDialog({
	folder,
	onClose,
	existingNames,
}: {
	folder: FolderRow | null;
	onClose: () => void;
	existingNames: string[];
}) {
	const { t } = useTranslation();
	const [name, setName] = useState(folder?.name ?? "");
	const rename = useRenameFolder();

	// Sync name when folder changes
	if (folder && name === "" && folder.name !== "") setName(folder.name);

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!folder) return;
		const trimmed = name.trim();
		if (!trimmed) return;
		if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase() && n !== folder.name)) {
			toast.error(t("warehouse.folders.nameTaken"));
			return;
		}
		rename.mutate(
			{ id: folder.id, input: { name: trimmed } },
			{
				onSuccess: () => {
					toast.success(t("warehouse.folders.renamed", { name: trimmed }));
					onClose();
					setName("");
				},
				onError: (e: Error) => toast.error(e.message),
			},
		);
	}

	return (
		<Dialog
			open={!!folder}
			onOpenChange={(o) => {
				if (!o) {
					onClose();
					setName("");
				}
			}}
		>
			<DialogContent>
				<form onSubmit={submit}>
					<DialogHeader>
						<DialogTitle>{t("warehouse.folders.renameTitle")}</DialogTitle>
					</DialogHeader>
					<div className="my-4 space-y-1.5">
						<Label htmlFor="folder-rename">{t("warehouse.folders.nameLabel")}</Label>
						<Input
							id="folder-rename"
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoFocus
							required
							maxLength={100}
						/>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={rename.isPending || !name.trim()}>
							{rename.isPending ? t("common.saving") : t("common.save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeleteFolderAlert({ folder, onClose }: { folder: FolderRow | null; onClose: () => void }) {
	const { t } = useTranslation();
	const archive = useArchiveFolder();
	return (
		<AlertDialog open={!!folder} onOpenChange={(o) => !o && onClose()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("warehouse.folders.deleteTitle", { name: folder?.name ?? "" })}
					</AlertDialogTitle>
					<AlertDialogDescription>{t("warehouse.folders.confirmDelete")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button variant="outline" onClick={onClose}>
						{t("common.cancel")}
					</Button>
					<Button
						variant="destructive"
						onClick={() => {
							if (!folder) return;
							archive.mutate(folder.id, {
								onSuccess: () => {
									toast.success(t("warehouse.folders.deleted", { name: folder.name }));
									onClose();
								},
								onError: (e: Error) => toast.error(e.message),
							});
						}}
						disabled={archive.isPending}
					>
						{archive.isPending ? t("common.saving") : t("warehouse.folders.delete")}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function CreateMaterialDialog({ initialFolderId }: { initialFolderId: string | null }) {
	const { t } = useTranslation();
	const { data: folders } = useFolders();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [folderId, setFolderId] = useState<string>(initialFolderId ?? "");
	const [unit, setUnit] = useState<MaterialUnit>("pcs");
	const [price, setPrice] = useState("");
	const [initialQuantity, setInitialQuantity] = useState("");
	const create = useCreateMaterial();

	function reset() {
		setName("");
		setFolderId(initialFolderId ?? "");
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
				folderId: folderId || null,
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
							<Label htmlFor="m-folder">{t("warehouse.field.folder")}</Label>
							<Select value={folderId} onValueChange={(v) => setFolderId(v ?? "")}>
								<SelectTrigger className="w-full" id="m-folder">
									<SelectValue>
										{(v) => {
											if (!v) return t("warehouse.folders.unfiled");
											const f = (folders ?? []).find((ff) => ff.id === v);
											return f?.name ?? t("warehouse.folders.unfiled");
										}}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="">{t("warehouse.folders.unfiled")}</SelectItem>
									{(folders ?? []).map((f) => (
										<SelectItem key={f.id} value={f.id}>
											{f.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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
								<NumberInput
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
							<NumberInput
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
