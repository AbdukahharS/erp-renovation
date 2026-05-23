import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: Index,
});

function Index() {
	return (
		<main className="p-8">
			<h1 className="text-2xl font-semibold">ERP Renovation</h1>
		</main>
	);
}
