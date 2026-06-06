import type { SpecializationKey } from "@repo/validators";
import { useTranslation } from "react-i18next";
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

export function SpecializationsPicker({
	value,
	options,
	onChange,
	placeholder,
	emptyHint,
	disabled,
}: {
	value: SpecializationKey[];
	options: readonly SpecializationKey[];
	onChange: (next: SpecializationKey[]) => void;
	placeholder?: string;
	emptyHint?: string;
	disabled?: boolean;
}) {
	const { t } = useTranslation();
	const label = (key: SpecializationKey) => t(`specializations.${key}`);
	return (
		<Combobox
			items={options as SpecializationKey[]}
			multiple
			value={value}
			onValueChange={(v: SpecializationKey[]) => onChange(v)}
			disabled={disabled}
		>
			<ComboboxChips>
				<ComboboxValue>
					{(selected: SpecializationKey[]) =>
						selected.map((s) => <ComboboxChip key={s}>{label(s)}</ComboboxChip>)
					}
				</ComboboxValue>
				<ComboboxChipsInput placeholder={placeholder} />
			</ComboboxChips>
			<ComboboxContent>
				<ComboboxList>
					<ComboboxCollection>
						{(item: SpecializationKey) => (
							<ComboboxItem key={item} value={item}>
								{label(item)}
							</ComboboxItem>
						)}
					</ComboboxCollection>
					<ComboboxEmpty>{emptyHint}</ComboboxEmpty>
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
