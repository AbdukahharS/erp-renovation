import type { ErrorComponentProps } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DefaultPending() {
	return (
		<div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
			<Loader2 className="size-4 animate-spin" />
			Loading…
		</div>
	);
}

export function DefaultError({ error, reset }: ErrorComponentProps) {
	const message = error instanceof Error ? error.message : String(error);
	return (
		<div className="max-w-xl mx-auto p-6 space-y-3">
			<h1 className="text-lg font-semibold text-destructive">Something went wrong</h1>
			<pre className="text-xs whitespace-pre-wrap rounded border bg-muted/40 p-3">{message}</pre>
			<Button size="sm" onClick={reset}>
				Try again
			</Button>
		</div>
	);
}
