import type { Role } from "@repo/validators";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CopyIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
	useCreateInvitation,
	useInvitations,
	useMasters,
	useRevokeInvitation,
} from "@/lib/queries/hr";

export const Route = createFileRoute("/owner/masters/")({
	staticData: { crumb: "Masters" },
	component: OwnerMasters,
});

function inviteUrl(token: string) {
	return `${window.location.origin}/invite/${token}`;
}

function copy(text: string) {
	navigator.clipboard?.writeText(text);
	toast.success("Copied to clipboard");
}

function initialsOf(name: string) {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase())
		.join("");
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

	function submit() {
		create.mutate(
			{ role, email: email.trim() || undefined, expiresInDays: days },
			{
				onSuccess: (row) => {
					setLastLink(inviteUrl(row.token));
					setEmail("");
					toast.success("Invitation created");
				},
				onError: (e) => toast.error((e as Error).message),
			},
		);
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Masters"
				description="Onboard with single-use invite links. The roster shows live ratings and availability."
			/>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<UserPlusIcon className="size-4" /> Create invitation
					</CardTitle>
					<CardDescription>
						Pick a role, optionally pin the email, set an expiry, and share the link.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 md:grid-cols-4">
						<div className="space-y-1.5">
							<Label>Role</Label>
							<Select value={role} onValueChange={(v) => setRole(v as Role)}>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="MASTER">Master</SelectItem>
									<SelectItem value="INSPECTOR">Inspector</SelectItem>
									<SelectItem value="OWNER">Owner</SelectItem>
									<SelectItem value="PROCUREMENT">Procurement</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5 md:col-span-2">
							<Label>Email (optional)</Label>
							<Input
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="invitee@example.com"
							/>
						</div>
						<div className="space-y-1.5">
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
					</div>
					{lastLink ? (
						<div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
							<span className="text-muted-foreground">Single-use link:</span>
							<code className="flex-1 truncate font-mono">{lastLink}</code>
							<Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copy(lastLink)}>
								<CopyIcon className="mr-1 size-3.5" /> Copy
							</Button>
						</div>
					) : null}
				</CardContent>
			</Card>

			<section className="space-y-2">
				<h2 className="text-sm font-semibold">Pending invitations</h2>
				{invitations.isLoading ? (
					<Skeleton className="h-16 w-full" />
				) : invitations.data?.length === 0 ? (
					<EmptyState title="No invitations" description="Pending invites will show up here." />
				) : (
					<div className="space-y-2">
						{invitations.data?.map((inv) => {
							const expired = new Date(inv.expiresAt).getTime() <= Date.now();
							const status = inv.consumedAt ? "CONSUMED" : expired ? "EXPIRED" : "PENDING";
							return (
								<Card key={inv.token} className="p-3">
									<div className="grid items-center gap-3 md:grid-cols-[auto_1fr_auto_auto_auto]">
										<Badge variant="outline">{inv.role}</Badge>
										<div className="flex items-center gap-2 text-xs text-muted-foreground">
											<span>{inv.email ?? "any email"}</span>
											<Button
												variant="ghost"
												size="sm"
												className="h-6 px-1.5 text-xs"
												onClick={() => copy(inviteUrl(inv.token))}
											>
												<CopyIcon className="mr-1 size-3" /> copy link
											</Button>
										</div>
										<div className="text-xs">{new Date(inv.expiresAt).toLocaleString()}</div>
										<Badge variant={status === "PENDING" ? "default" : "secondary"}>{status}</Badge>
										<Button
											size="sm"
											variant="outline"
											disabled={status !== "PENDING"}
											onClick={() => revoke.mutate(inv.token)}
										>
											<Trash2Icon className="size-3.5" />
										</Button>
									</div>
								</Card>
							);
						})}
					</div>
				)}
			</section>

			<section className="space-y-2">
				<h2 className="text-sm font-semibold">Roster</h2>
				{masters.isLoading ? (
					<Skeleton className="h-24 w-full" />
				) : masters.data?.length === 0 ? (
					<EmptyState
						icon={UsersIcon}
						title="No masters yet"
						description="Send out invite links above to onboard your first masters."
					/>
				) : (
					<div className="grid gap-2">
						{masters.data?.map((m) => (
							<Card key={m.id} className="p-3">
								<div className="grid items-center gap-3 md:grid-cols-[auto_1fr_1fr_1fr_1fr_auto]">
									<Avatar className="size-9">
										<AvatarFallback>{initialsOf(m.displayName)}</AvatarFallback>
									</Avatar>
									<div className="space-y-0.5">
										<div className="text-sm font-medium">{m.displayName}</div>
										<div className="text-xs text-muted-foreground">{m.phone ?? "no phone"}</div>
									</div>
									<div className="flex flex-wrap gap-1">
										{m.specializations.length === 0 ? (
											<span className="text-xs text-muted-foreground">no specializations</span>
										) : (
											m.specializations.map((s) => (
												<Badge key={s} variant="outline" className="text-[10px]">
													{s}
												</Badge>
											))
										)}
									</div>
									<div className="text-xs">
										{m.rating ? (
											<>
												<div>
													<strong className="tabular-nums">{m.rating.acceptedCount}</strong>{" "}
													accepted ·{" "}
													<strong className="tabular-nums">{m.rating.rejectedCount}</strong>{" "}
													rejected
												</div>
												<div className="text-muted-foreground">
													avg ratio:{" "}
													{m.rating.avgDurationRatio
														? Number(m.rating.avgDurationRatio).toFixed(2)
														: "—"}
												</div>
											</>
										) : (
											<span className="text-muted-foreground">no activity</span>
										)}
									</div>
									<div className="text-xs">
										<div className="font-medium">{m.availability.state}</div>
										{m.availability.detail ? (
											<div className="text-muted-foreground">{m.availability.detail}</div>
										) : null}
										{m.availability.until ? (
											<div className="text-muted-foreground">
												until {new Date(m.availability.until).toLocaleDateString()}
											</div>
										) : null}
									</div>
									<Button
										size="sm"
										variant="outline"
										nativeButton={false}
										render={<Link to="/owner/masters/$id" params={{ id: m.id }} />}
									>
										Open
									</Button>
								</div>
							</Card>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
