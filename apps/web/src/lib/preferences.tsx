import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translations, type Lang, type TranslationKey } from './translations';

export type ThemePref = 'light' | 'dark' | 'system';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode / blocked storage: preference just won't persist
  }
}

function applyTheme(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

interface Preferences {
  lang: Lang;
  setLang: (lang: Lang) => void;
  theme: ThemePref;
  setTheme: (theme: ThemePref) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const PreferencesContext = createContext<Preferences | null>(null);

function initialLang(): Lang {
  const stored = read('pt-lang');
  if (stored === 'en' || stored === 'vi') return stored;
  return navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [theme, setThemeState] = useState<ThemePref>(() => (read('pt-theme') as ThemePref | null) ?? 'system');

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setLang = useCallback((next: Lang) => {
    write('pt-lang', next);
    setLangState(next);
  }, []);

  const setTheme = useCallback((next: ThemePref) => {
    write('pt-theme', next);
    setThemeState(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      let text = translations[lang][key] ?? translations.en[key] ?? key;
      if (vars) for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
      return text;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, theme, setTheme, t }), [lang, setLang, theme, setTheme, t]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}

export function useT() {
  return usePreferences().t;
}
