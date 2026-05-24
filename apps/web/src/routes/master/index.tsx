import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAvailableStages, useMyStages } from "@/lib/queries/acceptance";

export const Route = createFileRoute("/master/")({
	component: MasterHome,
});

function MasterHome() {
	const available = useAvailableStages();
	const mine = useMyStages();

	return (
		<section className="space-y-6">
			<div>
				<h1 className="text-xl font-semibold">In progress</h1>
				<p className="text-sm text-muted-foreground">
					Stages you've claimed. Tap to open and upload photos.
				</p>
				<div className="mt-3 grid gap-3 md:grid-cols-2">
					{mine.data?.length === 0 && (
						<p className="text-sm text-muted-foreground">No active claims.</p>
					)}
					{mine.data?.map((s) => (
						<Link
							key={s.subStageInstanceId}
							to="/master/stages/$subStageId"
							params={{ subStageId: s.subStageInstanceId }}
						>
							<Card className="p-4 hover:bg-accent active:bg-accent/80">
								<div className="flex items-baseline justify-between">
									<span className="font-mono text-xs text-muted-foreground">{s.code}</span>
									<Badge variant={statusVariant(s.status)}>{s.status}</Badge>
								</div>
								<div className="mt-1 text-base font-medium">{s.name}</div>
								<div className="text-sm text-muted-foreground">
									{s.propertyName} · {s.stageName}
								</div>
								<div className="mt-2 text-sm">wage ${s.wageAmount}</div>
							</Card>
						</Link>
					))}
				</div>
			</div>

			<div>
				<h2 className="text-xl font-semibold">Available</h2>
				<p className="text-sm text-muted-foreground">
					Open stages matching your specialization. Tap to claim.
				</p>
				<div className="mt-3 grid gap-3 md:grid-cols-2">
					{available.data?.length === 0 && (
						<p className="text-sm text-muted-foreground">Nothing available right now.</p>
					)}
					{available.data?.map((s) => (
						<Link
							key={s.subStageInstanceId}
							to="/master/stages/$subStageId"
							params={{ subStageId: s.subStageInstanceId }}
						>
							<Card className="p-4 hover:bg-accent active:bg-accent/80">
								<div className="flex items-baseline justify-between">
									<span className="font-mono text-xs text-muted-foreground">{s.code}</span>
									{s.specialization && <Badge variant="secondary">{s.specialization}</Badge>}
								</div>
								<div className="mt-1 text-base font-medium">{s.name}</div>
								<div className="text-sm text-muted-foreground">
									{s.propertyName} · {s.stageName}
								</div>
								<div className="mt-2 text-sm">wage ${s.wageAmount}</div>
							</Card>
						</Link>
					))}
				</div>
			</div>
		</section>
	);
}

function statusVariant(
	status: string,
): "default" | "secondary" | "destructive" | "outline" | undefined {
	if (status === "SUBMITTED") return "default";
	if (status === "REJECTED") return "destructive";
	return "secondary";
}
