
"use client";

import { useEffect, useState, useCallback, useRef, Suspense, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Whiteboard } from "@/components/Whiteboard";
import type { Project, WhiteboardData, FileSystemNode, ExcalidrawAppState } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Trash2, Edit, Check, LayoutDashboard, Edit3, Rows, FolderTree, Loader2, PanelLeftOpen, PlusCircle, FilePlus2, FolderPlus, Info, CheckCircle2, AlertCircle, Save, Search } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useProjectContext } from "@/contexts/ProjectContext";
import { FileExplorer } from "@/components/FileExplorer";
import {
  loadProjectData as realtimeLoadProjectData,
  saveProjectData as realtimeSaveProjectData,
  deleteProjectFromFirestore,
  ensureNodeContentDefaults,
  processSingleWhiteboardData,
} from "@/services/realtimeCollaborationService";
import { dbGetProjectById, dbSaveProject, dbDeleteProject } from "@/lib/indexedDB";
import { useAuth } from "@/contexts/AuthContext";

type ViewMode = "editor" | "whiteboard" | "both";
type SaveStatus = 'unsaved' | 'saving' | 'synced' | 'error';

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA: WhiteboardData = {
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false } as ExcalidrawAppState,
  files: {}
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

const replaceNodeInTree = (nodes: FileSystemNode[], nodeId: string, replacementNode: FileSystemNode): FileSystemNode[] => {
  return nodes.map(node => {
    if (node.id === nodeId) {
      return replacementNode;
    }
    if (node.children) {
      return { ...node, children: replaceNodeInTree(node.children, nodeId, replacementNode) };
    }
    return node;
  });
};

