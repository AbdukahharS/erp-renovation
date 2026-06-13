import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api";

export type PropertyShareLink = {
	id: string;
	propertyId: string;
	slug: string;
	url: string;
	createdByUserId: string;
	revokedAt: string | null;
	revokedBy: string | null;
	createdAt: string;
	updatedAt: string;
};

const shareLinkKeys = {
	list: (propertyId: string) => ["property-share-links", propertyId] as const,
};

export function usePropertyShareLinks(propertyId: string | undefined) {
	return useQuery({
		queryKey: shareLinkKeys.list(propertyId ?? ""),
		queryFn: () =>
			unwrap(
				api.properties({ propertyId: propertyId as string })["share-links"].get(),
			) as unknown as Promise<PropertyShareLink[]>,
		enabled: !!propertyId,
	});
}

export type CreateShareLinkResponse = {
	id: string;
	slug: string;
	url: string;
	createdAt: string;
};

export function useCreateShareLink(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (password: string) =>
			unwrap(
				api.properties({ propertyId: propertyId as string })["share-links"].post({ password }),
			) as unknown as Promise<CreateShareLinkResponse>,
		onSuccess: () => {
			if (propertyId) qc.invalidateQueries({ queryKey: shareLinkKeys.list(propertyId) });
		},
	});
}

export function useRotateShareLinkPassword(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { linkId: string; password: string }) =>
			unwrap(
				api
					.properties({ propertyId: propertyId as string })
					["share-links"]({ linkId: vars.linkId })
					["rotate-password"].post({
						password: vars.password,
					}),
			),
		onSuccess: () => {
			if (propertyId) qc.invalidateQueries({ queryKey: shareLinkKeys.list(propertyId) });
		},
	});
}

export function useRevokeShareLink(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (linkId: string) =>
			unwrap(
				api
					.properties({ propertyId: propertyId as string })
					["share-links"]({ linkId })
					.revoke.post(),
			),
		onSuccess: () => {
			if (propertyId) qc.invalidateQueries({ queryKey: shareLinkKeys.list(propertyId) });
		},
	});
}
