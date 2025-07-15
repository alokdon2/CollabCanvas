
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const THEMES = ['light', 'dark', 'midnight', 'latte', 'matrix'] as const;

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
    root.classList.remove(...THEMES);
    
    // Determine the effective theme
    let effectiveTheme: (typeof THEMES)[number];
    if (theme === "system") {
      effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } else {
      effectiveTheme = theme;
    }

    // Add the appropriate theme class
    const themeClass = effectiveTheme === 'light' || effectiveTheme === 'latte' ? effectiveTheme : `theme-${effectiveTheme}`;
    if(effectiveTheme !== 'light' && effectiveTheme !== 'latte') {
      root.classList.add(themeClass);
    }
    
    // Add 'dark' class for dark-like themes for component compatibility
    if (['dark', 'midnight', 'matrix'].includes(effectiveTheme)) {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
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
