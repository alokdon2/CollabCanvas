import Link from 'next/link';
import AppLogo from '@/components/AppLogo';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { UserProfileDropdown } from '@/components/UserProfileDropdown';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/config/site';

interface NavbarProps {
  currentProjectName?: string;
}

export function Navbar({ currentProjectName }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center px-4 sm:px-6 lg:px-8">
        <AppLogo />
        {currentProjectName && (
          <>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="font-medium text-foreground truncate max-w-xs">{currentProjectName}</span>
          </>
        )}
        <div className="flex flex-1 items-center justify-end space-x-4">
          <nav className="flex items-center space-x-2">
            {/* Add Share Button or other project-specific actions here if on project page */}
            <ThemeSwitcher />
            <UserProfileDropdown />
          </nav>
        </div>
      </div>
    </header>
  );
}
