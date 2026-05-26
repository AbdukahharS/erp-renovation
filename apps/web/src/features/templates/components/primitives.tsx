import { Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="block space-y-1">
			<span className="text-xs font-medium text-muted-foreground">{label}</span>
			<div>{children}</div>
		</div>
	);
}

export function InlineText({
	value,
	onSave,
	className,
}: {
	value: string;
	onSave: (v: string) => void;
	className?: string;
}) {
	const [draft, setDraft] = useState(value);
	const [editing, setEditing] = useState(false);
	if (!editing) {
		return (
			<button
				type="button"
				onClick={() => setEditing(true)}
				className={`${className ?? ""} cursor-text hover:underline decoration-dotted text-left bg-transparent`}
			>
				{value || <span className="italic text-muted-foreground">empty</span>}
			</button>
		);
	}
	return (
		<Input
			autoFocus
			value={draft}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={() => {
				setEditing(false);
				if (draft !== value) onSave(draft);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
				if (e.key === "Escape") {
					setDraft(value);
					setEditing(false);
				}
			}}
			className={className}
		/>
	);
}

export function InlineTextarea({
	value,
	onSave,
	className,
	placeholder,
}: {
	value: string;
	onSave: (v: string) => void;
	className?: string;
	placeholder?: string;
}) {
	const [draft, setDraft] = useState(value);
	return (
		<Textarea
			rows={2}
			value={draft}
			placeholder={placeholder}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={() => {
				if (draft !== value) onSave(draft);
			}}
			className={className}
		/>
	);
}

export function ConfirmDelete({
	title,
	description,
	onConfirm,
	ariaLabel,
}: {
	title: string;
	description?: string;
	onConfirm: () => void;
	ariaLabel?: string;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={
					<Button variant="ghost" size="icon-sm" aria-label={ariaLabel}>
						<Trash2 className="size-4 text-destructive" />
					</Button>
				}
			/>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description && <AlertDialogDescription>{description}</AlertDialogDescription>}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="bg-destructive text-white hover:bg-destructive/90"
					>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
