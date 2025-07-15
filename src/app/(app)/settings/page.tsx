
'use client';

import { useTheme, type Theme } from "@/components/providers/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Sun, Moon, Palette } from "lucide-react";

const themes: { name: Theme; description: string; icon: React.ElementType }[] = [
  { name: 'light', description: 'A clean and simple light theme.', icon: Sun },
  { name: 'midnight', description: 'A high-contrast dark theme.', icon: Moon },
  { name: 'latte', description: 'A warm, low-contrast light theme.', icon: Sun },
  { name: 'matrix', description: 'A classic green-on-black "hacker" theme.', icon: Moon },
  { name: 'sakura', description: 'A soft, cherry-blossom inspired theme.', icon: Sun },
  { name: 'strawhat', description: 'An adventurous theme for a pirate king.', icon: Sun },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
       <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <SettingsIcon className="h-8 w-8" />
            Settings
        </h1>
        <p className="text-muted-foreground mt-1">
            Customize the application to your liking.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette/>App Theme</CardTitle>
          <CardDescription>
            Select a theme to change the appearance of the entire application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={theme}
            onValueChange={(newTheme: string) => setTheme(newTheme as Theme)}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {themes.map((t) => (
              <Label
                key={t.name}
                htmlFor={`theme-${t.name}`}
                className="flex flex-col items-start gap-4 rounded-lg border p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary"
              >
                <div className="flex items-center w-full justify-between">
                    <div className="flex items-center gap-2">
                        <t.icon className="h-5 w-5" />
                        <span className="font-semibold text-lg capitalize">{t.name}</span>
                    </div>
                    <RadioGroupItem value={t.name} id={`theme-${t.name}`} />
                </div>
                <p className="text-sm text-muted-foreground">{t.description}</p>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  );
}
