import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'documind-theme';
const VALID_THEMES = ['dark', 'light'];

/** Apply the theme attribute to <html> so CSS [data-theme="light"] kicks in. */
const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Read persisted preference; fall back to 'dark'
    const saved = localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.includes(saved) ? saved : 'dark';
  });

  // Sync attribute on first render and whenever theme changes
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
};
