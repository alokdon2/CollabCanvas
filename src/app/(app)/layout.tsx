
"use client"; // Required for using context hook
import { Navbar } from "@/components/Navbar";
import { useProjectContext } from "@/contexts/ProjectContext";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { currentProjectName } = useProjectContext();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar currentProjectName={currentProjectName} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
