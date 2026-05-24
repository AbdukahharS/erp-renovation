import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	useDeleteMasterProfile,
	useMasterProfiles,
	useUpdateMasterProfile,
	useUpsertMasterProfile,
} from "@/lib/queries/acceptance";

export const Route = createFileRoute("/owner/masters/")({
	component: OwnerMasters,
});

function OwnerMasters() {
	const profiles = useMasterProfiles();
	const upsert = useUpsertMasterProfile();
	const update = useUpdateMasterProfile();
	const del = useDeleteMasterProfile();

	const [form, setForm] = useState({ userId: "", displayName: "", specializations: "" });
	const [createError, setCreateError] = useState<string | null>(null);

	function submit() {
		setCreateError(null);
		const specs = form.specializations
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		upsert.mutate(
			{ userId: form.userId.trim(), displayName: form.displayName.trim(), specializations: specs },
			{
				onSuccess: () => setForm({ userId: "", displayName: "", specializations: "" }),
				onError: (e) => setCreateError((e as Error).message),
			},
		);
	}

	return (
		<section className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold">Masters</h1>
				<p className="text-sm text-muted-foreground">
					Manage the master roster and their specializations. Phase 6 will replace this with
					invite-link onboarding.
				</p>
			</header>

			<Card className="space-y-3 p-4">
				<h2 className="text-sm font-semibold">Add master profile</h2>
				<div className="grid gap-2 md:grid-cols-4">
					<div>
						<Label>User ID</Label>
						<Input
							value={form.userId}
							onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
							placeholder="auth user id"
						/>
					</div>
					<div>
						<Label>Display name</Label>
						<Input
							value={form.displayName}
							onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
							placeholder="Name shown in lists"
						/>
					</div>
					<div className="md:col-span-2">
						<Label>Specializations (comma-separated)</Label>
						<Input
							value={form.specializations}
							onChange={(e) => setForm((f) => ({ ...f, specializations: e.target.value }))}
							placeholder="electrician, tiler"
						/>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<Button onClick={submit} disabled={!form.userId || !form.displayName || upsert.isPending}>
						{upsert.isPending ? "Saving…" : "Add"}
					</Button>
					{createError && <span className="text-xs text-destructive">{createError}</span>}
				</div>
			</Card>

			<div className="space-y-2">
				<h2 className="text-sm font-semibold">Existing</h2>
				{profiles.isLoading && <p className="text-sm text-muted-foreground">loading…</p>}
				{profiles.data?.length === 0 && (
					<p className="text-sm text-muted-foreground">No master profiles yet.</p>
				)}
				<div className="grid gap-2">
					{profiles.data?.map((p) => (
						<MasterProfileRow
							key={p.id}
							profile={p}
							onSave={(displayName, specs) =>
								update.mutate({ id: p.id, displayName, specializations: specs })
							}
							onDelete={() => del.mutate(p.id)}
						/>
					))}
				</div>
			</div>
		</section>
	);
}

function MasterProfileRow({
	profile,
	onSave,
	onDelete,
}: {
	profile: { id: string; userId: string; displayName: string; specializations: string[] };
	onSave: (displayName: string, specs: string[]) => void;
	onDelete: () => void;
}) {
	const [name, setName] = useState(profile.displayName);
	const [specs, setSpecs] = useState(profile.specializations.join(", "));
	const dirty = name !== profile.displayName || specs !== profile.specializations.join(", ");
	return (
		<Card className="grid items-center gap-3 p-3 md:grid-cols-[1fr_1fr_2fr_auto]">
			<div className="text-xs font-mono text-muted-foreground">{profile.userId}</div>
			<Input value={name} onChange={(e) => setName(e.target.value)} />
			<Input value={specs} onChange={(e) => setSpecs(e.target.value)} />
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={!dirty}
					onClick={() =>
						onSave(
							name,
							specs
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean),
						)
					}
				>
					Save
				</Button>
				<Button size="sm" variant="destructive" onClick={onDelete}>
					Delete
				</Button>
			</div>
		</Card>
	);
}
