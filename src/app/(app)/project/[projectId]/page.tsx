"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar"; // Import Navbar here for project-specific title
import { RichTextEditor } from "@/components/RichTextEditor";
import { Whiteboard } from "@/components/Whiteboard";
import { ResizablePanels } from "@/components/ResizablePanels";
import useLocalStorage from "@/hooks/use-local-storage";
import type { Project, WhiteboardData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Trash2, Edit, Check } from "lucide-react";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [projects, setProjects] = useLocalStorage<Project[]>("collabcanvas-projects", []);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [textContent, setTextContent] = useState("");
  const [whiteboardContent, setWhiteboardContent] = useState<WhiteboardData | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [mounted, setMounted] = useState(false);


  useEffect(() => {
    setMounted(true);
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setCurrentProject(project);
      setTextContent(project.textContent);
      setWhiteboardContent(project.whiteboardContent);
      setEditingProjectName(project.name);
    } else if (mounted && projects.length > 0) { // Only redirect if projects have loaded and project not found
      // router.replace("/"); // Project not found
    }
  }, [projectId, projects, router, mounted]);

  // Auto-save functionality (debounced)
  useEffect(() => {
    if (!currentProject || !mounted) return;

    const handler = setTimeout(() => {
      setProjects((prevProjects) =>
        prevProjects.map((p) =>
          p.id === projectId
            ? { ...p, textContent, whiteboardContent, name: currentProject.name, updatedAt: new Date().toISOString() }
            : p
        )
      );
    }, 1000); // Save 1 second after last change

    return () => clearTimeout(handler);
  }, [textContent, whiteboardContent, currentProject, projectId, setProjects, mounted]);


  const handleTextChange = (newText: string) => {
    setTextContent(newText);
  };

  const handleWhiteboardChange = (newData: WhiteboardData) => {
    setWhiteboardContent(newData);
  };
  
  const handleNameEditToggle = () => {
    if (isEditingName && currentProject) { // Save logic
        if (editingProjectName.trim() !== currentProject.name && editingProjectName.trim() !== "") {
            const updatedProject = { ...currentProject, name: editingProjectName.trim(), updatedAt: new Date().toISOString() };
            setCurrentProject(updatedProject);
            setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
        } else {
            setEditingProjectName(currentProject.name); // Reset if invalid or unchanged
        }
    }
    setIsEditingName(!isEditingName);
  };

  const handleDeleteProject = () => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    router.replace("/");
  };

  if (!mounted || !currentProject) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar /> {/* Show navbar even while loading */}
        <div className="flex flex-1 items-center justify-center">
          <p>Loading project...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen flex-col fixed inset-0">
       <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="mr-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {isEditingName ? (
            <Input 
              value={editingProjectName}
              onChange={(e) => setEditingProjectName(e.target.value)}
              onBlur={handleNameEditToggle}
              onKeyDown={(e) => e.key === 'Enter' && handleNameEditToggle()}
              className="h-9 text-lg font-semibold max-w-xs"
              autoFocus
            />
          ) : (
            <h1 className="text-lg font-semibold truncate max-w-xs cursor-pointer hover:underline" onClick={handleNameEditToggle}>
              {currentProject.name}
            </h1>
          )}
          <Button variant="ghost" size="icon" onClick={handleNameEditToggle} className="ml-2">
            {isEditingName ? <Check className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
          </Button>

          <div className="flex flex-1 items-center justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsShareDialogOpen(true)}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" aria-label="Delete project">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the
                    project "{currentProject.name}".
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteProject}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
             {/* UserProfileDropdown can be added back if needed, but Navbar is not used directly for page title here */}
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <ResizablePanels
          leftPanel={
            <RichTextEditor 
              value={textContent} 
              onChange={handleTextChange}
              onEnhancedText={(enhancedText) => setTextContent(enhancedText)}
            />
          }
          rightPanel={
            <Whiteboard 
              initialData={whiteboardContent} 
              onChange={handleWhiteboardChange} 
            />
          }
          className="h-full" // Ensure ResizablePanels takes full height of its container
        />
      </main>
      {currentProject && (
        <ShareProjectDialog
          project={currentProject}
          isOpen={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
        />
      )}
    </div>
  );
}
