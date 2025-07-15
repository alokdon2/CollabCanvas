
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const THEMES = ['light', 'midnight', 'latte', 'matrix', 'sakura', 'strawhat'] as const;
const THEME_CLASSES = ['theme-midnight', 'theme-latte', 'theme-matrix', 'theme-sakura', 'theme-strawhat', 'dark'];

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
    
    // Remove all possible theme classes first to ensure a clean slate
    root.classList.remove(...THEME_CLASSES);
    
    // Determine the effective theme that will be applied
    let effectiveThemeName: (typeof THEMES)[number];
    if (theme === "system") {
      const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      // Default system dark to midnight, otherwise light
      effectiveThemeName = systemIsDark ? "midnight" : "light";
    } else {
      effectiveThemeName = theme;
    }

    // Add the specific theme class
    const themeClassName = `theme-${effectiveThemeName}`;
    if (effectiveThemeName !== 'light') { // 'light' is the default, no class needed
      root.classList.add(themeClassName);
    }
    
    // Also add the generic 'dark' class for themes that are dark in nature
    // This helps with broad component compatibility (e.g., shadcn's prose-invert)
    if (['midnight', 'matrix'].includes(effectiveThemeName)) {
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
