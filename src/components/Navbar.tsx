
"use client";
import Link from 'next/link';
import AppLogo from '@/components/AppLogo';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { UserProfileDropdown } from '@/components/UserProfileDropdown';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilePlus2, FolderPlus, PlusCircle } from "lucide-react";
import { useProjectContext } from "@/contexts/ProjectContext";

interface NavbarProps {
  currentProjectName?: string | null;
}

export function Navbar({ currentProjectName }: NavbarProps) {
  const { requestNewFile, requestNewFolder } = useProjectContext();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center px-4 sm:px-6 lg:px-8">
        <AppLogo />
        {currentProjectName && (
          <>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="font-medium text-foreground truncate max-w-[150px] sm:max-w-xs">{currentProjectName}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-2">
                  <PlusCircle className="h-5 w-5" />
                  <span className="sr-only">New Item</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={requestNewFile}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  <span>New File</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={requestNewFolder}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  <span>New Folder</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
