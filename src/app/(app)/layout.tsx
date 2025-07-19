
"use client"; 

import { Navbar } from "@/components/Navbar";
import { useProjectContext } from "@/contexts/ProjectContext";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { currentProjectName } = useProjectContext();

  // The authentication wall has been removed from this layout.
  // Child pages or components are now responsible for handling
  // the differences between logged-in and logged-out states.

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar currentProjectName={currentProjectName} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
