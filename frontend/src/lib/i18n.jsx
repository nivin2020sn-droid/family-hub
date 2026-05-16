import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { TRANSLATIONS, LANGUAGES } from "@/lib/translations";

const STORAGE_KEY = "mfml_lang";
const DEFAULT_LANG = "en";

const I18nContext = createContext(null);

function readStoredLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && TRANSLATIONS[v]) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANG;
}

function applyDocumentDir(lang) {
  const cfg = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
  if (typeof document !== "undefined") {
    document.documentElement.lang = cfg.code;
    document.documentElement.dir = cfg.dir;
  }
}

export const I18nProvider = ({ children }) => {
  const [lang, setLangState] = useState(() => readStoredLang());

  useEffect(() => {
    applyDocumentDir(lang);
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!TRANSLATIONS[next]) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setLangState(next);
  }, []);

  const t = useCallback(
    (key, vars) => {
      const dict = TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANG];
      const fallback = TRANSLATIONS[DEFAULT_LANG] || {};
      let str = dict[key] ?? fallback[key] ?? key;
      if (vars && typeof str === "string") {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return str;
    },
    [lang]
  );

  const value = useMemo(
    () => {
      const cfg = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
      return { lang, setLang, t, languages: LANGUAGES, dir: cfg.dir, locale: cfg.locale };
    },
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback if a component is rendered outside the provider (e.g.
    // during tests). Returns identity translator + English default.
    return {
      lang: DEFAULT_LANG,
      setLang: () => {},
      t: (key) => key,
      languages: LANGUAGES,
      dir: "ltr",
    };
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}
