
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const THEMES = ['light', 'midnight', 'latte', 'matrix', 'sakura'] as const;
const THEME_CLASSES = ['light', 'dark', 'theme-midnight', 'theme-latte', 'theme-matrix', 'theme-sakura'];

export type Theme = (typeof THEMES)[number] | 'system';

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
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
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
    
    // Remove all possible theme classes
    root.classList.remove(...THEME_CLASSES, 'dark');
    
    // Determine the effective theme
    let effectiveTheme: (typeof THEMES)[number];
    if (theme === "system") {
      const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      // Default system dark to midnight
      effectiveTheme = systemIsDark ? "midnight" : "light";
    } else {
      effectiveTheme = theme;
    }

    // Add the appropriate theme class
    switch(effectiveTheme) {
        case 'midnight':
            root.classList.add('theme-midnight');
            break;
        case 'latte':
            root.classList.add('theme-latte');
            break;
        case 'matrix':
            root.classList.add('theme-matrix');
            break;
        case 'sakura':
            root.classList.add('theme-sakura');
            break;
        case 'light':
        default:
            // No class needed for default light theme
            break;
    }
    
    // Add 'dark' class for dark-like themes for shadcn component compatibility
    if (['midnight', 'matrix'].includes(effectiveTheme)) {
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
