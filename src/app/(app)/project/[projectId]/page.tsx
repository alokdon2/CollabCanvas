
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

const updateNodeInTreeRecursive = (
  nodes: FileSystemNode[],
  nodeId: string,
  newContent: { textContent?: string; whiteboardContent?: WhiteboardData | null }
): FileSystemNode[] => {
  return nodes.map(node => {
    if (node.id === nodeId && node.type === 'file') {
      // Create a new node object with updated content
      const updatedNode = { ...node };
      if (newContent.textContent !== undefined) {
        updatedNode.textContent = newContent.textContent;
      }
      if (newContent.whiteboardContent !== undefined) {
        updatedNode.whiteboardContent = newContent.whiteboardContent;
      }
      return updatedNode;
    }
    if (node.children) {
      return { ...node, children: updateNodeInTreeRecursive(node.children, nodeId, newContent) };
    }
    return node;
  });
};


export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();
  const { currentProjectName: currentProjectNameFromContext, setCurrentProjectName, registerTriggerNewFile, registerTriggerNewFolder } = useProjectContext();

  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  
  const [projectRootTextContent, setProjectRootTextContent] = useState(DEFAULT_EMPTY_TEXT_CONTENT);
  const [projectRootWhiteboardData, setProjectRootWhiteboardData] = useState<WhiteboardData>({...DEFAULT_EMPTY_WHITEBOARD_DATA});

  const [activeTextContent, setActiveTextContent] = useState(DEFAULT_EMPTY_TEXT_CONTENT);
  const [activeWhiteboardData, setActiveWhiteboardData] = useState<WhiteboardData>({...DEFAULT_EMPTY_WHITEBOARD_DATA});
  const activeWhiteboardDataRef = useRef<WhiteboardData>({...DEFAULT_EMPTY_WHITEBOARD_DATA}); 
  
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
          
          const rootText = projectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT;
          const rootBoard = projectData.whiteboardContent || {...DEFAULT_EMPTY_WHITEBOARD_DATA};
          setProjectRootTextContent(rootText);
          setProjectRootWhiteboardData(rootBoard);
          
          setActiveTextContent(rootText); 
          setActiveWhiteboardData(rootBoard);
          activeWhiteboardDataRef.current = rootBoard;
          setActiveFileSystemRoots(projectData.fileSystemRoots || []);
          setSelectedFileNodeId(null); 
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
    
    if (typeof registerTriggerNewFile === 'function') {
        registerTriggerNewFile(() => handleOpenNewItemDialog('file', null));
    }
    if (typeof registerTriggerNewFolder === 'function') {
        registerTriggerNewFolder(() => handleOpenNewItemDialog('folder', null));
    }

    return () => {
      setCurrentProjectName(null);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, router, toast, setCurrentProjectName, registerTriggerNewFile, registerTriggerNewFolder]); 

  useEffect(() => {
    activeWhiteboardDataRef.current = activeWhiteboardData;
  }, [activeWhiteboardData]);

  const performSave = useCallback(async (projectToSave: Project | null) => {
    if (!projectToSave) return;
    try {
      await dbSaveProject(projectToSave);
      if (projectToSave.name !== currentProjectNameFromContext) {
        setCurrentProjectName(projectToSave.name);
      }
      // console.log("Project saved:", projectToSave.name, projectToSave.updatedAt);
      // toast({ title: "Progress Saved", description: "Your changes have been saved.", duration: 2000});
    } catch (error) {
      console.error("Failed to save project:", error);
      // toast({ title: "Save Error", description: `Could not save: ${(error as Error).message}`, variant: "destructive"});
    }
  }, [currentProjectNameFromContext, setCurrentProjectName]);


  useEffect(() => {
    if (!mounted || isLoadingProject || !currentProject) return;

    const constructProjectDataToSave = (): Project => {
      return {
        id: currentProject.id,
        createdAt: currentProject.createdAt,
        name: editingProjectName || currentProject.name,
        fileSystemRoots: [...activeFileSystemRoots],
        textContent: projectRootTextContent,
        whiteboardContent: projectRootWhiteboardData,
        updatedAt: new Date().toISOString(),
      };
    };
    
    const currentDataToSave = constructProjectDataToSave();
    pendingSaveDataRef.current = { project: currentDataToSave };

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (pendingSaveDataRef.current?.project) {
        await performSave(pendingSaveDataRef.current.project);
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    projectRootTextContent, projectRootWhiteboardData, activeFileSystemRoots, 
    editingProjectName, 
    mounted, isLoadingProject, currentProject,
    performSave
  ]);


  const handleTextChange = useCallback((newText: string) => {
    setActiveTextContent(newText); 
    if (selectedFileNodeId) {
      setActiveFileSystemRoots(prevRoots => 
        updateNodeInTreeRecursive(prevRoots, selectedFileNodeId, { textContent: newText })
      );
    } else {
      setProjectRootTextContent(newText); 
    }
  }, [selectedFileNodeId, setActiveFileSystemRoots, setProjectRootTextContent]); 
  
  const handleWhiteboardChange = useCallback((newData: WhiteboardData) => {
    if (JSON.stringify(newData.elements) !== JSON.stringify(activeWhiteboardDataRef.current?.elements || []) ||
        newData.appState?.viewBackgroundColor !== activeWhiteboardDataRef.current?.appState?.viewBackgroundColor) {
          
        setActiveWhiteboardData(newData); 
        if (selectedFileNodeId) {
            setActiveFileSystemRoots(prevRoots => 
              updateNodeInTreeRecursive(prevRoots, selectedFileNodeId, { whiteboardContent: newData })
            );
        } else {
            setProjectRootWhiteboardData(newData); 
        }
    }
  }, [selectedFileNodeId, setActiveFileSystemRoots, setProjectRootWhiteboardData]); 
  
  const handleNameEditToggle = useCallback(async () => {
    if (isEditingName && currentProject) {
      const newName = editingProjectName.trim();
      if (newName && newName !== currentProject.name) {
        const updatedProjectData = { 
            ...currentProject, 
            name: newName, 
            updatedAt: new Date().toISOString(),
            textContent: projectRootTextContent,
            whiteboardContent: projectRootWhiteboardData,
            fileSystemRoots: activeFileSystemRoots,
        };
        try {
          await dbSaveProject(updatedProjectData); 
          setCurrentProject(updatedProjectData); 
          setCurrentProjectName(newName);    
          toast({title: "Project Renamed", description: `Project name updated to "${newName}".`});
        } catch (error) {
          toast({title: "Error", description: "Failed to update project name.", variant: "destructive"});
          setEditingProjectName(currentProject.name); 
        }
      } else if (currentProject) {
        setEditingProjectName(currentProject.name); 
      }
    }
    setIsEditingName(!isEditingName);
  }, [isEditingName, currentProject, editingProjectName, setCurrentProjectName, toast, projectRootTextContent, projectRootWhiteboardData, activeFileSystemRoots]);


  const confirmDeleteProject = useCallback(async () => {
    if (!currentProject) return;
    try {
      await dbDeleteProject(currentProject.id);
      toast({ title: "Project Deleted", description: `"${currentProject.name}" has been deleted.` });
      router.replace("/");
    } catch (error) {
      toast({ title: "Error", description: "Could not delete project.", variant: "destructive" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, router, toast]);

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

  const handleOpenNewItemDialog = useCallback((type: 'file' | 'folder', parentNodeId: string | null) => {
    setNewItemType(type);
    setParentIdForNewItem(parentNodeId);
    setNewItemName("");
    setNewItemError("");
    setIsNewItemDialogOpen(true);
  }, []);


  const handleCreateNewItem = useCallback(() => {
    if (!newItemName.trim() || !newItemType ) {
      setNewItemError(`Name cannot be empty.`);
      return;
    }
    setNewItemError("");

    const newNode: FileSystemNode = {
      id: crypto.randomUUID(),
      name: newItemName.trim(),
      type: newItemType,
      ...(newItemType === 'file' 
        ? { textContent: DEFAULT_EMPTY_TEXT_CONTENT, whiteboardContent: {...DEFAULT_EMPTY_WHITEBOARD_DATA} } 
        : { children: [] }),
    };
    
    setActiveFileSystemRoots(prevRoots => addNodeToTreeRecursive(prevRoots, parentIdForNewItem, newNode));

    toast({ title: `${newItemType === 'file' ? 'File' : 'Folder'} Created`, description: `"${newNode.name}" added.`});
    setIsNewItemDialogOpen(false);
    setNewItemType(null);
  }, [newItemName, newItemType, parentIdForNewItem, toast]);
  
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

  const handleNodeSelectedInExplorer = useCallback(async (selectedNode: FileSystemNode | null) => {
    if (saveTimeoutRef.current && pendingSaveDataRef.current?.project) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      
      let projectDataToForceSave: Project | null = null;
      if(currentProject){
          projectDataToForceSave = {
            id: currentProject.id,
            createdAt: currentProject.createdAt,
            name: editingProjectName || currentProject.name,
            fileSystemRoots: [...activeFileSystemRoots], 
            textContent: projectRootTextContent,
            whiteboardContent: projectRootWhiteboardData,
            updatedAt: new Date().toISOString(),
          };
      }
      await performSave(projectDataToForceSave);
      pendingSaveDataRef.current = null; 
    }

    const nodeId = selectedNode ? selectedNode.id : null;
    setSelectedFileNodeId(nodeId);

    if (selectedNode && selectedNode.type === 'file') {
        setActiveTextContent(selectedNode.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
        const newBoardData = selectedNode.whiteboardContent ? {...selectedNode.whiteboardContent} : {...DEFAULT_EMPTY_WHITEBOARD_DATA};
        setActiveWhiteboardData(newBoardData);
        activeWhiteboardDataRef.current = newBoardData;
    } else { 
        setActiveTextContent(projectRootTextContent);
        setActiveWhiteboardData({...projectRootWhiteboardData});
        activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
    }
  }, [
    performSave, 
    projectRootTextContent, projectRootWhiteboardData, activeFileSystemRoots,
    currentProject, editingProjectName, 
    setActiveTextContent, setActiveWhiteboardData, setSelectedFileNodeId
  ]);


  const handleDeleteNodeRequest = useCallback((nodeId: string) => {
    setNodeToDeleteId(nodeId); 
  }, []);

  const confirmDeleteNode = useCallback(async () => {
    if (!nodeToDeleteId || !currentProject) return;

    if (saveTimeoutRef.current && pendingSaveDataRef.current?.project) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
       const projectDataToForceSave = {
            id: currentProject.id,
            createdAt: currentProject.createdAt,
            name: editingProjectName || currentProject.name,
            fileSystemRoots: [...activeFileSystemRoots],
            textContent: projectRootTextContent,
            whiteboardContent: projectRootWhiteboardData,
            updatedAt: new Date().toISOString(),
        };
      await performSave(projectDataToForceSave);
      pendingSaveDataRef.current = null;
    }

    const nodeBeingDeleted = findNodeByIdRecursive(activeFileSystemRoots, nodeToDeleteId);
    const newRoots = deleteNodeFromTree(activeFileSystemRoots, nodeToDeleteId);
    setActiveFileSystemRoots(newRoots); 

    if (selectedFileNodeId === nodeToDeleteId) {
        setSelectedFileNodeId(null); 
        setActiveTextContent(projectRootTextContent);
        setActiveWhiteboardData({...projectRootWhiteboardData});
        activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
    }
    toast({ title: "Item Deleted", description: `"${nodeBeingDeleted?.name || 'Item'}" has been removed.` });
    setNodeToDeleteId(null); 
  }, [
    nodeToDeleteId, selectedFileNodeId, projectRootTextContent, projectRootWhiteboardData, 
    toast, activeFileSystemRoots, performSave, currentProject, editingProjectName,
    setActiveFileSystemRoots, setSelectedFileNodeId, setActiveTextContent, setActiveWhiteboardData
  ]);


  const onAddFileToFolderCallback = useCallback((folderId: string | null) => {
    handleOpenNewItemDialog('file', folderId);
  }, [handleOpenNewItemDialog]);

  const onAddFolderToFolderCallback = useCallback((folderId: string | null) => {
    handleOpenNewItemDialog('folder', folderId);
  }, [handleOpenNewItemDialog]);


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
                    onAddFileToFolder={onAddFileToFolderCallback}
                    onAddFolderToFolder={onAddFolderToFolderCallback}
                    selectedNodeId={selectedFileNodeId}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel defaultSize={isExplorerVisible ? 80 : 100} className="flex flex-col">
            {viewMode === "editor" && (
              <div className="h-full p-1 sm:p-2 md:p-3">
                <RichTextEditor 
                  value={activeTextContent} 
                  onChange={handleTextChange}
                />
              </div>
            )}
            {viewMode === "whiteboard" && (
              <div className="h-full p-1 sm:p-2 md:p-3">
                <Whiteboard
                  initialData={activeWhiteboardData}
                  onChange={handleWhiteboardChange}
                  isReadOnly={false} 
                />
              </div>
            )}
            {viewMode === "both" && (
              <ResizablePanelGroup direction="horizontal" className="h-full w-full">
                <ResizablePanel defaultSize={50} minSize={20}>
                  <div className="h-full p-1 sm:p-2 md:p-3">
                    <RichTextEditor 
                      value={activeTextContent} 
                      onChange={handleTextChange}
                    />
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={20}>
                  <div className="h-full p-1 sm:p-2 md:p-3">
                    <Whiteboard
                      initialData={activeWhiteboardData}
                      onChange={handleWhiteboardChange}
                      isReadOnly={false}
                    />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault(); 
                  handleCreateNewItem();
                }
              }}
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
              {currentProject && activeFileSystemRoots && findNodeByIdRecursive(activeFileSystemRoots, nodeToDeleteId || '')?.type === 'folder' && ' and all its contents'}.
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
    
 

    

    