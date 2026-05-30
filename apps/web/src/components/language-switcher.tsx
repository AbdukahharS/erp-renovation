import { CheckIcon, LanguagesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n";
import { syncCurrentDeviceLocale } from "@/lib/push";

export function LanguageSwitcher() {
	const { i18n, t } = useTranslation();
	const current = (i18n.resolvedLanguage ?? i18n.language ?? "en").split(
		"-",
	)[0] as SupportedLanguage;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="ghost" size="icon" aria-label={t("language.toggle")} />}
			>
				<LanguagesIcon className="size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{SUPPORTED_LANGUAGES.map((code) => (
					<DropdownMenuItem
						key={code}
						onClick={async () => {
							await i18n.changeLanguage(code);
							// Fire-and-forget — flips this device's push locale so the
							// next push lands localized without waiting for the next app
							// load. Other devices catch up on their own next load.
							void syncCurrentDeviceLocale(code);
						}}
					>
						<span className="mr-2 inline-flex size-4 items-center justify-center">
							{code === current ? <CheckIcon className="size-3.5" /> : null}
						</span>
						{LANGUAGE_LABELS[code]}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
