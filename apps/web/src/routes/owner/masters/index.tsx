import type { Role } from "@repo/validators";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	useCreateInvitation,
	useInvitations,
	useMasters,
	useRevokeInvitation,
} from "@/lib/queries/hr";

export const Route = createFileRoute("/owner/masters/")({
	component: OwnerMasters,
});

function inviteUrl(token: string) {
	return `${window.location.origin}/invite/${token}`;
}

function OwnerMasters() {
	const invitations = useInvitations();
	const masters = useMasters();
	const create = useCreateInvitation();
	const revoke = useRevokeInvitation();

	const [role, setRole] = useState<Role>("MASTER");
	const [email, setEmail] = useState("");
	const [days, setDays] = useState(14);
	const [lastLink, setLastLink] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	function submit() {
		setError(null);
		create.mutate(
			{ role, email: email.trim() || undefined, expiresInDays: days },
			{
				onSuccess: (row) => {
					setLastLink(inviteUrl(row.token));
					setEmail("");
				},
				onError: (e) => setError((e as Error).message),
			},
		);
	}

	return (
		<section className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold">Masters</h1>
				<p className="text-sm text-muted-foreground">
					Onboard masters with single-use invite links. The roster shows live ratings and
					availability.
				</p>
			</header>

			<Card className="space-y-3 p-4">
				<h2 className="text-sm font-semibold">Create invitation</h2>
				<div className="grid gap-2 md:grid-cols-4">
					<div>
						<Label>Role</Label>
						<select
							className="h-9 w-full rounded-md border bg-background px-2 text-sm"
							value={role}
							onChange={(e) => setRole(e.target.value as Role)}
						>
							<option value="MASTER">Master</option>
							<option value="INSPECTOR">Inspector</option>
							<option value="OWNER">Owner</option>
							<option value="PROCUREMENT">Procurement</option>
						</select>
					</div>
					<div className="md:col-span-2">
						<Label>Email (optional)</Label>
						<Input
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="invitee@example.com"
						/>
					</div>
					<div>
						<Label>Expires in (days)</Label>
						<Input
							type="number"
							min={1}
							max={60}
							value={days}
							onChange={(e) => setDays(Number(e.target.value))}
						/>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<Button onClick={submit} disabled={create.isPending}>
						{create.isPending ? "Creating…" : "Create invite"}
					</Button>
					{error && <span className="text-xs text-destructive">{error}</span>}
				</div>
				{lastLink && (
					<div className="rounded-md border bg-muted/40 p-2 text-xs">
						Share this single-use link:{" "}
						<button
							type="button"
							className="font-mono underline"
							onClick={() => navigator.clipboard?.writeText(lastLink)}
						>
							{lastLink}
						</button>
					</div>
				)}
			</Card>

			<section className="space-y-2">
				<h2 className="text-sm font-semibold">Pending invitations</h2>
				{invitations.isLoading && <p className="text-sm text-muted-foreground">loading…</p>}
				{invitations.data?.length === 0 && (
					<p className="text-sm text-muted-foreground">No invitations.</p>
				)}
				<div className="grid gap-2">
					{invitations.data?.map((inv) => {
						const expired = new Date(inv.expiresAt).getTime() <= Date.now();
						const status = inv.consumedAt ? "CONSUMED" : expired ? "EXPIRED" : "PENDING";
						return (
							<Card
								key={inv.token}
								className="grid items-center gap-3 p-3 md:grid-cols-[auto_1fr_auto_auto_auto]"
							>
								<Badge variant="outline">{inv.role}</Badge>
								<div className="text-xs text-muted-foreground">
									{inv.email ?? "any email"} ·{" "}
									<button
										type="button"
										className="font-mono underline"
										onClick={() => navigator.clipboard?.writeText(inviteUrl(inv.token))}
									>
										copy link
									</button>
								</div>
								<div className="text-xs">{new Date(inv.expiresAt).toLocaleString()}</div>
								<Badge variant={status === "PENDING" ? "default" : "secondary"}>{status}</Badge>
								<Button
									size="sm"
									variant="destructive"
									disabled={status !== "PENDING"}
									onClick={() => revoke.mutate(inv.token)}
								>
									Revoke
								</Button>
							</Card>
						);
					})}
				</div>
			</section>

			<section className="space-y-2">
				<h2 className="text-sm font-semibold">Roster</h2>
				{masters.isLoading && <p className="text-sm text-muted-foreground">loading…</p>}
				{masters.data?.length === 0 && (
					<p className="text-sm text-muted-foreground">No masters on the roster yet.</p>
				)}
				<div className="grid gap-2">
					{masters.data?.map((m) => (
						<Card
							key={m.id}
							className="grid items-center gap-3 p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
						>
							<div className="space-y-0.5">
								<div className="text-sm font-medium">{m.displayName}</div>
								<div className="text-xs text-muted-foreground">{m.phone ?? "no phone"}</div>
							</div>
							<div className="flex flex-wrap gap-1">
								{m.specializations.length === 0 && (
									<span className="text-xs text-muted-foreground">no specializations</span>
								)}
								{m.specializations.map((s) => (
									<Badge key={s} variant="outline">
										{s}
									</Badge>
								))}
							</div>
							<div className="text-xs">
								<div>
									{m.rating ? (
										<>
											<strong>{m.rating.acceptedCount}</strong> accepted ·{" "}
											<strong>{m.rating.rejectedCount}</strong> rejected
										</>
									) : (
										<span className="text-muted-foreground">no activity</span>
									)}
								</div>
								<div className="text-muted-foreground">
									avg ratio:{" "}
									{m.rating?.avgDurationRatio ? Number(m.rating.avgDurationRatio).toFixed(2) : "—"}
								</div>
							</div>
							<div className="text-xs">
								<div className="font-medium">{m.availability.state}</div>
								{m.availability.detail && (
									<div className="text-muted-foreground">{m.availability.detail}</div>
								)}
								{m.availability.until && (
									<div className="text-muted-foreground">
										until {new Date(m.availability.until).toLocaleDateString()}
									</div>
								)}
							</div>
							<Link to="/owner/masters/$id" params={{ id: m.id }}>
								<Button size="sm" variant="outline">
									Open
								</Button>
							</Link>
						</Card>
					))}
				</div>
			</section>
		</section>
	);
}
