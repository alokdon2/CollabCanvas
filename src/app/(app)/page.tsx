
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { ProjectCard } from "@/components/ProjectCard";
import type { Project, WhiteboardData, FileSystemNode } from "@/lib/types";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { Input } from "@/components/ui/input";
import { Search, LayoutDashboard, Loader2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getAllProjectsFromFirestore,
  createProjectInFirestore,
  deleteProjectFromFirestore,
  ensureNodeContentDefaults,
} from "@/services/realtimeCollaborationService";
import { dbGetAllProjects, dbSaveProject, dbDeleteProject, dbSaveAllProjects } from "@/lib/indexedDB";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA: WhiteboardData = {
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false },
  files: {}
};

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [projectToShare, setProjectToShare] = useState<Project | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isSyncPromptOpen, setIsSyncPromptOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  const checkForLocalDataAndPromptSync = useCallback(async () => {
    if (user && !authLoading) {
      const localProjects = await dbGetAllProjects();
      if (localProjects.length > 0) {
        setIsSyncPromptOpen(true);
      }
    }
  }, [user, authLoading]);

  useEffect(() => {
    checkForLocalDataAndPromptSync();
  }, [checkForLocalDataAndPromptSync]);

  useEffect(() => {
    if (!mounted) {
      setIsLoading(true);
      return;
    }

    async function loadProjects() {
      setIsLoading(true);
      try {
        let loadedProjects;
        if (user) {
          loadedProjects = await getAllProjectsFromFirestore(user.uid);
        } else {
          loadedProjects = await dbGetAllProjects();
          loadedProjects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        }
        setProjects(loadedProjects);
      } catch (error) {
        console.error("Failed to load projects:", error);
        toast({ title: "Error Loading Projects", description: `Could not load your projects: ${(error as Error).message}`, variant: "destructive" });
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadProjects();
  }, [mounted, toast, user]);

  const handleSyncProjects = async () => {
    if (!user) {
      toast({ title: "Login required", description: "You must be logged in to sync projects.", variant: "destructive" });
      return;
    }
    setIsSyncing(true);
    try {
      const localProjects = await dbGetAllProjects();
      const firestoreProjects = await getAllProjectsFromFirestore(user.uid);
      
      const firestoreProjectMap = new Map(firestoreProjects.map(p => [p.id, p]));
      
      const projectsToUpload: Project[] = [];
      const projectsToKeepInFirestore: Project[] = [];

      for (const local of localProjects) {
        const cloud = firestoreProjectMap.get(local.id);
        if (!cloud || new Date(local.updatedAt) > new Date(cloud.updatedAt)) {
          projectsToUpload.push({ ...local, ownerId: user.uid });
        }
      }

      firestoreProjects.forEach(p => projectsToKeepInFirestore.push(p));

      for (const proj of projectsToUpload) {
        await createProjectInFirestore(proj);
        const index = projectsToKeepInFirestore.findIndex(p => p.id === proj.id);
        if (index > -1) {
            projectsToKeepInFirestore[index] = proj;
        } else {
            projectsToKeepInFirestore.push(proj);
        }
      }

      // Clear local projects after successful sync
      for(const p of localProjects) {
        await dbDeleteProject(p.id);
      }
      
      setProjects(projectsToKeepInFirestore.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
      toast({ title: "Sync Complete", description: "Your local projects have been synced to your account." });
    } catch (error) {
      console.error("Error syncing projects:", error);
      toast({ title: "Sync Error", description: `Could not sync projects: ${(error as Error).message}`, variant: "destructive" });
    } finally {
      setIsSyncing(false);
      setIsSyncPromptOpen(false);
    }
  };


  const handleCreateProject = useCallback(async (newProjectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'fileSystemRoots' | 'ownerId'>) => {
    const now = new Date().toISOString();
    const newProjectId = crypto.randomUUID();

    const projectBase = {
      ...newProjectData,
      id: newProjectId,
      ownerId: user?.uid,
      textContent: newProjectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: newProjectData.whiteboardContent || {...DEFAULT_EMPTY_WHITEBOARD_DATA},
      fileSystemRoots: newProjectData.fileSystemRoots ? ensureNodeContentDefaults(newProjectData.fileSystemRoots) : [],
      createdAt: now,
      updatedAt: now,
      viewers: {},
    };

    try {
      let newProject: Project;
      if (user) {
        newProject = await createProjectInFirestore(projectBase);
        toast({ title: "Project Created", description: `"${newProject.name}" has been created in the cloud.`});
      } else {
        newProject = projectBase;
        await dbSaveProject(newProject);
        toast({ title: "Local Project Created", description: `"${newProject.name}" has been saved to your browser.`});
      }
      setProjects((prevProjects) => [newProject, ...prevProjects]);

    } catch (error) {
      console.error("Failed to create project", error);
      toast({ title: "Error Creating Project", description: "Could not create project.", variant: "destructive" });
    }
  }, [toast, user]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    const projectToDelete = projects.find(p => p.id === projectId);
    if (!projectToDelete) return;
    
    // For cloud projects, only the owner can delete
    if (projectToDelete.ownerId && (!user || user.uid !== projectToDelete.ownerId)) {
         toast({ title: "Permission Denied", description: "You are not the owner of this project.", variant: "destructive" });
         return;
    }
    
    try {
      if (projectToDelete.ownerId && user) {
        await deleteProjectFromFirestore(projectId);
      } else {
        await dbDeleteProject(projectId);
      }
      setProjects((prevProjects) => prevProjects.filter((p) => p.id !== projectId));
      toast({ title: "Project Deleted", description: `"${projectToDelete.name}" has been deleted.`});
    } catch (error) {
      console.error("Failed to delete project", error);
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

  if (!mounted || (authLoading && !projects.length)) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">My Projects</h1>
        </div>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">{authLoading ? "Authenticating..." : "Loading projects..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      {!user && (
        <div className="mb-6 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-6 text-center shadow-sm">
          <Info className="h-8 w-8 text-primary" />
          <h3 className="text-lg font-semibold text-primary">You are not logged in.</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Your projects are being saved locally to this browser. To save your work to the cloud and access it from any device, please sign in or create an account.
          </p>
          <div className="mt-2 flex gap-2">
            <Button asChild>
              <Link href="/auth/login">Login</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/auth/signup">Sign Up</Link>
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={isSyncPromptOpen} onOpenChange={setIsSyncPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync Local Projects?</AlertDialogTitle>
            <AlertDialogDescription>
              We found some projects saved locally in this browser. Would you like to sync them with your account? This may overwrite cloud data if the local version is newer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={async () => {
                const localProjects = await dbGetAllProjects();
                for (const p of localProjects) {
                    await dbDeleteProject(p.id);
                }
            }}>No, Discard Local Data</AlertDialogCancel>
            <AlertDialogAction onClick={handleSyncProjects} disabled={isSyncing}>
              {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Yes, Sync Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {isLoading ? (
         <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading your projects...</p>
        </div>
      ) : filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDeleteProject={handleDeleteProject}
              onShareProject={handleShareProject}
              isLocal={!user || !project.ownerId}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10">
          <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-xl font-semibold">
            {isLoading ? "Loading..." : "No projects found"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchTerm ? "Try a different search term or " : "Get started by "}
            creating a new project.
          </p>
           {!searchTerm && (
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
          isLocal={!user || !projectToShare.ownerId}
        />
      )}
    </div>
  );
}
