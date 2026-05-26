import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiBaseUrl } from "@/lib/api";

export const Route = createFileRoute("/_admin/tenants")({
	component: AdminTenants,
});

interface TenantRow {
	id: string;
	name: string;
	slug: string;
	schemaName: string;
	status: "ACTIVE" | "SUSPENDED";
	createdAt: string;
	deletedAt: string | null;
	currencyCode: string | null;
}

async function adminFetch(path: string, init?: RequestInit) {
	const res = await fetch(`${apiBaseUrl}${path}`, {
		credentials: "include",
		headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
		...init,
	});
	if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
	return res.json();
}

function AdminTenants() {
	const qc = useQueryClient();
	const { data: tenants } = useQuery<TenantRow[]>({
		queryKey: ["admin-tenants"],
		queryFn: () => adminFetch("/admin/tenants"),
	});

	const [draft, setDraft] = useState({
		name: "",
		slug: "",
		ownerEmail: "",
		ownerName: "",
		ownerPassword: "",
	});

	const create = useMutation({
		mutationFn: (body: typeof draft) =>
			adminFetch("/admin/tenants", { method: "POST", body: JSON.stringify(body) }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["admin-tenants"] });
			setDraft({ name: "", slug: "", ownerEmail: "", ownerName: "", ownerPassword: "" });
		},
	});

	const suspend = useMutation({
		mutationFn: (id: string) => adminFetch(`/admin/tenants/${id}/suspend`, { method: "POST" }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tenants"] }),
	});
	const resume = useMutation({
		mutationFn: (id: string) => adminFetch(`/admin/tenants/${id}/resume`, { method: "POST" }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tenants"] }),
	});

	return (
		<section className="space-y-8 max-w-4xl">
			<header>
				<h1 className="text-2xl font-semibold">Tenants</h1>
				<p className="text-sm text-muted-foreground">Provision, suspend, resume.</p>
			</header>

			<div className="border rounded-md divide-y">
				{tenants?.map((t) => (
					<div key={t.id} className="px-4 py-3 flex items-center justify-between">
						<div>
							<div className="text-sm font-medium">
								{t.name} <span className="text-xs text-muted-foreground">({t.slug})</span>
							</div>
							<div className="text-xs text-muted-foreground">
								{t.schemaName} · {t.currencyCode ?? "USD"} · {t.status}
							</div>
						</div>
						<div className="flex gap-2">
							{t.status === "ACTIVE" ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => suspend.mutate(t.id)}
									disabled={suspend.isPending}
								>
									Suspend
								</Button>
							) : (
								<Button
									variant="outline"
									size="sm"
									onClick={() => resume.mutate(t.id)}
									disabled={resume.isPending}
								>
									Resume
								</Button>
							)}
							<a
								href={`${apiBaseUrl}/admin/tenants/${t.id}/export`}
								className="text-sm underline self-center"
							>
								Export
							</a>
						</div>
					</div>
				))}
				{!tenants?.length ? (
					<div className="px-4 py-6 text-sm text-muted-foreground">No tenants yet.</div>
				) : null}
			</div>

			<form
				className="space-y-3 border rounded-md p-4"
				onSubmit={(e) => {
					e.preventDefault();
					create.mutate(draft);
				}}
			>
				<h2 className="text-sm font-semibold">Provision new tenant</h2>
				{(
					[
						["name", "Name"],
						["slug", "Slug (a-z0-9-)"],
						["ownerEmail", "Owner email"],
						["ownerName", "Owner name"],
						["ownerPassword", "Owner password (≥12 chars)"],
					] as const
				).map(([k, label]) => (
					<div key={k} className="space-y-1">
						<Label htmlFor={k}>{label}</Label>
						<Input
							id={k}
							type={k === "ownerPassword" ? "password" : "text"}
							value={draft[k]}
							onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
						/>
					</div>
				))}
				<Button type="submit" disabled={create.isPending}>
					{create.isPending ? "Provisioning…" : "Provision"}
				</Button>
				{create.isError ? (
					<p className="text-xs text-destructive">{(create.error as Error).message}</p>
				) : null}
			</form>
		</section>
	);
}
