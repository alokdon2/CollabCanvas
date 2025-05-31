
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

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA: WhiteboardData = {
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false },
  files: {}
};

// Helper to recursively delete a node
const deleteNodeFromTree = (
  nodes: FileSystemNode[],
  nodeId: string
): FileSystemNode[] => {
  return nodes.filter(node => {
    if (node.id === nodeId) {
      return false; 
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
  
  const [activeTextContent, setActiveTextContent] = useState(DEFAULT_EMPTY_TEXT_CONTENT);
  const [activeWhiteboardData, setActiveWhiteboardData] = useState<WhiteboardData>(DEFAULT_EMPTY_WHITEBOARD_DATA);
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

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSaveDataRef = useRef<{ project: Project } | null>(null);


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
          // Initialize active content to project root by default
          setActiveTextContent(projectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
          setActiveWhiteboardData(projectData.whiteboardContent || DEFAULT_EMPTY_WHITEBOARD_DATA);
          setActiveFileSystemRoots(projectData.fileSystemRoots || []);
          setSelectedFileNodeId(null); // Ensure no file is selected initially
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
    
    registerTriggerNewFile(() => handleOpenNewItemDialog('file', null));
    registerTriggerNewFolder(() => handleOpenNewItemDialog('folder', null));

    return () => {
      setCurrentProjectName(null);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [projectId, setCurrentProjectName, registerTriggerNewFile, registerTriggerNewFolder, router, toast]);


  // Auto-save effect
  useEffect(() => {
    if (!currentProject || !mounted || isLoadingProject) return;

    const projectDataToSave: Project = {
      ...(currentProject as Project), // Base project data
      name: editingProjectName || (currentProject as Project).name,
      fileSystemRoots: [...activeFileSystemRoots], // Current state of the file system
      updatedAt: new Date().toISOString(),
    };
    
    // If a specific file is selected, its content is already in activeTextContent/activeWhiteboardData
    // We need to ensure this active content is correctly placed into the projectDataToSave.fileSystemRoots
    if (selectedFileNodeId) {
      const updateNodeContentRecursive = (nodes: FileSystemNode[]): FileSystemNode[] => {
        return nodes.map(node => {
          if (node.id === selectedFileNodeId && node.type === 'file') {
            return { 
              ...node, 
              textContent: activeTextContent, 
              whiteboardContent: activeWhiteboardData 
            };
          }
          if (node.children) {
            return { ...node, children: updateNodeContentRecursive(node.children) };
          }
          return node;
        });
      };
      projectDataToSave.fileSystemRoots = updateNodeContentRecursive(projectDataToSave.fileSystemRoots);
    } else {
      // If no file is selected, save to the project's root content
      projectDataToSave.textContent = activeTextContent;
      projectDataToSave.whiteboardContent = activeWhiteboardData;
    }
    
    pendingSaveDataRef.current = { project: projectDataToSave };

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (pendingSaveDataRef.current) {
        try {
          await dbSaveProject(pendingSaveDataRef.current.project);
          // Update currentProject state to reflect the saved data. This is important for consistency.
          setCurrentProject(pendingSaveDataRef.current.project); 
          if (editingProjectName && pendingSaveDataRef.current.project.name !== editingProjectName) {
             // This check was slightly off, compare against the saved name
             // setCurrentProjectName is for the global navbar, editingProjectName is local project page state
             // This part might need refinement if editingProjectName is supposed to be the single source of truth for name
          }
          // toast({ title: "Project Saved", description: "Changes saved automatically."}); // Keep commented for now
        } catch (error) {
          console.error("Failed to save project:", error);
          toast({ title: "Save Error", description: "Could not save project changes.", variant: "destructive"});
        } finally {
          pendingSaveDataRef.current = null;
        }
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    activeTextContent, activeWhiteboardData, activeFileSystemRoots,
    editingProjectName, currentProject, selectedFileNodeId,
    mounted, isLoadingProject, setCurrentProjectName // Removed toast from dependencies
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
                setCurrentProject(updatedProject); // Update local state
                setCurrentProjectName(newName);    // Update global context/navbar
                toast({title: "Project Renamed", description: `Project name updated to "${newName}".`});
            } catch (error) {
                toast({title: "Error", description: "Failed to update project name.", variant: "destructive"});
                setEditingProjectName(currentProject.name); // Revert editing name
            }
        } else {
            setEditingProjectName(currentProject.name); // Revert if no change or empty
        }
    }
    setIsEditingName(!isEditingName);
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
    if (parentId === null) {
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
        ? { textContent: DEFAULT_EMPTY_TEXT_CONTENT, whiteboardContent: DEFAULT_EMPTY_WHITEBOARD_DATA } 
        : { children: [] }),
    };
    
    const updatedRoots = addNodeToTreeRecursive(activeFileSystemRoots, parentIdForNewItem, newNode);
    setActiveFileSystemRoots(updatedRoots); // This will trigger the save useEffect

    toast({ title: `${newItemType === 'file' ? 'File' : 'Folder'} Created`, description: `"${newNode.name}" added.`});
    setIsNewItemDialogOpen(false);
    setNewItemType(null);
  };
  
  const findNodeByIdRecursive = (nodes: FileSystemNode[], nodeId: string): FileSystemNode | null => {
    for (const node of nodes) {
        if (node.id === nodeId) return node;
        if (node.children) {
            const found = findNodeByIdRecursive(node.children, nodeId);
            if (found) return found;
        }
    }
    return null;
  };

  const handleNodeSelectedInExplorer = useCallback((nodeId: string | null) => {
    if (!currentProject) return;

    setSelectedFileNodeId(nodeId); // This will trigger the save useEffect

    let newTextContent = currentProject.textContent || DEFAULT_EMPTY_TEXT_CONTENT;
    let newWhiteboardData = currentProject.whiteboardContent || DEFAULT_EMPTY_WHITEBOARD_DATA;

    if (nodeId) {
        const selectedNode = findNodeByIdRecursive(activeFileSystemRoots, nodeId);
        if (selectedNode && selectedNode.type === 'file') {
            newTextContent = selectedNode.textContent || DEFAULT_EMPTY_TEXT_CONTENT;
            newWhiteboardData = selectedNode.whiteboardContent || DEFAULT_EMPTY_WHITEBOARD_DATA;
        }
        // If a folder is selected, we can choose to show its "own" content (if folders had it) or project root.
        // For now, selecting a folder defaults to project root content.
    }
    
    setActiveTextContent(newTextContent); // This will trigger the save useEffect
    setActiveWhiteboardData(newWhiteboardData); // This will trigger the save useEffect

    const selectedNodeForToast = nodeId ? findNodeByIdRecursive(activeFileSystemRoots, nodeId) : null;
    toast({
        title: `Switched to: ${selectedNodeForToast ? selectedNodeForToast.name : currentProject.name}`,
        description: selectedNodeForToast ? `Type: ${selectedNodeForToast.type}` : 'Project Root'
    });
  }, [currentProject, activeFileSystemRoots, toast, setSelectedFileNodeId, setActiveTextContent, setActiveWhiteboardData]);


  const handleDeleteNodeRequest = (nodeId: string) => {
    setNodeToDeleteId(nodeId); 
  };

  const confirmDeleteNode = () => {
    if (!nodeToDeleteId || !currentProject) return;

    const newRoots = deleteNodeFromTree([...activeFileSystemRoots], nodeToDeleteId);
    setActiveFileSystemRoots(newRoots); // This will trigger the save useEffect

    if (selectedFileNodeId === nodeToDeleteId) {
        setSelectedFileNodeId(null); 
        // Reload project root content after deleting the active file
        setActiveTextContent(currentProject.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
        setActiveWhiteboardData(currentProject.whiteboardContent || DEFAULT_EMPTY_WHITEBOARD_DATA);
    }
    toast({ title: "Item Deleted", description: "File/folder has been removed." });
    setNodeToDeleteId(null); 
  };


  if (!mounted || isLoadingProject || !currentProject) {
    return (
      <div className="flex min-h-screen flex-col fixed inset-0 pt-14">
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
                    selectedNodeId={selectedFileNodeId}
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
                        initialData={activeWhiteboardData}
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

    