import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxCollection,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxValue,
} from "@/components/ui/combobox";

type Option = { id: string; name: string };

export function SpecializationsPicker({
	value,
	options,
	onChange,
	placeholder,
	emptyHint,
	disabled,
}: {
	value: string[];
	options: Option[];
	onChange: (next: string[]) => void;
	placeholder?: string;
	emptyHint?: string;
	disabled?: boolean;
}) {
	const items = options.map((o) => o.name);
	return (
		<Combobox
			items={items}
			multiple
			value={value}
			onValueChange={(v: string[]) => onChange(v)}
			disabled={disabled}
		>
			<ComboboxChips>
				<ComboboxValue>
					{(selected: string[]) => selected.map((s) => <ComboboxChip key={s}>{s}</ComboboxChip>)}
				</ComboboxValue>
				<ComboboxChipsInput placeholder={placeholder} />
			</ComboboxChips>
			<ComboboxContent>
				<ComboboxList>
					<ComboboxCollection>
						{(item: string) => (
							<ComboboxItem key={item} value={item}>
								{item}
							</ComboboxItem>
						)}
					</ComboboxCollection>
					<ComboboxEmpty>{emptyHint}</ComboboxEmpty>
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
