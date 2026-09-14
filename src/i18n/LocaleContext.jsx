import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { translations } from "./translations.js";

// eslint-disable-next-line react-refresh/only-export-components
export const LOCALES = {
  en: { code: "en", label: "English", dir: "ltr", native: "English" },
  ku: { code: "ku", label: "Kurdî", dir: "ltr", native: "Kurdî (Kurmancî)" },
  ar: { code: "ar", label: "العربية", dir: "rtl", native: "العربية" },
};

const DEFAULT_LOCALE = "en";
const STORAGE_KEY = "hey_locale";

function detectLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LOCALES[stored]) return stored;
  } catch {
    /* storage unavailable */
  }

  const nav = typeof navigator !== "undefined" ? navigator.language || "" : "";
  const base = nav.split("-")[0].toLowerCase();
  return LOCALES[base] ? base : DEFAULT_LOCALE;
}

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(detectLocale);

  useEffect(() => {
    const meta = LOCALES[locale] || LOCALES[DEFAULT_LOCALE];
    const root = document.documentElement;
    root.lang = meta.code;
    root.dir = meta.dir;
    root.dataset.locale = meta.code;
    try {
      localStorage.setItem(STORAGE_KEY, meta.code);
    } catch {
      /* storage unavailable */
    }
  }, [locale]);

  const setLocale = useCallback((code) => {
    if (LOCALES[code]) setLocaleState(code);
  }, []);

  const t = useCallback(
    (key, fallback) => {
      const dict = translations[locale] || translations[DEFAULT_LOCALE];
      const value = key
        .split(".")
        .reduce((acc, part) => (acc && acc[part] ? acc[part] : null), dict);
      return value ?? fallback ?? key;
    },
    [locale]
  );

  const value = useMemo(() => {
    const meta = LOCALES[locale] || LOCALES[DEFAULT_LOCALE];
    return { locale, dir: meta.dir, setLocale, t };
  }, [locale, setLocale, t]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}