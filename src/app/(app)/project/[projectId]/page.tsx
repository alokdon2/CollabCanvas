
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Whiteboard } from "@/components/Whiteboard";
import useLocalStorage from "@/hooks/use-local-storage";
import type { Project, WhiteboardData, FileSystemNode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Trash2, Edit, Check, LayoutDashboard, Edit3, Rows, FolderOpen } from "lucide-react";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { Input } from "@/components/ui/input";
import { FileExplorer } from "@/components/FileExplorer";
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
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useToast } from "@/hooks/use-toast";

type ViewMode = "editor" | "whiteboard" | "both";

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [projects, setProjects] = useLocalStorage<Project[]>("collabcanvas-projects", []);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  
  const [textContent, setTextContent] = useState("<p></p>");
  const [whiteboardData, setWhiteboardData] = useState<WhiteboardData | null>(null);
  const [fileSystemRoots, setFileSystemRoots] = useState<FileSystemNode[]>([]); 
  
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [isExplorerVisible, setIsExplorerVisible] = useState(true); 

  useEffect(() => {
    setMounted(true);
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setCurrentProject(project);
      setTextContent(project.textContent?.trim() ? project.textContent : "<p></p>");
      setWhiteboardData(project.whiteboardContent || { elements: [], appState: {} });
      setFileSystemRoots(project.fileSystemRoots || []);
      setEditingProjectName(project.name);
    } else if (mounted && projects.length > 0) {
      // router.replace("/"); 
    }
  }, [projectId, projects, mounted]);

  useEffect(() => {
    if (!currentProject || !mounted) return;

    const handler = setTimeout(() => {
      setProjects((prevProjects) =>
        prevProjects.map((p) =>
          p.id === projectId
            ? { 
                ...p, 
                name: editingProjectName || p.name,
                textContent, 
                whiteboardContent: whiteboardData, 
                fileSystemRoots, 
                updatedAt: new Date().toISOString() 
              }
            : p
        )
      );
    }, 1000); 

    return () => clearTimeout(handler);
  }, [textContent, whiteboardData, fileSystemRoots, editingProjectName, currentProject, projectId, setProjects, mounted]);


  const handleTextChange = useCallback((newText: string) => {
    setTextContent(newText);
  }, []);
  
  const handleWhiteboardChange = useCallback((newData: WhiteboardData) => {
    setWhiteboardData(newData);
  }, []);
  
  const handleNameEditToggle = () => {
    if (isEditingName && currentProject) { 
        if (editingProjectName.trim() && editingProjectName.trim() !== currentProject.name) {
            setProjects(prev => prev.map(p => p.id === projectId ? { ...p, name: editingProjectName.trim(), updatedAt: new Date().toISOString() } : p));
            setCurrentProject(prev => prev ? {...prev, name: editingProjectName.trim()} : null);
        } else {
            setEditingProjectName(currentProject.name); 
        }
    }
    setIsEditingName(!isEditingName);
  };

  const handleDeleteProject = () => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    router.replace("/");
    toast({ title: "Project Deleted", description: `"${currentProject?.name}" has been deleted.` });
  };

  const handleAddNodeToTree = (nodes: FileSystemNode[], parentId: string | null, newNode: FileSystemNode): FileSystemNode[] => {
    if (parentId === null) {
      return [...nodes, newNode];
    }
    return nodes.map(node => {
      if (node.id === parentId) {
        if (node.type === 'folder') {
          return { ...node, children: [...(node.children || []), newNode] };
        }
        return node; 
      }
      if (node.children) {
        return { ...node, children: handleAddNodeToTree(node.children, parentId, newNode) };
      }
      return node;
    });
  };

  const handleAddFileToProject = (name: string, parentId: string | null) => {
    const newFile: FileSystemNode = {
      id: crypto.randomUUID(),
      name,
      type: 'file',
      content: '', 
    };
    setFileSystemRoots(prevRoots => handleAddNodeToTree(prevRoots, parentId, newFile));
    toast({ title: "File Created", description: `File "${name}" added.`});
  };

  const handleAddFolderToProject = (name: string, parentId: string | null) => {
    const newFolder: FileSystemNode = {
      id: crypto.randomUUID(),
      name,
      type: 'folder',
      children: [],
    };
    setFileSystemRoots(prevRoots => handleAddNodeToTree(prevRoots, parentId, newFolder));
    toast({ title: "Folder Created", description: `Folder "${name}" added.`});
  };
  
  const handleSelectNode = (nodeId: string, type: 'file' | 'folder') => {
    console.log(`Selected ${type}: ${nodeId}`);
    // Future: Load file content into an editor or display folder details
  };


  if (!mounted || !currentProject) {
    return (
      <div className="flex min-h-screen flex-col fixed inset-0">
         <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-16 items-center px-4 sm:px-6 lg:px-8">
                <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="mr-2">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-lg font-semibold">Loading Project...</h1>
            </div>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <p>Loading project data...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen flex-col fixed inset-0">
       <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center px-4 sm:px-6 lg:px-8">
          {/* Left section: Back button and Project Name */}
          <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="mr-2" aria-label="Back to dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div className="flex items-center">
            {isEditingName ? (
              <Input 
                value={editingProjectName}
                onChange={(e) => setEditingProjectName(e.target.value)}
                onBlur={handleNameEditToggle}
                onKeyDown={(e) => e.key === 'Enter' && handleNameEditToggle()}
                className="h-9 text-lg font-semibold max-w-[150px] sm:max-w-xs"
                autoFocus
              />
            ) : (
              <h1 className="text-lg font-semibold truncate max-w-[150px] sm:max-w-xs cursor-pointer hover:underline" onClick={handleNameEditToggle}>
                {editingProjectName}
              </h1>
            )}
            <Button variant="ghost" size="icon" onClick={handleNameEditToggle} className="ml-1" aria-label="Edit project name">
              {isEditingName ? <Check className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
            </Button>
          </div>

          {/* Right section: All controls, pushed by ml-auto */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">---DEBUG---</span> {/* DEBUG MARKER */}

            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setIsExplorerVisible(!isExplorerVisible)} 
              aria-label={isExplorerVisible ? "Hide File Explorer" : "Show File Explorer"}
              title={isExplorerVisible ? "Hide File Explorer" : "Show File Explorer"}
            >
              <FolderOpen className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-1 px-2 rounded-md border bg-muted">
              <Button variant={viewMode === 'editor' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('editor')} aria-label="Editor View">
                <Edit3 className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Editor</span>
              </Button>
              <Button variant={viewMode === 'both' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('both')} aria-label="Split View">
                 <Rows className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Both</span>
              </Button>
              <Button variant={viewMode === 'whiteboard' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('whiteboard')} aria-label="Whiteboard View">
                <LayoutDashboard className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Board</span>
              </Button>
            </div>
          
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
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden h-full">
        <ResizablePanelGroup direction="horizontal" className="h-full w-full">
          {isExplorerVisible && (
            <>
              <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
                <div className="h-full p-1 sm:p-2 md:p-3">
                  <FileExplorer 
                    nodes={fileSystemRoots}
                    onAddFile={handleAddFileToProject}
                    onAddFolder={handleAddFolderToProject}
                    onSelectNode={handleSelectNode}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel defaultSize={isExplorerVisible ? 80 : 100}>
            <ResizablePanelGroup direction="horizontal" className="h-full w-full">
              {(viewMode === "editor" || viewMode === "both") && (
                <ResizablePanel defaultSize={viewMode === 'editor' ? 100 : 50} minSize={viewMode === 'both' ? 20 : 100}>
                  <div className="h-full p-1 sm:p-2 md:p-3">
                    <RichTextEditor 
                      value={textContent} 
                      onChange={handleTextChange}
                    />
                  </div>
                </ResizablePanel>
              )}
              {viewMode === "both" && (
                 <ResizableHandle withHandle />
              )}
              {(viewMode === "whiteboard" || viewMode === "both") && (
                <ResizablePanel defaultSize={viewMode === 'whiteboard' ? 100 : 50} minSize={viewMode === 'both' ? 20 : 100}>
                   <div className="h-full p-1 sm:p-2 md:p-3">
                    <Whiteboard
                      initialData={whiteboardData}
                      onChange={handleWhiteboardChange}
                    />
                  </div>
                </ResizablePanel>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
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

