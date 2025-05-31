
"use client";
import Link from 'next/link';
import AppLogo from '@/components/AppLogo';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { UserProfileDropdown } from '@/components/UserProfileDropdown';
// Removed Button, DropdownMenu components, and icons related to new item creation
// Removed useProjectContext as it's no longer used here for new item creation

interface NavbarProps {
  currentProjectName?: string | null;
}

export function Navbar({ currentProjectName }: NavbarProps) {
  // Removed requestNewFile and requestNewFolder from useProjectContext

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center px-4 sm:px-6 lg:px-8">
        <AppLogo />
        {currentProjectName && (
          <>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="font-medium text-foreground truncate max-w-[150px] sm:max-w-xs">{currentProjectName}</span>
            {/* DropdownMenu for New File/Folder removed from here */}
          </>
        )}
        <div className="flex flex-1 items-center justify-end space-x-4">
          <nav className="flex items-center space-x-2">
            <ThemeSwitcher />
            <UserProfileDropdown />
          </nav>
        </div>
      </div>
    </header>
  );
}
