
"use client";
import Link from 'next/link';
import AppLogo from '@/components/AppLogo';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { UserProfileDropdown } from '@/components/UserProfileDropdown';

interface NavbarProps {
  currentProjectName?: string | null;
}

export function Navbar({ currentProjectName }: NavbarProps) {

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center px-4 sm:px-6 lg:px-8"> {/* Changed h-16 to h-14 */}
        <AppLogo />
        {currentProjectName && (
          <>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="font-medium text-foreground truncate max-w-[150px] sm:max-w-xs">{currentProjectName}</span>
          </>
        )}
        <div className="flex flex-1 items-center justify-end space-x-2"> {/* Changed space-x-4 to space-x-2 and removed nested nav */}
          <ThemeSwitcher />
          <UserProfileDropdown />
        </div>
      </div>
    </header>
  );
}

