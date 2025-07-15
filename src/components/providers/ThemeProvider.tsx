
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const THEMES = ['light', 'midnight', 'latte', 'matrix', 'sakura', 'strawhat'] as const;
const THEME_CLASSES = ['theme-midnight', 'theme-latte', 'theme-matrix', 'theme-sakura', 'theme-strawhat', 'dark'];

export type Theme = (typeof THEMES)[number];

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
  theme: "light",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "collabcanvas-theme",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') {
      return defaultTheme;
    }
    try {
      return (window.localStorage.getItem(storageKey) as Theme | null) || defaultTheme;
    } catch (e) {
      console.error("Error reading theme from localStorage", e);
      return defaultTheme;
    }
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    root.classList.remove(...THEME_CLASSES);
    
    // Add the specific theme class
    const themeClassName = `theme-${theme}`;
    if (theme !== 'light') { // 'light' is the default, no class needed
      root.classList.add(themeClassName);
    }
    
    if (['midnight', 'matrix'].includes(theme)) {
        root.classList.add('dark');
    }
    
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch (e) {
      console.error("Error saving theme to localStorage", e);
    }
  }, [theme, storageKey]);

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      setTheme(newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
