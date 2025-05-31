
"use client";

import { useState, useEffect, useCallback } from "react";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { ProjectCard } from "@/components/ProjectCard";
import type { Project, FileSystemNode, WhiteboardData } from "@/lib/types";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { Input } from "@/components/ui/input";
import { Search, LayoutDashboard, FolderOpen, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  getAllProjectsFromFirestore, 
  createProjectInFirestore, 
  deleteProjectFromFirestore 
} from "@/services/realtimeCollaborationService"; // Updated service imports

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA: WhiteboardData = {
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false },
  files: {}
};

const ensureNodeContentDefaults = (nodes: FileSystemNode[]): FileSystemNode[] => {
  return nodes.map(node => ({
    ...node,
    textContent: node.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
    whiteboardContent: node.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA },
    ...(node.children && { children: ensureNodeContentDefaults(node.children) }),
  }));
};

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [projectToShare, setProjectToShare] = useState<Project | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
    async function loadProjects() {
      setIsLoading(true);
      try {
        const firestoreProjects = await getAllProjectsFromFirestore();
        // Ensure content defaults are applied when loading from Firestore
        const projectsWithFinalContentDefaults = firestoreProjects.map(p => ({
          ...p,
          textContent: p.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
          whiteboardContent: p.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA },
          fileSystemRoots: ensureNodeContentDefaults(p.fileSystemRoots || [])
        }));
        setProjects(projectsWithFinalContentDefaults);
      } catch (error) {
        console.error("Failed to load projects from Firestore", error);
        toast({ title: "Error Loading Projects", description: `Could not load projects: ${(error as Error).message}`, variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    }
    if (typeof window !== 'undefined') { 
        loadProjects();
    } else {
        setIsLoading(false); 
    }
  }, [toast]);

  const handleCreateProject = useCallback(async (newProjectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'fileSystemRoots'>) => {
    // Augment with default content fields before sending to Firestore service
    const augmentedData = {
      ...newProjectData,
      fileSystemRoots: ensureNodeContentDefaults(newProjectData.fileSystemRoots || []),
      textContent: newProjectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: newProjectData.whiteboardContent || {...DEFAULT_EMPTY_WHITEBOARD_DATA},
    };
    try {
      const newProject = await createProjectInFirestore(augmentedData);
      setProjects((prevProjects) => [newProject, ...prevProjects]); // Add to start of list for immediate visibility
      toast({ title: "Project Created", description: `"${newProject.name}" has been created.`});
    } catch (error) {
      console.error("Failed to create project in Firestore", error);
      toast({ title: "Error Creating Project", description: "Could not create project.", variant: "destructive" });
    }
  }, [toast]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    const projectToDelete = projects.find(p => p.id === projectId);
    try {
      await deleteProjectFromFirestore(projectId);
      setProjects((prevProjects) => prevProjects.filter((p) => p.id !== projectId));
      toast({ title: "Project Deleted", description: `"${projectToDelete?.name || 'Project'}" has been deleted.`});
    } catch (error) {
      console.error("Failed to delete project from Firestore", error);
      toast({ title: "Error Deleting Project", description: "Could not delete project.", variant: "destructive" });
    }
  }, [projects, toast]);

  const handleShareProject = (project: Project) => {
    setProjectToShare(project);
    setIsShareDialogOpen(true);
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!mounted || isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">My Projects</h1>
        </div>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading projects from cloud...</p>
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
          <CreateProjectDialog onCreateProject={(newProjectData) => handleCreateProject(newProjectData as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>)} />
        </div>
      </div>

      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Projects are already sorted by 'updatedAt' (desc) from Firestore query */}
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
          <h3 className="mt-2 text-xl font-semibold">No projects found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchTerm ? "Try a different search term or " : "Get started by "}
             creating a new project.
          </p>
           {!searchTerm && (
            <div className="mt-4">
              <CreateProjectDialog onCreateProject={(newProjectData) => handleCreateProject(newProjectData as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>)} />
            </div>
           )}
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
