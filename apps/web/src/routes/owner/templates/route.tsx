import type { CreateTemplateSource, DefaultTemplateLocale } from "@repo/validators";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useCreateTemplate, useTemplatesList } from "@/lib/queries/templates";

export const Route = createFileRoute("/owner/templates")({
	staticData: { crumbKey: "nav.templates" },
	component: TemplatesShell,
});

function TemplatesShell() {
	const { t } = useTranslation();
	const { data: templates, isLoading } = useTemplatesList();
	return (
		<div className="grid grid-cols-[220px_1fr] gap-6">
			<aside className="space-y-2">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
						{t("templates.sidebarTitle")}
					</h2>
					<CreateTemplateDialog />
				</div>
				{isLoading && <p className="text-xs text-muted-foreground">loading…</p>}
				<ul className="space-y-1">
					{(templates ?? []).map((tpl) => (
						<li key={tpl.id}>
							<Link
								to="/owner/templates/$templateId"
								params={{ templateId: tpl.id }}
								className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted [&.active]:bg-muted [&.active]:font-medium"
								activeProps={{ className: "active" }}
							>
								{tpl.name}
								{tpl.isDefault && (
									<span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary">
										{t("templates.defaultBadge")}
									</span>
								)}
							</Link>
						</li>
					))}
				</ul>
			</aside>
			<section>
				<Outlet />
			</section>
		</div>
	);
}

type SourceMode = "blank" | "erp-default" | "clone";

function CreateTemplateDialog() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { data: templates } = useTemplatesList();
	const cloneCandidates = templates ?? [];
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [mode, setMode] = useState<SourceMode>("erp-default");
	const [locale, setLocale] = useState<DefaultTemplateLocale>("en");
	const [cloneId, setCloneId] = useState<string>("");
	const create = useCreateTemplate();

	const reset = () => {
		setName("");
		setMode("erp-default");
		setLocale("en");
		setCloneId("");
	};

	const buildSource = (): CreateTemplateSource | null => {
		if (mode === "blank") return { type: "blank" };
		if (mode === "erp-default") return { type: "erp-default", locale };
		if (mode === "clone" && cloneId) return { type: "clone", templateId: cloneId };
		return null;
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		const source = buildSource();
		if (!source) return;
		create.mutate(
			{ name: trimmed, source },
			{
				onSuccess: (tpl) => {
					setOpen(false);
					reset();
					if (tpl?.id) {
						navigate({ to: "/owner/templates/$templateId", params: { templateId: tpl.id } });
					}
				},
			},
		);
	};

	const canSubmit = !!name.trim() && !create.isPending && (mode !== "clone" || !!cloneId);

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
					<Button
						size="icon"
						variant="ghost"
						className="size-7"
						aria-label={t("templates.createAria")}
					>
						<Plus className="size-4" />
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>{t("templates.createTitle")}</DialogTitle>
						<DialogDescription>{t("templates.createDesc")}</DialogDescription>
					</DialogHeader>
					<div className="my-4 space-y-4">
						<div className="space-y-2">
							<Label htmlFor="new-template-name">{t("templates.fieldName")}</Label>
							<Input
								id="new-template-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={t("templates.createNamePlaceholder")}
								autoFocus
							/>
						</div>
						<fieldset className="space-y-2">
							<legend className="text-sm font-medium">{t("templates.createStartFrom")}</legend>

							<label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-muted/30">
								<input
									type="radio"
									name="create-mode"
									value="blank"
									checked={mode === "blank"}
									onChange={() => setMode("blank")}
									className="mt-0.5"
								/>
								<div className="space-y-0.5">
									<div className="text-sm font-medium">{t("templates.createBlank")}</div>
									<div className="text-xs text-muted-foreground">
										{t("templates.createBlankDesc")}
									</div>
								</div>
							</label>

							<label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-muted/30">
								<input
									type="radio"
									name="create-mode"
									value="erp-default"
									checked={mode === "erp-default"}
									onChange={() => setMode("erp-default")}
									className="mt-0.5"
								/>
								<div className="flex-1 space-y-2">
									<div>
										<div className="text-sm font-medium">{t("templates.createFromErp")}</div>
										<div className="text-xs text-muted-foreground">
											{t("templates.createFromErpDesc")}
										</div>
									</div>
									{mode === "erp-default" && (
										<div className="space-y-1">
											<Label className="text-xs">{t("templates.createLocaleLabel")}</Label>
											<Select
												value={locale}
												onValueChange={(v) => setLocale(v as DefaultTemplateLocale)}
											>
												<SelectTrigger className="h-8 text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="en">{t("templates.locale.en")}</SelectItem>
													<SelectItem value="ru">{t("templates.locale.ru")}</SelectItem>
													<SelectItem value="uz">{t("templates.locale.uz")}</SelectItem>
												</SelectContent>
											</Select>
										</div>
									)}
								</div>
							</label>

							{cloneCandidates.length > 0 && (
								<label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-muted/30">
									<input
										type="radio"
										name="create-mode"
										value="clone"
										checked={mode === "clone"}
										onChange={() => setMode("clone")}
										className="mt-0.5"
									/>
									<div className="flex-1 space-y-2">
										<div>
											<div className="text-sm font-medium">{t("templates.createClone")}</div>
											<div className="text-xs text-muted-foreground">
												{t("templates.createCloneDesc")}
											</div>
										</div>
										{mode === "clone" && (
											<Select value={cloneId} onValueChange={(v) => setCloneId(v ?? "")}>
												<SelectTrigger className="h-8 text-xs">
													<SelectValue placeholder={t("templates.createClonePlaceholder")} />
												</SelectTrigger>
												<SelectContent>
													{cloneCandidates.map((c) => (
														<SelectItem key={c.id} value={c.id}>
															{c.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										)}
									</div>
								</label>
							)}
						</fieldset>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={!canSubmit}>
							{create.isPending ? t("templates.creating") : t("templates.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
