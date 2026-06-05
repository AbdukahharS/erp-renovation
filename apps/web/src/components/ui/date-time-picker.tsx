import { format } from "date-fns";
import { enUS, ru, uz } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useMemo } from "react";
import type { Locale } from "react-day-picker";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const dateFnsLocales: Record<string, Locale> = { en: enUS, ru, uz };

function pad(n: number) {
	return String(n).padStart(2, "0");
}

// Parse "YYYY-MM-DDTHH:mm" (native datetime-local) as local time.
function parseLocalValue(value: string | null | undefined): Date | null {
	if (!value) return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
	if (!m) return null;
	const [, y, mo, d, hh, mm] = m;
	const date = new Date(
		Number(y),
		Number(mo) - 1,
		Number(d),
		hh ? Number(hh) : 0,
		mm ? Number(mm) : 0,
	);
	return Number.isNaN(date.getTime()) ? null : date;
}

function toLocalValue(date: Date, withTime: boolean) {
	const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	return withTime ? `${base}T${pad(date.getHours())}:${pad(date.getMinutes())}` : base;
}

export interface DateTimePickerProps {
	value: string | null | undefined;
	onChange: (value: string) => void;
	onBlur?: () => void;
	withTime?: boolean;
	disabled?: boolean;
	placeholder?: string;
	id?: string;
	className?: string;
	name?: string;
}

export function DateTimePicker({
	value,
	onChange,
	onBlur,
	withTime = true,
	disabled,
	placeholder,
	id,
	className,
	name,
}: DateTimePickerProps) {
	const { i18n, t } = useTranslation();
	const lang = (i18n.language?.split("-")[0] ?? "en") as keyof typeof dateFnsLocales;
	const locale = dateFnsLocales[lang] ?? enUS;
	const date = useMemo(() => parseLocalValue(value), [value]);

	const display = date
		? format(date, withTime ? "PPP, HH:mm" : "PPP", { locale })
		: (placeholder ?? t("dateTimePicker.placeholder"));

	const timeValue = date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "";

	const handleDateSelect = (selected: Date | undefined) => {
		if (!selected) return;
		const next = new Date(selected);
		if (date) {
			next.setHours(date.getHours(), date.getMinutes(), 0, 0);
		} else if (!withTime) {
			next.setHours(0, 0, 0, 0);
		}
		onChange(toLocalValue(next, withTime));
	};

	const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const [hh, mm] = e.target.value.split(":");
		if (hh === undefined || mm === undefined) return;
		const base = date ?? new Date();
		const next = new Date(
			base.getFullYear(),
			base.getMonth(),
			base.getDate(),
			Number(hh),
			Number(mm),
		);
		onChange(toLocalValue(next, true));
	};

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						id={id}
						name={name}
						disabled={disabled}
						onBlur={onBlur}
						className={cn(
							"w-full justify-start text-left font-normal",
							!date && "text-muted-foreground",
							className,
						)}
					/>
				}
			>
				<CalendarIcon className="mr-2 size-4 shrink-0" />
				<span className="truncate">{display}</span>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-3" align="start">
				<Calendar
					mode="single"
					selected={date ?? undefined}
					onSelect={handleDateSelect}
					locale={locale}
					captionLayout="dropdown"
				/>
				{withTime && (
					<div className="mt-2 flex items-center gap-2 border-t pt-2">
						<label htmlFor={id ? `${id}-time` : undefined} className="text-sm">
							{t("dateTimePicker.time")}
						</label>
						<Input
							id={id ? `${id}-time` : undefined}
							type="time"
							value={timeValue}
							onChange={handleTimeChange}
							className="w-32"
						/>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
