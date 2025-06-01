
"use client";

import { LogOut, User, Settings, LogIn } from "lucide-react"; // Added LogIn
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext"; // Import useAuth

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


export function UserProfileDropdown() {
  const { user, signOutUser, loading } = useAuth();

  if (loading) {
    return (
        <Button variant="ghost" className="relative h-8 w-8 rounded-full" disabled>
            <Avatar className="h-8 w-8">
                <AvatarFallback>...</AvatarFallback>
            </Avatar>
        </Button>
    );
  }

  if (!user) {
    return (
      <Button variant="ghost" asChild>
        <Link href="/auth/login">
          <LogIn className="mr-2 h-4 w-4" />
          Sign In
        </Link>
      </Button>
    );
  }
  
  const userName = user.displayName || user.email?.split('@')[0] || "User";
  const userEmail = user.email || "No email provided";
  const userAvatarFallback = userName.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8" data-ai-hint="profile person">
            <AvatarImage src={user.photoURL || `https://placehold.co/40x40.png`} alt={userName} />
            <AvatarFallback>{userAvatarFallback}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{userName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {userEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild disabled>
            <Link href="/profile"> {/* Placeholder link */}
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild disabled>
            <Link href="/settings"> {/* Placeholder link */}
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOutUser} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
