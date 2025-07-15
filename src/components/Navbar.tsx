
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
      <div className=" flex justify-between h-14 items-center px-2"> {/* Changed h-16 to h-14 */}
       <div className='flex items-center gap-2'>  <AppLogo />
        {currentProjectName && (
          <>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="font-medium text-foreground truncate max-w-[150px] sm:max-w-xs">{currentProjectName}</span>
          </>
        )} </div>
        <div className="flex items-center space-x-2"> {/* Changed space-x-4 to space-x-2 and removed nested nav */}
          <ThemeSwitcher />
          <UserProfileDropdown />
        </div>
      </div>
    </header>
  );
}


