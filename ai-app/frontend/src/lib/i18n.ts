import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import hi from "../locales/hi.json";

const LANG_KEY = "ai_lang";

const stored = localStorage.getItem(LANG_KEY);

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: stored || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: "en" | "hi") {
  localStorage.setItem(LANG_KEY, lang);
  i18n.changeLanguage(lang);
}

export function getLanguage(): "en" | "hi" {
  return (localStorage.getItem(LANG_KEY) as "en" | "hi") || "en";
}

export default i18n;
