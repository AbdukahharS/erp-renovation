import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useInspectorQueue } from "@/lib/queries/acceptance";

export const Route = createFileRoute("/inspector/")({
	component: InspectorQueueView,
});

function InspectorQueueView() {
	const { data, isLoading } = useInspectorQueue();
	if (isLoading || !data) return <p className="text-sm text-muted-foreground">loading…</p>;

	return (
		<section className="space-y-6">
			<div>
				<h1 className="text-xl font-semibold">Awaiting acceptance</h1>
				<p className="text-sm text-muted-foreground">
					Submitted by masters. Tap to review the checklist.
				</p>
				<div className="mt-3 grid gap-3 md:grid-cols-2">
					{data.submitted.length === 0 && (
						<p className="text-sm text-muted-foreground">Queue is empty.</p>
					)}
					{data.submitted.map((s) => (
						<Link
							key={s.subStageInstanceId}
							to="/inspector/stages/$subStageId"
							params={{ subStageId: s.subStageInstanceId }}
						>
							<Card className="p-4 hover:bg-accent active:bg-accent/80">
								<div className="flex items-baseline justify-between">
									<span className="font-mono text-xs text-muted-foreground">{s.code}</span>
									<Badge>{s.status}</Badge>
								</div>
								<div className="mt-1 text-base font-medium">{s.name}</div>
								<div className="text-sm text-muted-foreground">
									{s.propertyName} · {s.stageName}
								</div>
							</Card>
						</Link>
					))}
				</div>
			</div>

			<div>
				<h2 className="text-xl font-semibold">My direct stages</h2>
				<p className="text-sm text-muted-foreground">
					Inspector-performed stages awaiting your visit (e.g. Sub-stage 1.1).
				</p>
				<div className="mt-3 grid gap-3 md:grid-cols-2">
					{data.direct.length === 0 && (
						<p className="text-sm text-muted-foreground">Nothing direct right now.</p>
					)}
					{data.direct.map((s) => (
						<Link
							key={s.subStageInstanceId}
							to="/inspector/stages/$subStageId"
							params={{ subStageId: s.subStageInstanceId }}
						>
							<Card className="p-4 hover:bg-accent active:bg-accent/80">
								<div className="flex items-baseline justify-between">
									<span className="font-mono text-xs text-muted-foreground">{s.code}</span>
									<Badge variant="secondary">{s.status}</Badge>
								</div>
								<div className="mt-1 text-base font-medium">{s.name}</div>
								<div className="text-sm text-muted-foreground">
									{s.propertyName} · {s.stageName}
								</div>
							</Card>
						</Link>
					))}
				</div>
			</div>
		</section>
	);
}
