import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { SupportedLanguage, Translations } from './types'
import { es } from './locales/es'
import { en } from './locales/en'
import { fr } from './locales/fr'
import { zh } from './locales/zh'

const TRANSLATION_MAP: Record<SupportedLanguage, Translations> = {
  es,
  en,
  fr,
  zh
}

const LANGUAGE_STORAGE_KEY = 'panel.language.v1'

interface I18nContextValue {
  language: SupportedLanguage
  setLanguage: (lang: SupportedLanguage) => void
  t: Translations
}

const I18nContext = createContext<I18nContextValue | null>(null)

function detectSystemLanguage(): SupportedLanguage {
  if (typeof window === 'undefined' || !window.navigator) return 'es'
  const navLang = (window.navigator.language || '').toLowerCase()
  if (navLang.startsWith('en')) return 'en'
  if (navLang.startsWith('fr')) return 'fr'
  if (navLang.startsWith('zh')) return 'zh'
  return 'es'
}

function loadSavedLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as SupportedLanguage | null
    if (saved && (saved === 'es' || saved === 'en' || saved === 'fr' || saved === 'zh')) {
      return saved
    }
  } catch {
    /* ignore */
  }
  return detectSystemLanguage()
}

export function I18nProvider({
  children,
  initialLanguage,
  onLanguageChange
}: {
  children: ReactNode
  initialLanguage?: SupportedLanguage
  onLanguageChange?: (lang: SupportedLanguage) => void
}): JSX.Element {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    return initialLanguage || loadSavedLanguage()
  })

  const setLanguage = useCallback(
    (next: SupportedLanguage) => {
      setLanguageState(next)
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      onLanguageChange?.(next)
    },
    [onLanguageChange]
  )

  const t = useMemo(() => {
    return TRANSLATION_MAP[language] || es
  }, [language])

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t
    }),
    [language, setLanguage, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n debe usarse dentro de un <I18nProvider>')
  }
  return ctx
}

