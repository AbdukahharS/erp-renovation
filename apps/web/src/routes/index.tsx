import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/lib/api";

export const Route = createFileRoute("/")({
	component: Index,
});

function Index() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["health"],
		queryFn: async () => {
			const { data, error } = await api.health.get();
			if (error) throw error;
			return data;
		},
	});

	return (
		<main className="p-8 space-y-3">
			<h1 className="text-2xl font-semibold">ERP Renovation</h1>
			{isLoading && <p className="text-muted-foreground">Checking API…</p>}
			{error && <p className="text-destructive">API unreachable</p>}
			{data && (
				<p>
					API health: <code>ok = {String(data.ok)}</code>
				</p>
			)}
		</main>
	);
}
