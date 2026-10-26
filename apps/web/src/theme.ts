// Light or dark mode: the "dark" class on <html> switches the shadcn palette in
// @app/ui/theme.css. index.html applies the saved (or OS) theme before the first
// paint; this reads and changes it afterwards, and remembers the choice.
export type Theme = 'light' | 'dark'

export const currentTheme = (): Theme =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // Storage can be blocked (private mode); the toggle still works for this visit.
  }
}
