import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ThemePalette } from '../types/loyalty';

interface ThemeContextValue {
  palette: ThemePalette;
  isDark: boolean;
  setPalette: (palette: ThemePalette) => void;
  toggleDarkLight: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_PALETTES: ThemePalette[] = ['obsidian', 'gold'];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [palette, setPaletteState] = useState<ThemePalette>(() => {
    try {
      const saved = window.localStorage.getItem('yos_theme_palette') as ThemePalette | null;
      if (saved && ['obsidian', 'gold', 'cream', 'white'].includes(saved)) {
        return saved;
      }
    } catch {
      // Storage unavailable
    }
    return 'obsidian';
  });

  const isDark = DARK_PALETTES.includes(palette);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', palette);
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('yos_theme_palette', palette);
    } catch {
      // Ignore storage failures
    }
  }, [palette, isDark]);

  const setPalette = (next: ThemePalette) => {
    setPaletteState(next);
  };

  const toggleDarkLight = () => {
    setPaletteState((prev) => {
      if (prev === 'obsidian') return 'cream';
      if (prev === 'gold') return 'white';
      if (prev === 'cream') return 'obsidian';
      return 'gold';
    });
  };

  return (
    <ThemeContext.Provider value={{ palette, isDark, setPalette, toggleDarkLight }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
