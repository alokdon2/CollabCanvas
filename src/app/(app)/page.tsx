
"use client";

import { useState, useEffect } from "react";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { ProjectCard } from "@/components/ProjectCard";
import useLocalStorage from "@/hooks/use-local-storage";
import type { Project } from "@/lib/types";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { Input } from "@/components/ui/input";
import { Search, LayoutDashboard } from "lucide-react"; // Added LayoutDashboard

const initialProjects: Project[] = [
  {
    id: "1",
    name: "My First Project",
    textContent: "This is the content of my first project's document.",
    whiteboardContent: {
      elements: [
        { 
          type: "rectangle", x: 10, y: 10, width: 100, height: 50, id: "rect1", 
          strokeColor: "#000000", backgroundColor: "transparent", fillStyle: "hachure", 
          strokeWidth: 1, strokeStyle: "solid", roughness: 1, opacity: 100, 
          groupIds: [], roundness: { type: 2 }, seed: 12345, version: 1, versionNonce: 123, 
          isDeleted: false, boundElementIds: null, // Corrected typo from 'มุมboundElementIds'
          updated: 1678886400000 // Static timestamp instead of Date.now()
        } as any 
      ],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {}
    },
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];


export default function DashboardPage() {
  const [projects, setProjects] = useLocalStorage<Project[]>("collabcanvas-projects", initialProjects);
  const [searchTerm, setSearchTerm] = useState("");
  const [projectToShare, setProjectToShare] = useState<Project | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCreateProject = (newProject: Project) => {
    setProjects((prevProjects) => [...prevProjects, newProject]);
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects((prevProjects) => prevProjects.filter((p) => p.id !== projectId));
  };

  const handleShareProject = (project: Project) => {
    setProjectToShare(project);
    setIsShareDialogOpen(true);
  };

  const filteredProjects = projects.filter(project => 
    project.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!mounted) {
    // To avoid hydration mismatch with localStorage
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">My Projects</h1>
        </div>
        <p>Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold tracking-tight">My Projects</h1>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search projects..." 
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <CreateProjectDialog onCreateProject={handleCreateProject} />
        </div>
      </div>

      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((project) => (
            <ProjectCard 
              key={project.id} 
              project={project} 
              onDeleteProject={handleDeleteProject}
              onShareProject={handleShareProject}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10">
          <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-xl font-semibold">No projects found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchTerm ? "Try a different search term or " : "Get started by "}
             creating a new project. {/* Simplified the "Create Project" part here */}
          </p>
           {!searchTerm && <CreateProjectDialog onCreateProject={handleCreateProject} />}
        </div>
      )}
      {projectToShare && (
        <ShareProjectDialog
          project={projectToShare}
          isOpen={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
        />
      )}
    </div>
  );
}

