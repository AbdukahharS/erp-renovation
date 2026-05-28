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

function CreateTemplateDialog() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { data: templates } = useTemplatesList();
	const defaultTemplate = templates?.find((tpl) => tpl.isDefault);
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [mode, setMode] = useState<"blank" | "default">("blank");
	const create = useCreateTemplate();

	const reset = () => {
		setName("");
		setMode("blank");
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		create.mutate(
			{
				name: trimmed,
				cloneFromTemplateId: mode === "default" && defaultTemplate ? defaultTemplate.id : undefined,
			},
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
							<label
								className={`flex items-start gap-2 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-muted/30 ${
									defaultTemplate
										? "cursor-pointer hover:bg-muted/50"
										: "cursor-not-allowed opacity-50"
								}`}
							>
								<input
									type="radio"
									name="create-mode"
									value="default"
									checked={mode === "default"}
									onChange={() => setMode("default")}
									disabled={!defaultTemplate}
									className="mt-0.5"
								/>
								<div className="space-y-0.5">
									<div className="text-sm font-medium">{t("templates.createFromDefault")}</div>
									<div className="text-xs text-muted-foreground">
										{defaultTemplate
											? t("templates.createFromDefaultDesc")
											: t("templates.createFromDefaultUnavailable")}
									</div>
								</div>
							</label>
						</fieldset>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={!name.trim() || create.isPending}>
							{create.isPending ? t("templates.creating") : t("templates.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
