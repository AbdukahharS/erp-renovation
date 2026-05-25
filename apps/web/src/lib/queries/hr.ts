import type { InvitationPreview, InvitationRow, Role } from "@repo/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "../api";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${apiBaseUrl}${path}`, {
		credentials: "include",
		...init,
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
	if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
	return (await res.json()) as T;
}

export type MasterRosterRow = {
	id: string;
	userId: string;
	displayName: string;
	phone: string | null;
	specializations: string[];
	availability: { state: string; detail: string | null; until: string | null };
	rating: {
		masterUserId: string;
		acceptedCount: number;
		rejectedCount: number;
		avgDurationRatio: string | null;
		computedAt: string;
	} | null;
	balance: string;
};

export const hrKeys = {
	invitations: ["owner", "invitations"] as const,
	masters: ["owner", "masters"] as const,
	master: (id: string) => ["owner", "masters", id] as const,
};

// --------- Invitations: owner ---------

export function useInvitations() {
	return useQuery({
		queryKey: hrKeys.invitations,
		queryFn: () => call<InvitationRow[]>("/owner/invitations"),
	});
}

export function useCreateInvitation() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { role: Role; email?: string; expiresInDays?: number }) =>
			call<InvitationRow>("/owner/invitations", {
				method: "POST",
				body: JSON.stringify({
					role: vars.role,
					email: vars.email,
					expiresInDays: vars.expiresInDays ?? 14,
				}),
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.invitations }),
	});
}

export function useRevokeInvitation() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (token: string) =>
			call<{ ok: true }>(`/owner/invitations/${token}`, { method: "DELETE" }),
		onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.invitations }),
	});
}

// --------- Invitations: public ---------

export function useInvitationPreview(token: string | undefined) {
	return useQuery({
		queryKey: ["invitation", token],
		queryFn: () => call<InvitationPreview>(`/invitations/${token}`),
		enabled: !!token,
	});
}

export function useRedeemInvitation() {
	return useMutation({
		mutationFn: (vars: {
			token: string;
			name: string;
			email: string;
			password: string;
			displayName?: string;
			phone?: string;
			specializations?: string[];
		}) =>
			call<{ ok: true; userId: string; tenantId: string; role: Role }>(
				`/invitations/${vars.token}/redeem`,
				{
					method: "POST",
					body: JSON.stringify({
						name: vars.name,
						email: vars.email,
						password: vars.password,
						displayName: vars.displayName,
						phone: vars.phone,
						specializations: vars.specializations,
					}),
				},
			),
	});
}

// --------- Masters: owner ---------

export function useMasters() {
	return useQuery({
		queryKey: hrKeys.masters,
		queryFn: () => call<MasterRosterRow[]>("/owner/masters"),
	});
}

export function useMaster(id: string | undefined) {
	return useQuery({
		queryKey: id ? hrKeys.master(id) : ["owner", "masters", "none"],
		queryFn: () => call<unknown>(`/owner/masters/${id}`),
		enabled: !!id,
	});
}

export function useUpdateMaster() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: {
			id: string;
			displayName?: string;
			phone?: string | null;
			specializations?: string[];
		}) =>
			call<MasterRosterRow>(`/owner/masters/${vars.id}`, {
				method: "PATCH",
				body: JSON.stringify({
					displayName: vars.displayName,
					phone: vars.phone,
					specializations: vars.specializations,
				}),
			}),
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: hrKeys.masters });
			qc.invalidateQueries({ queryKey: hrKeys.master(vars.id) });
		},
	});
}

export function useUpdateMasterAvailability() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: {
			id: string;
			availabilityOverride: string | null;
			availabilityOverrideUntil: string | null;
		}) =>
			call<MasterRosterRow>(`/owner/masters/${vars.id}/availability`, {
				method: "PATCH",
				body: JSON.stringify({
					availabilityOverride: vars.availabilityOverride,
					availabilityOverrideUntil: vars.availabilityOverrideUntil,
				}),
			}),
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: hrKeys.masters });
			qc.invalidateQueries({ queryKey: hrKeys.master(vars.id) });
		},
	});
}
