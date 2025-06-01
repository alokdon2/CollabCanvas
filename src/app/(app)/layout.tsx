
"use client"; 
import { useEffect } from 'react';
import { Navbar } from "@/components/Navbar";
import { useProjectContext } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext"; // Import useAuth
import { useRouter } from "next/navigation"; // Import useRouter
import { Loader2 } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { currentProjectName } = useProjectContext();
  const { user, loading: authLoading } = useAuth(); // Get user and authLoading state
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth/login"); // Redirect if not loading and no user
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    // Show a loading state or a minimal layout while checking auth or if user is null (before redirect)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading user session...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar currentProjectName={currentProjectName} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
