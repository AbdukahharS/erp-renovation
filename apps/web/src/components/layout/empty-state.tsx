import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
}: {
	icon?: LucideIcon;
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 px-6 py-12 text-center",
				className,
			)}
		>
			{Icon ? (
				<div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
					<Icon className="size-6" />
				</div>
			) : null}
			<div className="text-sm font-medium">{title}</div>
			{description ? (
				<p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
			) : null}
			{action ? <div className="mt-4">{action}</div> : null}
		</div>
	);
}