const deleteNodeFromTreeRecursive = (nodes: FileSystemNode[], nodeId: string): FileSystemNode[] => {
  return nodes.filter(node => {
    if (node.id === nodeId) {
      return false;
    }
    if (node.children && node.children.length > 0) {
      node.children = deleteNodeFromTreeRecursive(node.children, nodeId);
    }
    return true;
  });
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

const removeNodeFromTree = (nodes: FileSystemNode[], nodeId: string): { removedNode: FileSystemNode | null; newTree: FileSystemNode[] } => {
  let removedNode: FileSystemNode | null = null;
  const filterRecursive = (nodesArray: FileSystemNode[]): FileSystemNode[] => {
    return nodesArray.reduce((acc, node) => {
      if (node.id === nodeId) {
        removedNode = node;
        return acc;
      }
      const newNode = { ...node };
      if (newNode.children) {
        newNode.children = filterRecursive(newNode.children);
      }
      acc.push(newNode);
      return acc;
    }, [] as FileSystemNode[]);
  };
  const newTree = filterRecursive([...nodes]);
  return { removedNode, newTree };
};

const addNodeToTargetInTree = (nodes: FileSystemNode[], targetFolderId: string | null, nodeToAdd: FileSystemNode): FileSystemNode[] => {
  if (targetFolderId === null) {
    return [...nodes, nodeToAdd];
  }
  return nodes.map(node => {
    if (node.id === targetFolderId && node.type === 'folder') {
      return { ...node, children: [...(node.children || []), nodeToAdd] };
    }
    if (node.children) {
      return { ...node, children: addNodeToTargetInTree(node.children, targetFolderId, nodeToAdd) };
    }
    return node;
  });
};

const findParentId = (nodes: FileSystemNode[], childId: string, parentId: string | null = null): string | null => {
    for (const node of nodes) {
        if (node.id === childId) return parentId;
        if (node.children) {
            const foundInChild = findParentId(node.children, childId, node.id);
            if (foundInChild !== undefined) return foundInChild;
        }
    }
    return undefined; 
};

// Search filtering logic
const filterFileSystem = (nodes: FileSystemNode[], searchTerm: string): FileSystemNode[] => {
    if (!searchTerm) {
        return nodes;
    }
    const lowercasedSearchTerm = searchTerm.toLowerCase();

    const searchNode = (node: FileSystemNode): FileSystemNode | null => {
        const filteredChildren = node.children ? filterFileSystem(node.children, searchTerm) : undefined;
        const hasMatchingChildren = filteredChildren && filteredChildren.length > 0;

        const nameMatches = node.name.toLowerCase().includes(lowercasedSearchTerm);

        const contentMatches = node.type === 'file' && node.textContent ? node.textContent.replace(/<[^>]+>/g, '').toLowerCase().includes(lowercasedSearchTerm) : false;

        if (nameMatches || contentMatches || hasMatchingChildren) {
            return { ...node, children: filteredChildren };
        }

        return null;
    };

    return nodes.map(searchNode).filter(Boolean) as FileSystemNode[];
};


function ProjectPageContent() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();
  const { setCurrentProjectName: setGlobalProjectNameFromContext, registerTriggerNewFile, registerTriggerNewFolder } = useProjectContext();
  const { user: authUser, loading: authLoading } = useAuth();

  const searchParams = useSearchParams();
  const initialIsShared = searchParams.get('shared') === 'true';

  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isReadOnlyView, setIsReadOnlyView] = useState(false);

  const [activeTextContent, setActiveTextContent] = useState(DEFAULT_EMPTY_TEXT_CONTENT);
  const activeWhiteboardDataRef = useRef<WhiteboardData>({...DEFAULT_EMPTY_WHITEBOARD_DATA});

  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isEditingNameState, setIsEditingNameState] = useState(false);
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
  const [projectSearchTerm, setProjectSearchTerm] = useState("");

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('synced');
  
  // --- Initial Load ---
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function fetchAndInitializeProject() {
      if (!projectId || !mounted) return;
      setIsLoadingProject(true);
      try {
        let projectData;
        if (authUser) {
          projectData = await realtimeLoadProjectData(projectId);
        } else {
          projectData = await dbGetProjectById(projectId);
        }
        
        if (!mounted) return;

        if (projectData) {
          setCurrentProject(projectData);
          setSaveStatus('synced');
          setSelectedFileNodeId(null); 
          // Determine read-only status after project loads
          const isSharedView = searchParams.get('shared') === 'true';
          const effectiveReadOnly = isSharedView && (!authUser || authUser.uid !== projectData.ownerId);
          setIsReadOnlyView(effectiveReadOnly);
        } else {
          toast({ title: "Error", description: "Project not found.", variant: "destructive" });
          router.replace("/");
        }
      } catch (error) {
        if (!mounted) return;
        console.error(`[ProjectPage] Failed to fetch project ${projectId}:`, error);
        toast({ title: "Error Loading Project", description: `Could not load project data: ${(error as Error).message}`, variant: "destructive" });
        router.replace("/");
      } finally {
        if (mounted) setIsLoadingProject(false);
      }
    }
    fetchAndInitializeProject();

    return () => {
        setGlobalProjectNameFromContext(null);
    }
  }, [projectId, mounted, authUser, router, toast, setGlobalProjectNameFromContext, searchParams]);


  // --- Derive states from currentProject ---
  useEffect(() => {
    if (currentProject) {
      setGlobalProjectNameFromContext(currentProject.name);
      
      const node = selectedFileNodeId ? findNodeByIdRecursive(currentProject.fileSystemRoots, selectedFileNodeId) : null;
      if (node) {
        setActiveTextContent(node.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
        activeWhiteboardDataRef.current = node.whiteboardContent ? processSingleWhiteboardData(node.whiteboardContent, 'load') || {...DEFAULT_EMPTY_WHITEBOARD_DATA} : {...DEFAULT_EMPTY_WHITEBOARD_DATA};
      } else {
        setActiveTextContent(currentProject.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
        activeWhiteboardDataRef.current = currentProject.whiteboardContent 
          ? processSingleWhiteboardData(currentProject.whiteboardContent, 'load') || {...DEFAULT_EMPTY_WHITEBOARD_DATA}
          : {...DEFAULT_EMPTY_WHITEBOARD_DATA};
      }
    }
  }, [currentProject, setGlobalProjectNameFromContext, selectedFileNodeId]);


  const constructProjectDataToSave = useCallback((
    projectState: Project
  ): Project | null => {
      
    let finalProjectState: Project;

    if (selectedFileNodeId) {
        const selectedNode = findNodeByIdRecursive(projectState.fileSystemRoots, selectedFileNodeId);
        if (selectedNode) {
            const updatedNode = {
                ...selectedNode,
                textContent: activeTextContent,
                whiteboardContent: activeWhiteboardDataRef.current,
            };
            const updatedRoots = replaceNodeInTree(projectState.fileSystemRoots, selectedFileNodeId, updatedNode);
            finalProjectState = { ...projectState, fileSystemRoots: updatedRoots };
        } else {
            finalProjectState = { ...projectState };
        }
    } else {
        finalProjectState = {
            ...projectState,
            textContent: activeTextContent,
            whiteboardContent: activeWhiteboardDataRef.current,
        };
    }
    
    return {
        ...finalProjectState,
        updatedAt: new Date().toISOString(),
    };
  }, [activeTextContent, selectedFileNodeId]);


  const performSave = useCallback(async (
    projectToSave: Project,
    isStructuralChange: boolean = false
  ) => {
    if (isReadOnlyView || saveStatus === 'saving') {
      return;
    }

    setSaveStatus('saving');
    
    const finalProjectData = { ...projectToSave };
    if (authUser) finalProjectData.ownerId = authUser.uid;

    try {
      if (authUser) {
        await realtimeSaveProjectData(finalProjectData);
      } else {
        await dbSaveProject(finalProjectData);
      }
      
      setCurrentProject(finalProjectData); 
      setSaveStatus('synced');
      if (isStructuralChange) {
        toast({ title: "Project Updated", description: "Your project structure has been saved." });
      }

    } catch (error) {
      console.error("[ProjectPage performSave] Failed to save project:", error);
      toast({ title: "Save Error", description: `Could not save project: ${(error as Error).message}`, variant: "destructive" });
      setSaveStatus('error');
    }
  }, [isReadOnlyView, authUser, toast, saveStatus]);


  const handleManualSave = useCallback(async () => {
    if (!currentProject || saveStatus !== 'unsaved') return;

    const constructedProject = constructProjectDataToSave(currentProject);
    if (constructedProject) {
        await performSave(constructedProject, false);
        toast({ title: "Project Saved", description: "Your changes have been saved." });
    }
  }, [currentProject, constructProjectDataToSave, performSave, saveStatus, toast]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (saveStatus === 'unsaved') {
          handleManualSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave, saveStatus]);


  const handleTextChange = useCallback((newText: string) => {
    if (isReadOnlyView) return;
    setActiveTextContent(newText);
    if (saveStatus !== 'saving') setSaveStatus('unsaved');
  }, [isReadOnlyView, saveStatus]);

  const handleWhiteboardChange = useCallback((newData: WhiteboardData) => {
    if (isReadOnlyView) return;
    activeWhiteboardDataRef.current = newData;
    if (saveStatus !== 'saving') setSaveStatus('unsaved');
  }, [isReadOnlyView, saveStatus]);

  const handleProjectNameChange = useCallback(async (newName: string) => {
    if (isReadOnlyView || !currentProject || newName === currentProject.name) return;

    const updatedProject: Project = { ...currentProject, name: newName };
    setCurrentProject(updatedProject);

    const constructedProject = constructProjectDataToSave(updatedProject);
    if (constructedProject) {
      await performSave(constructedProject, true);
    }
  }, [isReadOnlyView, currentProject, constructProjectDataToSave, performSave]);


  const handleNameEditToggle = useCallback(async () => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Project name cannot be changed.", variant: "default" });
      return;
    }
    if (isEditingNameState) {
        const inputElement = document.getElementById('projectNameInput') as HTMLInputElement;
        const newName = inputElement?.value.trim();
        if (newName && currentProject && newName !== currentProject.name) {
            await handleProjectNameChange(newName);
        }
    }
    setIsEditingNameState(!isEditingNameState);
  }, [isReadOnlyView, isEditingNameState, currentProject, handleProjectNameChange, toast]);

  const confirmDeleteProject = useCallback(async () => {
    if (isReadOnlyView || !currentProject) return;
    if (authUser && currentProject.ownerId !== authUser.uid) {
        toast({ title: "Permission Denied", description: "You are not the owner.", variant: "destructive" });
        return;
    }
    try {
      if (authUser && currentProject.ownerId) {
        await deleteProjectFromFirestore(currentProject.id);
      } else {
        await dbDeleteProject(currentProject.id);
      }
      toast({ title: "Project Deleted", description: `"${currentProject.name}" has been deleted.` });
      router.replace("/");
    } catch (error) {
      toast({ title: "Error Deleting Project", description: "Could not delete project.", variant: "destructive" });
    }
  }, [currentProject, router, toast, isReadOnlyView, authUser]);

  const handleOpenNewItemDialog = useCallback((type: 'file' | 'folder', parentNodeId: string | null) => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Cannot create new items.", variant: "default" });
      return;
    }
    setNewItemType(type);
    setParentIdForNewItem(parentNodeId);
    setNewItemName("");
    setNewItemError("");
    setIsNewItemDialogOpen(true);
  }, [isReadOnlyView, toast]);

  const handleOpenNewItemDialogRef = useRef(handleOpenNewItemDialog);
  useEffect(() => { handleOpenNewItemDialogRef.current = handleOpenNewItemDialog; }, [handleOpenNewItemDialog]);

  useEffect(() => {
    const registerTriggers = () => {
      if (!currentProject) return;
      const getParentId = () => {
        const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(currentProject.fileSystemRoots, selectedFileNodeId) : null;
        if (currentActiveNode) {
          return currentActiveNode.type === 'folder' ? currentActiveNode.id : findParentId(currentProject.fileSystemRoots, currentActiveNode.id);
        }
        return null;
      };
      if (typeof registerTriggerNewFile === 'function') registerTriggerNewFile(() => handleOpenNewItemDialogRef.current('file', getParentId()));
      if (typeof registerTriggerNewFolder === 'function') registerTriggerNewFolder(() => handleOpenNewItemDialogRef.current('folder', getParentId()));
    };
    registerTriggers();
  }, [registerTriggerNewFile, registerTriggerNewFolder, selectedFileNodeId, currentProject]);

  const handleCreateNewItem = useCallback(async () => {
    if (isReadOnlyView || !currentProject || !newItemType) return;
    if (!newItemName.trim()) {
      setNewItemError(`Name cannot be empty.`);
      return;
    }
    setNewItemError("");

    const newNode: FileSystemNode = {
      id: crypto.randomUUID(),
      name: newItemName.trim(),
      type: newItemType,
      textContent: DEFAULT_EMPTY_TEXT_CONTENT,
      whiteboardContent: {...DEFAULT_EMPTY_WHITEBOARD_DATA},
      ...(newItemType === 'folder' ? { children: [] } : {}),
    };

    const newFileSystemRoots = addNodeToTreeRecursive(currentProject.fileSystemRoots, parentIdForNewItem, newNode);
    const projectWithNewNode = { ...currentProject, fileSystemRoots: newFileSystemRoots };
    
    const constructedProject = constructProjectDataToSave(projectWithNewNode);
    if (!constructedProject) return;

    await performSave(constructedProject, true);
    
    setProjectSearchTerm("");
    setSelectedFileNodeId(newNode.id);
    setIsNewItemDialogOpen(false);
    setNewItemType(null);
  }, [isReadOnlyView, currentProject, newItemName, newItemType, parentIdForNewItem, performSave, constructProjectDataToSave]);

  const handleNodeSelectedInExplorer = useCallback(async (selectedNode: FileSystemNode | null) => {
    if (saveStatus === 'unsaved' && currentProject) {
        const constructedProject = constructProjectDataToSave(currentProject);
        if (constructedProject) {
            await performSave(constructedProject, false);
        }
    }
    const newSelectedNodeId = selectedNode ? selectedNode.id : null;
    setSelectedFileNodeId(newSelectedNodeId);
  }, [saveStatus, performSave, currentProject, constructProjectDataToSave]);

  const handleDeleteNodeRequest = useCallback((nodeId: string) => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Cannot delete items.", variant: "default" });
      return;
    }
    setNodeToDeleteId(nodeId);
  }, [isReadOnlyView, toast]);

  const confirmDeleteNode = useCallback(async () => {
    if (isReadOnlyView || !nodeToDeleteId || !currentProject) return;

    const nodeBeingDeleted = findNodeByIdRecursive(currentProject.fileSystemRoots, nodeToDeleteId);
    const newFileSystemRoots = deleteNodeFromTreeRecursive(currentProject.fileSystemRoots, nodeToDeleteId);
    
    const projectWithDeletedNode = { ...currentProject, fileSystemRoots: newFileSystemRoots };

    if (selectedFileNodeId === nodeToDeleteId) setSelectedFileNodeId(null);
    
    const constructedProject = constructProjectDataToSave(projectWithDeletedNode);
    if (!constructedProject) return;

    await performSave(constructedProject, true);

    toast({ title: "Item Deleted", description: `"${nodeBeingDeleted?.name || 'Item'}" deleted.` });
    setNodeToDeleteId(null);
  }, [nodeToDeleteId, selectedFileNodeId, currentProject, performSave, toast, isReadOnlyView, constructProjectDataToSave]);

  const onAddFileToFolderCallback = useCallback((folderId: string | null) => handleOpenNewItemDialogRef.current('file', folderId), []);
  const onAddFolderToFolderCallback = useCallback((folderId: string | null) => handleOpenNewItemDialogRef.current('folder', folderId), []);

  const handleMoveNode = useCallback(async (draggedNodeId: string, targetFolderId: string | null) => {
    if (isReadOnlyView || !currentProject) {
      toast({ title: "Read-Only Mode", description: "Cannot move items.", variant: "default" });
      return;
    }
    if (draggedNodeId === targetFolderId) return;

    const draggedNode = findNodeByIdRecursive(currentProject.fileSystemRoots, draggedNodeId);
    if(draggedNode && targetFolderId && findNodeByIdRecursive([draggedNode], targetFolderId)) {
        toast({ title: "Invalid Move", description: "Cannot move a folder into one of its own subfolders.", variant: "destructive" });
        return;
    }

    const { removedNode, newTree: treeWithoutDraggedNode } = removeNodeFromTree(currentProject.fileSystemRoots, draggedNodeId);
    if (!removedNode) {
      toast({ title: "Move Error", description: "Could not find item to move.", variant: "destructive" });
      return;
    }
    
    const newFileSystemRoots = addNodeToTargetInTree(treeWithoutDraggedNode, targetFolderId, removedNode);
    
    const projectWithMovedNode = { ...currentProject, fileSystemRoots: newFileSystemRoots };
    const constructedProject = constructProjectDataToSave(projectWithMovedNode);
    if (!constructedProject) return;

    await performSave(constructedProject, true);
  }, [isReadOnlyView, currentProject, performSave, toast, constructProjectDataToSave]);

  const toastAlreadyShownRef = useRef(false); 
  useEffect(() => {
    if (isReadOnlyView && mounted && !isLoadingProject && !toastAlreadyShownRef.current && (!authUser || authUser?.uid !== currentProject?.ownerId)) {
      toast({
        title: "Read-Only Mode",
        description: "You are viewing a shared project. Changes cannot be saved.",
        duration: 5000
      });
      toastAlreadyShownRef.current = true;
    }
  }, [isReadOnlyView, mounted, isLoadingProject, toast, authUser, currentProject]);
  
  const filteredFileSystemNodes = useMemo(() => {
    if (!currentProject) return [];
    return filterFileSystem(currentProject.fileSystemRoots, projectSearchTerm);
  }, [currentProject, projectSearchTerm]);


  if (!mounted || isLoadingProject || authLoading) {
    return (
      <div className="flex h-screen flex-col fixed inset-0 pt-14">
         <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-14">
            <div className="container flex h-full items-center px-4 sm:px-6 lg:px-8">
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

  if (!currentProject) {
     return (
      <div className="flex h-screen flex-col items-center justify-center">
         <Info className="h-12 w-12 text-destructive mb-4" />
         <h1 className="text-2xl font-semibold mb-2">Project Not Found</h1>
         <p className="text-muted-foreground mb-6">The project you are looking for does not exist or could not be loaded.</p>
         <Button onClick={() => router.push('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
         </Button>
      </div>
    );
  }

  const editorKey = `editor-${selectedFileNodeId || 'project-root'}`;
  const whiteboardKey = `whiteboard-${selectedFileNodeId || 'project-root'}`;

  const hasFileSystemRoots = currentProject.fileSystemRoots.length > 0;
  const showContentPlaceholder = !selectedFileNodeId && hasFileSystemRoots && !projectSearchTerm;
  const showCreateFilePrompt = !selectedFileNodeId && !hasFileSystemRoots && !projectSearchTerm;
  const showSearchResultsInfo = !!projectSearchTerm;

  return (
    <div className="flex h-screen flex-col fixed inset-0 pt-14">
       <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-14">
        <div className="container flex h-full items-center px-4 sm:px-6 lg:px-8 gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="mr-2" aria-label="Back to dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex items-center">
            {isEditingNameState ? (
              <Input
                id="projectNameInput"
                defaultValue={currentProject.name}
                onBlur={handleNameEditToggle}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="h-9 text-lg font-semibold max-w-[150px] sm:max-w-xs"
                autoFocus
                readOnly={isReadOnlyView}
              />
            ) : (
              <h1 className="text-lg font-semibold truncate max-w-[150px] sm:max-w-xs cursor-pointer hover:underline" onClick={!isReadOnlyView ? () => setIsEditingNameState(true) : undefined}>
                {currentProject.name}
              </h1>
            )}
            {!isReadOnlyView && (
                <Button variant="ghost" size="icon" onClick={handleNameEditToggle} className="ml-1 mr-2" aria-label={isEditingNameState ? "Confirm name change" : "Edit project name"}>
                {isEditingNameState ? <Check className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                </Button>
            )}
          </div>
          
          <div className="relative flex-grow max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search in project..."
              className="pl-10 h-9"
              value={projectSearchTerm}
              onChange={(e) => setProjectSearchTerm(e.target.value)}
            />
          </div>

        {!isReadOnlyView && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-2">
                <PlusCircle className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">New</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => handleOpenNewItemDialogRef.current('file', selectedFileNodeId ? (findNodeByIdRecursive(currentProject.fileSystemRoots, selectedFileNodeId)?.type === 'folder' ? selectedFileNodeId : findParentId(currentProject.fileSystemRoots, selectedFileNodeId)) : null)}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                <span>New File</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenNewItemDialogRef.current('folder', selectedFileNodeId ? (findNodeByIdRecursive(currentProject.fileSystemRoots, selectedFileNodeId)?.type === 'folder' ? selectedFileNodeId : findParentId(currentProject.fileSystemRoots, selectedFileNodeId)) : null)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                <span>New Folder</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

          <div className="ml-auto flex items-center gap-2">
            {!isReadOnlyView && (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="default" size="sm" onClick={handleManualSave} disabled={saveStatus !== 'unsaved'} className="px-3">
                            {saveStatus === 'saving' ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>) : saveStatus === 'synced' ? (<><CheckCircle2 className="mr-2 h-4 w-4" />Synced</>) : (<><Save className="mr-2 h-4 w-4" />Save</>)}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>{saveStatus === 'unsaved' ? 'You have unsaved changes' : 'All changes are saved'}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <Button variant="outline" size="sm" onClick={() => setIsExplorerVisible(!isExplorerVisible)} className="px-2" aria-label={isExplorerVisible ? "Hide file explorer" : "Show file explorer"}>
              {isExplorerVisible ? <PanelLeftOpen className="h-4 w-4 sm:mr-2" /> : <FolderTree className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">Explorer</span>
            </Button>

            <div className="flex items-center gap-1 px-2 rounded-md border bg-muted">
              <Button variant={viewMode === 'editor' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('editor')} aria-label="Editor View" disabled={showContentPlaceholder || showCreateFilePrompt || showSearchResultsInfo}><Edit3 className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Editor</span></Button>
              <Button variant={viewMode === 'both' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('both')} aria-label="Split View" disabled={showContentPlaceholder || showCreateFilePrompt || showSearchResultsInfo}><Rows className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Both</span></Button>
              <Button variant={viewMode === 'whiteboard' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('whiteboard')} aria-label="Whiteboard View" disabled={showContentPlaceholder || showCreateFilePrompt || showSearchResultsInfo}><LayoutDashboard className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Board</span></Button>
            </div>

            <Button variant="outline" onClick={() => setIsShareDialogOpen(true)}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
            {!isReadOnlyView && (!currentProject.ownerId || (authUser?.uid === currentProject.ownerId)) && (
                <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="destructive" size="icon" aria-label="Delete project"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete the project "{currentProject.name}".</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteProject}>Delete Project</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
                </AlertDialog>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden h-full">
        <ResizablePanelGroup direction="horizontal" className="h-full w-full">
          {isExplorerVisible && (
            <>
              <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
                <div className="h-full p-1 sm:p-2 md:p-3">
                  <FileExplorer nodes={filteredFileSystemNodes} onNodeSelect={handleNodeSelectedInExplorer} onDeleteNode={handleDeleteNodeRequest} onAddFileToFolder={onAddFileToFolderCallback} onAddFolderToFolder={onAddFolderToFolderCallback} selectedNodeId={selectedFileNodeId} onMoveNode={handleMoveNode} isReadOnly={isReadOnlyView} searchTerm={projectSearchTerm}/>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel defaultSize={isExplorerVisible ? 80 : 100} className="flex flex-col">
            {showSearchResultsInfo && (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <Search className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Project Search Results</h2>
                <p className="text-muted-foreground">{filteredFileSystemNodes.length > 0 ? `Found ${filteredFileSystemNodes.length} matching item(s). Select one from the explorer.` : 'No items match your search.'}</p>
                <p className="text-sm text-muted-foreground mt-1">Clear the search to view content.</p>
              </div>
            )}
            {showContentPlaceholder && (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <FolderTree className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Select a file or folder</h2>
                <p className="text-muted-foreground">Choose an item from the explorer on the left to view or edit its content.</p>
              </div>
            )}
            {showCreateFilePrompt && (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <FilePlus2 className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Project is Empty</h2>
                <p className="text-muted-foreground mb-4">Create your first file to get started.</p>
                <Button onClick={() => handleOpenNewItemDialogRef.current('file', null)} disabled={isReadOnlyView}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Create New File
                </Button>
              </div>
            )}

            {(!selectedFileNodeId && !showCreateFilePrompt && !showContentPlaceholder && !showSearchResultsInfo) || (selectedFileNodeId && !showSearchResultsInfo) ? (
                viewMode === "editor" ? (
                  <div className="h-full p-1 sm:p-2 md:p-3"><RichTextEditor key={editorKey} value={activeTextContent} onChange={handleTextChange} isReadOnly={isReadOnlyView} /></div>
                ) : viewMode === "whiteboard" ? (
                  <div className="h-full p-1 sm:p-2 md:p-3"><Whiteboard key={whiteboardKey} initialData={activeWhiteboardDataRef.current} onChange={handleWhiteboardChange} isReadOnly={isReadOnlyView} /></div>
                ) : viewMode === "both" ? (
                  <ResizablePanelGroup direction="horizontal" className="h-full w-full">
                    <ResizablePanel defaultSize={50} minSize={20}><div className="h-full p-1 sm:p-2 md:p-3"><RichTextEditor key={`${editorKey}-both`} value={activeTextContent} onChange={handleTextChange} isReadOnly={isReadOnlyView}/></div></ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={50} minSize={20}><div className="h-full p-1 sm:p-2 md:p-3"><Whiteboard key={`${whiteboardKey}-both`} initialData={activeWhiteboardDataRef.current} onChange={handleWhiteboardChange} isReadOnly={isReadOnlyView}/></div></ResizablePanel>
                  </ResizablePanelGroup>
                ) : null
            ) : null}
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {currentProject && (<ShareProjectDialog project={currentProject} isOpen={isShareDialogOpen} onOpenChange={setIsShareDialogOpen} isLocal={!authUser} />)}

    {!isReadOnlyView && (
      <Dialog open={isNewItemDialogOpen} onOpenChange={setIsNewItemDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New {newItemType === 'file' ? 'File' : 'Folder'}</DialogTitle>
            <DialogDescription>Enter a name for your new {newItemType}.{parentIdForNewItem && findNodeByIdRecursive(currentProject.fileSystemRoots, parentIdForNewItem) ? ` It will be created in "${findNodeByIdRecursive(currentProject.fileSystemRoots, parentIdForNewItem)?.name}".` : " It will be created at the root."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4"><Label htmlFor="itemName">Name</Label><Input id="itemName" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} aria-describedby="item-name-error" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateNewItem(); }}}/>{newItemError && <p id="item-name-error" className="text-sm text-red-500">{newItemError}</p>}</div>
          <DialogFooter><Button variant="outline" onClick={() => setIsNewItemDialogOpen(false)}>Cancel</Button><Button onClick={handleCreateNewItem}>Create {newItemType === 'file' ? 'File' : 'Folder'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    )}
    {!isReadOnlyView && (
      <AlertDialog open={!!nodeToDeleteId} onOpenChange={(open) => !open && setNodeToDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the selected item{currentProject && nodeToDeleteId && findNodeByIdRecursive(currentProject.fileSystemRoots, nodeToDeleteId)?.type === 'folder' && ' and all its contents'}.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => setNodeToDeleteId(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteNode}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}
    </div>
  );
}

export default function ProjectPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen flex-col fixed inset-0 pt-14">
         <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-14">
            <div className="container flex h-full items-center px-4 sm:px-6 lg:px-8"><h1 className="text-lg font-semibold">Loading Project...</h1><Loader2 className="ml-2 h-5 w-5 animate-spin" /></div>
        </header>
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Preparing workspace...</p></div>
      </div>
    }>
      <ProjectPageContent />
    </Suspense>
  )
}
