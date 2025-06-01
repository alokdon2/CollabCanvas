
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link"; // Added Link import
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { ProjectCard } from "@/components/ProjectCard";
import type { Project, FileSystemNode, WhiteboardData } from "@/lib/types";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { Input } from "@/components/ui/input";
import { Search, LayoutDashboard, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getAllProjectsFromFirestore,
  createProjectInFirestore,
  deleteProjectFromFirestore,
  ensureNodeContentDefaults, // Import for ensuring defaults
} from "@/services/realtimeCollaborationService"; // Switch to Firestore service
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA: WhiteboardData = {
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false },
  files: {}
};

// This function is now imported from realtimeCollaborationService
// const ensureNodeContentDefaults = (nodes: FileSystemNode[]): FileSystemNode[] => { ... }


export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [projectToShare, setProjectToShare] = useState<Project | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    setMounted(true);
    // No need for window check for Firestore
  }, []);

  useEffect(() => {
    if (!mounted || authLoading) {
      setIsLoading(true);
      return;
    }

    async function loadProjects() {
      if (!user) {
        setProjects([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        // Use Firestore function
        const firestoreProjects = await getAllProjectsFromFirestore(user.uid);
        // ensureNodeContentDefaults is likely applied within getAllProjectsFromFirestore now or data is client-ready
        setProjects(firestoreProjects);
      } catch (error) {
        console.error("Failed to load projects from Firestore for user", user.uid, error);
        toast({ title: "Error Loading Projects", description: `Could not load your projects: ${(error as Error).message}`, variant: "destructive" });
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadProjects();
  }, [mounted, toast, authLoading, user]);

  const handleCreateProject = useCallback(async (newProjectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'fileSystemRoots' | 'ownerId'>) => {
    if (!user) {
      toast({ title: "Authentication Required", description: "You must be logged in to create a project.", variant: "destructive" });
      return;
    }

    const projectDataWithOwner: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
      ...newProjectData,
      ownerId: user.uid,
      // Defaults are usually handled by createProjectInFirestore or ensureNodeContentDefaults
      textContent: newProjectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: newProjectData.whiteboardContent || {...DEFAULT_EMPTY_WHITEBOARD_DATA},
      fileSystemRoots: newProjectData.fileSystemRoots ? ensureNodeContentDefaults(newProjectData.fileSystemRoots) : [],
    };

    try {
      // Use Firestore function
      const newProject = await createProjectInFirestore(projectDataWithOwner);
      setProjects((prevProjects) => [newProject, ...prevProjects]); // Add to start for recency
      toast({ title: "Project Created", description: `"${newProject.name}" has been created.`});
    } catch (error) {
      console.error("Failed to create project in Firestore", error);
      toast({ title: "Error Creating Project", description: "Could not create project.", variant: "destructive" });
    }
  }, [toast, user]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    const projectToDelete = projects.find(p => p.id === projectId);
    if (user && projectToDelete?.ownerId !== user.uid) {
         toast({ title: "Permission Denied", description: "You are not the owner of this project.", variant: "destructive" });
         return;
    }
    try {
      // Use Firestore function
      await deleteProjectFromFirestore(projectId);
      setProjects((prevProjects) => prevProjects.filter((p) => p.id !== projectId));
      toast({ title: "Project Deleted", description: `"${projectToDelete?.name || 'Project'}" has been deleted.`});
    } catch (error) {
      console.error("Failed to delete project from Firestore", error);
      toast({ title: "Error Deleting Project", description: "Could not delete project.", variant: "destructive" });
    }
  }, [projects, toast, user]);

  const handleShareProject = (project: Project) => {
    setProjectToShare(project);
    setIsShareDialogOpen(true);
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!mounted || isLoading || authLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">My Projects</h1>
        </div>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">{authLoading ? "Authenticating..." : "Loading your projects..."}</p>
        </div>
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
          <CreateProjectDialog onCreateProject={(newProjectData) => handleCreateProject(newProjectData as Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>)} />
        </div>
      </div>

      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
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
          <h3 className="mt-2 text-xl font-semibold">
            {user ? (isLoading ? "Loading..." : "No projects found") : "Please sign in"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {user ? (searchTerm ? "Try a different search term or " : "Get started by ") : "Sign in to see your projects or "}
            {user && !isLoading && "creating a new project."}
            {!user && <Link href="/auth/login" className="text-primary hover:underline">create an account</Link>}
          </p>
           {!searchTerm && user && !isLoading && (
            <div className="mt-4">
              <CreateProjectDialog onCreateProject={(newProjectData) => handleCreateProject(newProjectData as Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>)} />
            </div>
           )}
        </div>
      )}
      {projectToShare && (
        <ShareProjectDialog
          project={projectToShare}
          isOpen={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          isLocal={false} // Indicate Firestore backend for ShareDialog text
        />
      )}
    </div>
  );
}
