import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ThemeMode } from '@panel/core-sdk'

interface ThemeContextValue {
  mode: ThemeMode
  resolved: 'dark' | 'light'
  setMode: (mode: ThemeMode) => void
  cycleMode: () => void
}

const THEME_STORAGE_KEY = 'panel.theme.v1'

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function loadSavedMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved
  } catch {
    /* ignore */
  }
  return 'dark'
}

export function ThemeProvider({
  children,
  onResolvedChange
}: {
  children: ReactNode
  onResolvedChange?: (resolved: 'dark' | 'light') => void
}): JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(loadSavedMode)
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(getSystemTheme)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = (e: MediaQueryListEvent): void => {
      setSystemTheme(e.matches ? 'light' : 'dark')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const resolved: 'dark' | 'light' = mode === 'system' ? systemTheme : mode

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('theme-dark', 'theme-light', 'dark', 'light')
    root.classList.add(`theme-${resolved}`, resolved)
    root.style.colorScheme = resolved
    onResolvedChange?.(resolved)
  }, [resolved, onResolvedChange])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const cycleMode = useCallback(() => {
    const order: ThemeMode[] = ['dark', 'light', 'system']
    const next = order[(order.indexOf(mode) + 1) % order.length]
    setMode(next)
  }, [mode, setMode])

  const value = useMemo(
    () => ({ mode, resolved, setMode, cycleMode }),
    [mode, resolved, setMode, cycleMode]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}

