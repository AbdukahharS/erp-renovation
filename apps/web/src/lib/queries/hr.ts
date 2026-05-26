import type { InvitationPreview, InvitationRow, Role } from "@repo/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api";

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
		queryFn: () => unwrap(api.owner.invitations.get()) as unknown as Promise<InvitationRow[]>,
	});
}

export function useCreateInvitation() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { role: Role; email?: string; expiresInDays?: number }) =>
			unwrap(
				api.owner.invitations.post({
					role: vars.role,
					email: vars.email,
					expiresInDays: vars.expiresInDays ?? 14,
				}),
			) as unknown as Promise<InvitationRow>,
		onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.invitations }),
	});
}

export function useRevokeInvitation() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (token: string) => unwrap(api.owner.invitations({ token }).delete()),
		onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.invitations }),
	});
}

// --------- Invitations: public ---------

export function useInvitationPreview(token: string | undefined) {
	return useQuery({
		queryKey: ["invitation", token],
		queryFn: () =>
			unwrap(
				api.invitations({ token: token as string }).get(),
			) as unknown as Promise<InvitationPreview>,
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
			unwrap(
				api.invitations({ token: vars.token }).redeem.post({
					name: vars.name,
					email: vars.email,
					password: vars.password,
					displayName: vars.displayName,
					phone: vars.phone,
					specializations: vars.specializations,
				}),
			) as unknown as Promise<{ ok: true; userId: string; tenantId: string; role: Role }>,
	});
}

// --------- Masters: owner ---------

export function useMasters() {
	return useQuery({
		queryKey: hrKeys.masters,
		queryFn: () => unwrap(api.owner.masters.get()) as unknown as Promise<MasterRosterRow[]>,
	});
}

export function useMaster(id: string | undefined) {
	return useQuery({
		queryKey: id ? hrKeys.master(id) : ["owner", "masters", "none"],
		queryFn: () => unwrap(api.owner.masters({ masterId: id as string }).get()),
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
			unwrap(
				api.owner.masters({ masterId: vars.id }).patch({
					displayName: vars.displayName,
					phone: vars.phone,
					specializations: vars.specializations,
				}),
			) as unknown as Promise<MasterRosterRow>,
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
			unwrap(
				api.owner.masters({ masterId: vars.id }).availability.patch({
					availabilityOverride: vars.availabilityOverride,
					availabilityOverrideUntil: vars.availabilityOverrideUntil,
				}),
			) as unknown as Promise<MasterRosterRow>,
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: hrKeys.masters });
			qc.invalidateQueries({ queryKey: hrKeys.master(vars.id) });
		},
	});
}
