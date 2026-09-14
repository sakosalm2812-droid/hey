import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { HEY_THEMES } from '../lib/themes.js';
import { themeTokens, validAccent } from '../lib/themeTokens.js';
export { HEY_THEMES } from '../lib/themes.js';
const ThemeContext = createContext(null);
function read(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => {
    const saved = read('hey_theme', 'pearl');
    return HEY_THEMES[saved] ? saved : 'pearl';
  });
  const [customAccent, updateAccent] = useState(() => validAccent(read('hey_custom_accent', '#B9C6FF')));
  const [reduceTransparency, setReduceTransparency] = useState(() => read('hey_reduce_transparency', 'false') === 'true');
  const theme = HEY_THEMES[themeId];
  useEffect(() => {
    const root = document.documentElement;
    const tokens = themeTokens(theme, themeId === 'custom' ? customAccent : undefined);
    Object.entries(tokens).forEach(([key, value]) => root.style.setProperty(key, value));
    root.dataset.heyTheme = themeId;
    root.dataset.heyLight = String(Boolean(theme.light));
    root.dataset.reduceTransparency = String(reduceTransparency);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
    try {
      localStorage.setItem('hey_theme', themeId);
      localStorage.setItem('hey_custom_accent', customAccent);
      localStorage.setItem('hey_theme_css', JSON.stringify(tokens));
      localStorage.setItem('hey_theme_light', String(Boolean(theme.light)));
      localStorage.setItem('hey_reduce_transparency', String(reduceTransparency));
    } catch { /* Themes still work when browser storage is unavailable. */ }
  }, [theme, themeId, customAccent, reduceTransparency]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === 'hey_theme' && HEY_THEMES[event.newValue]) setThemeId(event.newValue);
      if (event.key === 'hey_custom_accent') updateAccent(validAccent(event.newValue));
      if (event.key === 'hey_reduce_transparency') setReduceTransparency(event.newValue === 'true');
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const value = useMemo(() => ({
    theme, themeId, themes: HEY_THEMES, customAccent, reduceTransparency, setReduceTransparency,
    setTheme: id => { if (HEY_THEMES[id]) setThemeId(id); },
    setCustomAccent: color => updateAccent(validAccent(color)),
  }), [theme, themeId, customAccent, reduceTransparency]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useHEYTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useHEYTheme must be used inside ThemeProvider');
  return value;
}
