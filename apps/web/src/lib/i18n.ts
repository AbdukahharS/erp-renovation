import { z, zodLocales } from "@repo/validators";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en/common.json";
import ru from "@/locales/ru/common.json";
import uz from "@/locales/uz/common.json";

export const SUPPORTED_LANGUAGES = ["en", "ru", "uz"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
	en: "English",
	ru: "Русский",
	uz: "Oʻzbekcha",
};

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: {
			en: { common: en },
			ru: { common: ru },
			uz: { common: uz },
		},
		fallbackLng: "en",
		supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
		nonExplicitSupportedLngs: true,
		defaultNS: "common",
		ns: ["common"],
		interpolation: { escapeValue: false },
		detection: {
			order: ["localStorage", "navigator"],
			caches: ["localStorage"],
			lookupLocalStorage: "erp.lang",
		},
		returnNull: false,
	});

const applyZodLocale = (lng: string) => {
	const base = (lng.split("-")[0] ?? "en") as keyof typeof zodLocales;
	const loader = zodLocales[base] ?? zodLocales.en;
	z.config({ localeError: loader().localeError });
};

const applyHtmlLang = (lng: string) => {
	const base = lng.split("-")[0] ?? "en";
	if (typeof document !== "undefined") document.documentElement.lang = base;
};

applyHtmlLang(i18n.language || "en");
applyZodLocale(i18n.language || "en");
i18n.on("languageChanged", (lng) => {
	applyHtmlLang(lng);
	applyZodLocale(lng);
});

export default i18n;
