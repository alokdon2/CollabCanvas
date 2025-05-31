
"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import type { Theme } from "@/components/providers/ThemeProvider"; // Assuming Theme is exported or define it here

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme(); // theme can be 'light', 'dark', or 'system'
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    // Determine the currently *displayed* theme
    let currentDisplayedTheme: Theme = theme;
    if (theme === "system" && typeof window !== 'undefined') {
      currentDisplayedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    // Now toggle based on the displayed theme
    setTheme(currentDisplayedTheme === "light" ? "dark" : "light");
  };

  if (!mounted) {
    // Avoid rendering button server-side or before hydration to prevent mismatch
    // You can return a placeholder or null
    return <Button variant="ghost" size="icon" disabled className="h-[1.2rem] w-[1.2rem]" />;
  }

  // Determine the theme to display the icon for
  let iconTheme: Theme = theme;
  if (theme === "system" && typeof window !== 'undefined') {
    iconTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
      {iconTheme === "light" ? (
        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all" />
      ) : (
        <Moon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
