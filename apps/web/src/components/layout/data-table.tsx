import type { ReactNode } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column<T> = {
	key: string;
	header: ReactNode;
	cell: (row: T) => ReactNode;
	className?: string;
	headerClassName?: string;
};

export function DataTable<T>({
	columns,
	rows,
	rowKey,
	onRowClick,
	empty,
	className,
}: {
	columns: Column<T>[];
	rows: T[];
	rowKey: (row: T) => string;
	onRowClick?: (row: T) => void;
	empty?: ReactNode;
	className?: string;
}) {
	if (rows.length === 0 && empty) {
		return <>{empty}</>;
	}
	return (
		<div className={cn("rounded-lg border bg-card", className)}>
			<Table>
				<TableHeader>
					<TableRow>
						{columns.map((c) => (
							<TableHead key={c.key} className={c.headerClassName}>
								{c.header}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow
							key={rowKey(row)}
							onClick={onRowClick ? () => onRowClick(row) : undefined}
							className={onRowClick ? "cursor-pointer" : undefined}
						>
							{columns.map((c) => (
								<TableCell key={c.key} className={c.className}>
									{c.cell(row)}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
