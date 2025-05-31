
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Whiteboard } from "@/components/Whiteboard";
import type { Project, WhiteboardData, FileSystemNode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Trash2, Edit, Check, LayoutDashboard, Edit3, Rows, FolderTree, Loader2, PanelLeftOpen } from "lucide-react";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useProjectContext } from "@/contexts/ProjectContext";
import { FileExplorer } from "@/components/FileExplorer";
import { dbGetProjectById, dbSaveProject, dbDeleteProject } from "@/lib/indexedDB";

type ViewMode = "editor" | "whiteboard" | "both";

// Helper to recursively find and update a node
const updateNodeInTree = (
  nodes: FileSystemNode[],
  nodeId: string,
  updates: Partial<FileSystemNode>
): FileSystemNode[] => {
  return nodes.map(node => {
    if (node.id === nodeId) {
      return { ...node, ...updates };
    }
    if (node.children && node.children.length > 0) {
      const updatedChildren = updateNodeInTree(node.children, nodeId, updates);
      if (updatedChildren !== node.children) {
        return { ...node, children: updatedChildren };
      }
    }
    return node;
  });
};

// Helper to recursively delete a node
const deleteNodeFromTree = (
  nodes: FileSystemNode[],
  nodeId: string
): FileSystemNode[] => {
  return nodes.filter(node => {
    if (node.id === nodeId) {
      return false; // Exclude this node
    }
    if (node.children && node.children.length > 0) {
      node.children = deleteNodeFromTree(node.children, nodeId);
    }
    return true;
  });
};


