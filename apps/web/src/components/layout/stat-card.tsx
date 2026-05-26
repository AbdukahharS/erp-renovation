import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
	label,
	value,
	hint,
	icon: Icon,
	trend,
	className,
}: {
	label: ReactNode;
	value: ReactNode;
	hint?: ReactNode;
	icon?: LucideIcon;
	trend?: "up" | "down" | "flat";
	className?: string;
}) {
	return (
		<Card className={cn("relative overflow-hidden", className)}>
			<CardContent className="p-5">
				<div className="flex items-center justify-between">
					<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{label}
					</div>
					{Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
				</div>
				<div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
				{hint ? (
					<div
						className={cn(
							"mt-1 text-xs text-muted-foreground",
							trend === "up" && "text-emerald-600 dark:text-emerald-400",
							trend === "down" && "text-rose-600 dark:text-rose-400",
						)}
					>
						{hint}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
