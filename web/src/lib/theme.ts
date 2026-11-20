import { create } from 'zustand'

export type ThemePref = 'system' | 'dark' | 'light'

const KEY = 'runcraft.theme'
const media = window.matchMedia('(prefers-color-scheme: light)')

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : 'system'
  } catch {
    return 'system'
  }
}

const resolve = (pref: ThemePref) => (pref === 'system' ? (media.matches ? 'light' : 'dark') : pref)

function apply(theme: 'dark' | 'light') {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export const useTheme = create<{ pref: ThemePref; theme: 'dark' | 'light' }>(() => {
  const pref = readPref()
  const theme = resolve(pref)
  apply(theme)
  return { pref, theme }
})

export function setTheme(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {}
  const theme = resolve(pref)
  apply(theme)
  useTheme.setState({ pref, theme })
}

media.addEventListener('change', () => {
  const { pref } = useTheme.getState()
  if (pref === 'system') setTheme('system')
})