export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();
  const { setCurrentProjectName, registerTriggerNewFile, registerTriggerNewFolder } = useProjectContext();

  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  
  // These states now represent the *active* content being edited
  const [activeTextContent, setActiveTextContent] = useState("<p></p>");
  const [activeWhiteboardData, setActiveWhiteboardData] = useState<WhiteboardData | null>(null);
  const [activeFileSystemRoots, setActiveFileSystemRoots] = useState<FileSystemNode[]>([]); 
  
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [isExplorerVisible, setIsExplorerVisible] = useState(true);
  const [selectedFileNodeId, setSelectedFileNodeId] = useState<string | null>(null);


  const [isNewItemDialogOpen, setIsNewItemDialogOpen] = useState(false);
  const [newItemType, setNewItemType] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemError, setNewItemError] = useState("");
  const [parentIdForNewItem, setParentIdForNewItem] = useState<string | null>(null);

  const [nodeToDeleteId, setNodeToDeleteId] = useState<string | null>(null);


  // Debounced save ref
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch project data
  useEffect(() => {
    setMounted(true);
    async function fetchProject() {
      if (!projectId) return;
      setIsLoadingProject(true);
      try {
        const projectData = await dbGetProjectById(projectId);
        if (projectData) {
          setCurrentProject(projectData);
          setEditingProjectName(projectData.name);
          setCurrentProjectName(projectData.name);
          // Initially, load root project content
          setActiveTextContent(projectData.textContent?.trim() ? projectData.textContent : "<p></p>");
          setActiveWhiteboardData(projectData.whiteboardContent || { elements: [], appState: {} });
          setActiveFileSystemRoots(projectData.fileSystemRoots || []);
          setSelectedFileNodeId(null); // Default to root
        } else {
          toast({ title: "Error", description: "Project not found.", variant: "destructive" });
          router.replace("/");
        }
      } catch (error) {
        console.error("Failed to fetch project:", error);
        toast({ title: "Error", description: "Could not load project data.", variant: "destructive" });
        router.replace("/");
      } finally {
        setIsLoadingProject(false);
      }
    }
    fetchProject();
    
    registerTriggerNewFile(() => handleOpenNewItemDialog('file', null)); // Default to root
    registerTriggerNewFolder(() => handleOpenNewItemDialog('folder', null)); // Default to root

    return () => {
      setCurrentProjectName(null);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [projectId, setCurrentProjectName, registerTriggerNewFile, registerTriggerNewFolder, router, toast]);

  // Auto-save logic
  useEffect(() => {
    if (!currentProject || !mounted || isLoadingProject) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!currentProject) return;

      let projectToSave: Project = {
        ...currentProject,
        name: editingProjectName || currentProject.name,
        fileSystemRoots: activeFileSystemRoots, // Always save the current state of the file system
        updatedAt: new Date().toISOString(),
      };

      if (selectedFileNodeId) {
        // Find the selected file node and update its content within projectToSave.fileSystemRoots
        const updateFileNodeContent = (nodes: FileSystemNode[]): FileSystemNode[] => {
          return nodes.map(node => {
            if (node.id === selectedFileNodeId && node.type === 'file') {
              return { ...node, textContent: activeTextContent, whiteboardContent: activeWhiteboardData };
            }
            if (node.children) {
              return { ...node, children: updateFileNodeContent(node.children) };
            }
            return node;
          });
        };
        projectToSave.fileSystemRoots = updateFileNodeContent(projectToSave.fileSystemRoots);
      } else {
        // Save to root project content
        projectToSave.textContent = activeTextContent;
        projectToSave.whiteboardContent = activeWhiteboardData;
      }
      
      try {
        await dbSaveProject(projectToSave);
        setCurrentProject(projectToSave); // Update local state with saved data
        // toast({ title: "Project Saved", description: "Changes saved automatically."});
      } catch (error) {
        console.error("Failed to save project:", error);
        toast({ title: "Save Error", description: "Could not save project changes.", variant: "destructive"});
      }
      if (editingProjectName && currentProject && editingProjectName !== currentProject.name) {
         setCurrentProjectName(editingProjectName); // Update context if name changed
      }
    }, 1500); // Increased debounce time

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    activeTextContent, activeWhiteboardData, activeFileSystemRoots, 
    editingProjectName, currentProject, selectedFileNodeId, 
    mounted, isLoadingProject, setCurrentProjectName, toast
  ]);


  const handleTextChange = useCallback((newText: string) => {
    setActiveTextContent(newText);
  }, []);
  
  const handleWhiteboardChange = useCallback((newData: WhiteboardData) => {
    setActiveWhiteboardData(newData);
  }, []);
  
  const handleNameEditToggle = async () => {
    if (isEditingName && currentProject) { 
        const newName = editingProjectName.trim();
        if (newName && newName !== currentProject.name) {
            const updatedProject = { ...currentProject, name: newName, updatedAt: new Date().toISOString() };
            try {
                await dbSaveProject(updatedProject);
                setCurrentProject(updatedProject);
                setCurrentProjectName(newName);
            } catch (error) {
                toast({title: "Error", description: "Failed to update project name.", variant: "destructive"});
                setEditingProjectName(currentProject.name); // Revert
            }
        } else {
            setEditingProjectName(currentProject.name); 
        }
    }
    setIsEditingName(!isEditingName);
  };

  const handleDeleteProjectRequest = () => {
    // This will trigger the AlertDialog for project deletion
  };

  const confirmDeleteProject = async () => {
    if (!currentProject) return;
    try {
      await dbDeleteProject(currentProject.id);
      toast({ title: "Project Deleted", description: `"${currentProject.name}" has been deleted.` });
      router.replace("/");
    } catch (error) {
      toast({ title: "Error", description: "Could not delete project.", variant: "destructive" });
    }
  };

  const addNodeToTreeRecursive = (nodes: FileSystemNode[], parentId: string | null, newNode: FileSystemNode): FileSystemNode[] => {
    if (parentId === null) { // Add to root
      return [...nodes, newNode];
    }
    return nodes.map(node => {
      if (node.id === parentId && node.type === 'folder') {
        return { ...node, children: [...(node.children || []), newNode] };
      }
      if (node.children) {
        return { ...node, children: addNodeToTreeRecursive(node.children, parentId, newNode) };
      }
      return node;
    });
  };

  const handleOpenNewItemDialog = (type: 'file' | 'folder', parentNodeId: string | null) => {
    setNewItemType(type);
    setParentIdForNewItem(parentNodeId);
    setNewItemName("");
    setNewItemError("");
    setIsNewItemDialogOpen(true);
  };

  const handleCreateNewItem = () => {
    if (!newItemName.trim() || !newItemType || !currentProject) {
      setNewItemError(`Name cannot be empty.`);
      return;
    }
    setNewItemError("");

    const newNode: FileSystemNode = {
      id: crypto.randomUUID(),
      name: newItemName.trim(),
      type: newItemType,
      ...(newItemType === 'file' 
        ? { textContent: '<p></p>', whiteboardContent: null } 
        : { children: [] }),
    };
    
    const updatedRoots = addNodeToTreeRecursive(activeFileSystemRoots, parentIdForNewItem, newNode);
    setActiveFileSystemRoots(updatedRoots); // Update state that triggers save effect

    toast({ title: `${newItemType === 'file' ? 'File' : 'Folder'} Created`, description: `"${newNode.name}" added.`});
    setIsNewItemDialogOpen(false);
    setNewItemType(null);
  };
  
  const handleNodeSelectedInExplorer = useCallback((node: FileSystemNode | null) => {
    if (!currentProject) return;

    if (node && node.type === 'file') {
      setSelectedFileNodeId(node.id);
      setActiveTextContent(node.textContent?.trim() ? node.textContent : "<p></p>");
      setActiveWhiteboardData(node.whiteboardContent || { elements: [], appState: {} });
    } else { // Folder selected or selection cleared
      setSelectedFileNodeId(null);
      setActiveTextContent(currentProject.textContent?.trim() ? currentProject.textContent : "<p></p>");
      setActiveWhiteboardData(currentProject.whiteboardContent || { elements: [], appState: {} });
    }
     toast({
        title: `Switched to: ${node ? node.name : currentProject.name}`,
        description: node ? `Type: ${node.type}` : 'Project Root'
      });
  }, [currentProject, toast]);

  const handleDeleteNodeRequest = (nodeId: string) => {
    setNodeToDeleteId(nodeId); // This will open the delete confirmation dialog
  };

  const confirmDeleteNode = () => {
    if (!nodeToDeleteId || !currentProject) return;

    const newRoots = deleteNodeFromTree([...activeFileSystemRoots], nodeToDeleteId);
    setActiveFileSystemRoots(newRoots); // This will trigger the save effect

    if (selectedFileNodeId === nodeToDeleteId) {
        setSelectedFileNodeId(null); // Reset to root if selected node was deleted
        setActiveTextContent(currentProject.textContent || "<p></p>");
        setActiveWhiteboardData(currentProject.whiteboardContent || null);
    }
    toast({ title: "Item Deleted", description: "File/folder has been removed." });
    setNodeToDeleteId(null); // Close dialog
  };


  if (!mounted || isLoadingProject || !currentProject) {
    return (
      <div className="flex min-h-screen flex-col fixed inset-0 pt-16">
         <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center px-4 sm:px-6 lg:px-8">
                <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="mr-2">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-lg font-semibold">Loading Project...</h1>
                <Loader2 className="ml-2 h-5 w-5 animate-spin" />
            </div>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading project data...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen flex-col fixed inset-0 pt-14"> 
       <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4 sm:px-6 lg:px-8">
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

          <div className="ml-auto flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsExplorerVisible(!isExplorerVisible)}
              className="px-2"
              aria-label="Toggle file explorer"
            >
              {isExplorerVisible ? <PanelLeftOpen className="h-4 w-4 sm:mr-2" /> : <FolderTree className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">Explorer</span>
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
                <Button variant="destructive" size="icon" aria-label="Delete project" onClick={handleDeleteProjectRequest}>
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
                  <AlertDialogAction onClick={confirmDeleteProject}>
                    Delete Project
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
                    nodes={activeFileSystemRoots}
                    onNodeSelect={handleNodeSelectedInExplorer}
                    onDeleteNode={handleDeleteNodeRequest} 
                    onAddFileToFolder={(folderId) => handleOpenNewItemDialog('file', folderId)}
                    onAddFolderToFolder={(folderId) => handleOpenNewItemDialog('folder', folderId)}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel defaultSize={isExplorerVisible ? 80 : 100}>
            <ResizablePanelGroup direction="horizontal" className="h-full w-full">
              {(viewMode === "editor" || viewMode === "both") && (
                <ResizablePanel defaultSize={viewMode === 'editor' ? 100 : (viewMode === 'both' ? 50 : 0)} minSize={viewMode === 'both' ? 20 : (viewMode === 'editor' ? 100 : 0)}>
                  { (viewMode === 'editor' || viewMode === 'both') &&
                    <div className="h-full p-1 sm:p-2 md:p-3">
                      <RichTextEditor 
                        value={activeTextContent} 
                        onChange={handleTextChange}
                      />
                    </div>
                  }
                </ResizablePanel>
              )}
              {viewMode === "both" && (
                 <ResizableHandle withHandle />
              )}
              {(viewMode === "whiteboard" || viewMode === "both") && (
                <ResizablePanel defaultSize={viewMode === 'whiteboard' ? 100 : (viewMode === 'both' ? 50 : 0)} minSize={viewMode === 'both' ? 20 : (viewMode === 'whiteboard' ? 100 : 0)}>
                  { (viewMode === 'whiteboard' || viewMode === 'both') &&
                     <div className="h-full p-1 sm:p-2 md:p-3">
                      <Whiteboard
                        initialData={activeWhiteboardData} // Key this to activeWhiteboardData
                        onChange={handleWhiteboardChange}
                      />
                    </div>
                  }
                </ResizablePanel>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
      
      <ShareProjectDialog
        project={currentProject}
        isOpen={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
      />

      <Dialog open={isNewItemDialogOpen} onOpenChange={setIsNewItemDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New {newItemType === 'file' ? 'File' : 'Folder'}</DialogTitle>
            <DialogDescription>
              Enter a name for your new {newItemType}.
              {parentIdForNewItem && " It will be created in the selected folder."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="itemName">Name</Label>
            <Input
              id="itemName"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              aria-describedby="item-name-error"
            />
             {newItemError && <p id="item-name-error" className="text-sm text-red-500">{newItemError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewItemDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateNewItem}>Create {newItemType === 'file' ? 'File' : 'Folder'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!nodeToDeleteId} onOpenChange={(open) => !open && setNodeToDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected item
              {activeFileSystemRoots.find(n => n.id === nodeToDeleteId)?.type === 'folder' && ' and all its contents'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNodeToDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteNode}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
