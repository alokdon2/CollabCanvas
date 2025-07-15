
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
        // Check if children match
        const filteredChildren = node.children ? filterFileSystem(node.children, searchTerm) : undefined;
        const hasMatchingChildren = filteredChildren && filteredChildren.length > 0;

        // Check if current node name matches
        const nameMatches = node.name.toLowerCase().includes(lowercasedSearchTerm);

        // Check if current node content matches
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
  const { user: authUser } = useAuth();

  const searchParams = useSearchParams();
  const initialIsShared = searchParams.get('shared') === 'true';

  // --- Core State ---
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isReadOnlyView, setIsReadOnlyView] = useState(initialIsShared);

  // --- Active Content States (for editor/whiteboard inputs, reflects what user is currently editing) ---
  const [activeTextContent, setActiveTextContent] = useState(DEFAULT_EMPTY_TEXT_CONTENT);
  const activeWhiteboardDataRef = useRef<WhiteboardData>({...DEFAULT_EMPTY_WHITEBOARD_DATA});

  // --- UI/Dialog States ---
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

  // --- Save Mechanism States ---
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('synced');
  
  // --- Initial Load ---
  useEffect(() => {
    setMounted(true);
    async function fetchAndInitializeProject() {
      if (!projectId || !mounted) return;
      setIsLoadingProject(true);
      try {
        const projectDataFromDB = await realtimeLoadProjectData(projectId);
        if (!mounted) return; // Check mounted again after await

        if (projectDataFromDB) {
          setCurrentProject(projectDataFromDB); // This will trigger derived state updates
          setSaveStatus('synced');
          setSelectedFileNodeId(null); 
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, mounted]); // Minimal stable dependencies, router/toast/setGlobalProjectNameFromContext are stable


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


  // --- Construct project data for saving ---
  const constructProjectDataToSave = useCallback((
    projectState: Project,
    nameOverride: string | null = null,
    fileSystemRootsOverride: FileSystemNode[] | null = null
  ): Project | null => {
      
    const nameForSave = nameOverride ?? projectState.name;
    const fileSystemRootsForSave = fileSystemRootsOverride ?? projectState.fileSystemRoots;
    let finalProjectState: Project;

    // Save the currently active content back into the project state before saving
    if (selectedFileNodeId) {
        const selectedNode = findNodeByIdRecursive(fileSystemRootsForSave, selectedFileNodeId);
        if (selectedNode) {
            const updatedNode = {
                ...selectedNode,
                textContent: activeTextContent,
                whiteboardContent: activeWhiteboardDataRef.current,
            };
            const updatedRoots = replaceNodeInTree(fileSystemRootsForSave, selectedFileNodeId, updatedNode);
            finalProjectState = { ...projectState, fileSystemRoots: updatedRoots };
        } else {
             // This case should ideally not happen if state is consistent
            finalProjectState = { ...projectState, fileSystemRoots: fileSystemRootsForSave };
        }
    } else {
        // Saving the root content
        finalProjectState = {
            ...projectState,
            textContent: activeTextContent,
            whiteboardContent: activeWhiteboardDataRef.current,
            fileSystemRoots: fileSystemRootsForSave,
        };
    }
    
    return {
        ...finalProjectState,
        name: nameForSave,
        updatedAt: new Date().toISOString(),
    };
  }, [activeTextContent, selectedFileNodeId]);


  // --- Perform Save Operation ---
  const performSave = useCallback(async (
    isStructuralChange: boolean = false
  ) => {
    if (isReadOnlyView || !authUser || !currentProject || saveStatus === 'saving') {
      return;
    }

    setSaveStatus('saving');
    
    const constructedProjectToSave = constructProjectDataToSave(currentProject);

    if (!constructedProjectToSave) {
        console.error("[ProjectPage performSave] constructProjectDataToSave returned null.");
        setSaveStatus('error');
        return;
    }
    
    const finalProjectDataForFirestore: Project = {
        ...constructedProjectToSave,
        ownerId: constructedProjectToSave.ownerId || authUser.uid, 
    };

    try {
      await realtimeSaveProjectData(finalProjectDataForFirestore);
      
      // After save, update the main project state
      // This is crucial for reflecting structural changes and keeping data consistent
      setCurrentProject(finalProjectDataForFirestore); 
      setSaveStatus('synced');
      if (isStructuralChange) {
        toast({ title: "Project Updated", description: "Your project structure has been saved." });
      } else {
        toast({ title: "Project Saved", description: "Your changes have been saved." });
      }

    } catch (error) {
      console.error("[ProjectPage performSave] Failed to save project to Firestore:", error);
      toast({ title: "Save Error", description: `Could not save project: ${(error as Error).message}`, variant: "destructive" });
      setSaveStatus('error');
    }
  }, [isReadOnlyView, authUser, currentProject, constructProjectDataToSave, toast, saveStatus]);

  // --- Keyboard shortcut for saving ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (saveStatus === 'unsaved') {
          performSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [performSave, saveStatus]);


  // --- User Input Handlers (triggering 'unsaved' status) ---
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

  const handleProjectNameChange = useCallback(() => {
    if (isReadOnlyView) return;
    if (saveStatus !== 'saving') setSaveStatus('unsaved');
  }, [isReadOnlyView, saveStatus]);


  // --- Other Actions (Create, Delete, Share, etc.) ---
  const handleNameEditToggle = useCallback(async () => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Project name cannot be changed.", variant: "default" });
      return;
    }
    if (isEditingNameState) {
        // When finishing edit, if there's an unsaved change (because of the name change), save it.
        if (currentProject && currentProject.name !== (document.getElementById('projectNameInput') as HTMLInputElement)?.value) {
            await performSave(true);
        }
    } else {
        // When starting edit, update project name directly
        if(currentProject) {
            setCurrentProject(prev => prev ? { ...prev, name: (document.getElementById('projectNameInput') as HTMLInputElement)?.value ?? prev.name } : null);
        }
    }
    setIsEditingNameState(!isEditingNameState);
  }, [isReadOnlyView, isEditingNameState, currentProject, performSave, toast]);

  const confirmDeleteProject = useCallback(async () => {
    if (isReadOnlyView || !currentProject) return;
    if (authUser && currentProject.ownerId !== authUser.uid) {
        toast({ title: "Permission Denied", description: "You are not the owner.", variant: "destructive" });
        return;
    }
    try {
      await deleteProjectFromFirestore(currentProject.id);
      toast({ title: "Project Deleted", description: `"${currentProject.name}" has been deleted.` });
      router.replace("/");
    } catch (error) {
      toast({ title: "Error Deleting Project", description: "Could not delete project.", variant: "destructive" });
    }
  }, [currentProject, router, toast, isReadOnlyView, authUser]);

  const handleOpenNewItemDialog = useCallback((type: 'file' | 'folder', parentNodeId: string | null) => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Cannot create new items in read-only view.", variant: "default" });
      return;
    }
    setNewItemType(type);
    setParentIdForNewItem(parentNodeId);
    setNewItemName("");
    setNewItemError("");
    setIsNewItemDialogOpen(true);
  }, [isReadOnlyView, toast]);

  const handleOpenNewItemDialogRef = useRef(handleOpenNewItemDialog);
  useEffect(() => {
    handleOpenNewItemDialogRef.current = handleOpenNewItemDialog;
  }, [handleOpenNewItemDialog]);

  useEffect(() => {
    if (typeof registerTriggerNewFile === 'function' && currentProject) {
      registerTriggerNewFile(() => {
        const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(currentProject.fileSystemRoots, selectedFileNodeId) : null;
        let parentIdToUse: string | null = null;
        if (currentActiveNode) {
            parentIdToUse = currentActiveNode.type === 'folder' ? currentActiveNode.id : findParentId(currentProject.fileSystemRoots, currentActiveNode.id);
        }
        handleOpenNewItemDialogRef.current('file', parentIdToUse);
      });
    }
    if (typeof registerTriggerNewFolder === 'function' && currentProject) {
      registerTriggerNewFolder(() => {
        const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(currentProject.fileSystemRoots, selectedFileNodeId) : null;
        let parentIdToUse: string | null = null;
        if (currentActiveNode) {
            parentIdToUse = currentActiveNode.type === 'folder' ? currentActiveNode.id : findParentId(currentProject.fileSystemRoots, currentActiveNode.id);
        }
        handleOpenNewItemDialogRef.current('folder', parentIdToUse);
      });
    }
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
    
    // Update state immediately for responsiveness
    setCurrentProject(prev => prev ? {...prev, fileSystemRoots: newFileSystemRoots} : null);

    await performSave(true); // isStructuralChange = true
    
    setSelectedFileNodeId(newNode.id); 
    setIsNewItemDialogOpen(false);
    setNewItemType(null);
  }, [isReadOnlyView, currentProject, newItemName, newItemType, parentIdForNewItem, performSave]);

  const handleNodeSelectedInExplorer = useCallback(async (selectedNode: FileSystemNode | null) => {
    // Only save if there are pending changes.
    if (saveStatus === 'unsaved') {
      await performSave();
    }
    
    const newSelectedNodeId = selectedNode ? selectedNode.id : null;
    setSelectedFileNodeId(newSelectedNodeId);
  }, [saveStatus, performSave]);

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

    if (selectedFileNodeId === nodeToDeleteId) {
        setSelectedFileNodeId(null); 
    }
    
    // Update state immediately
    setCurrentProject(prev => prev ? {...prev, fileSystemRoots: newFileSystemRoots} : null);

    await performSave(true); // isStructuralChange = true

    toast({ title: "Item Deleted", description: `"${nodeBeingDeleted?.name || 'Item'}" deleted.` });
    setNodeToDeleteId(null);
  }, [nodeToDeleteId, selectedFileNodeId, currentProject, performSave, toast, isReadOnlyView]);

  const onAddFileToFolderCallback = useCallback((folderId: string | null) => {
    handleOpenNewItemDialogRef.current('file', folderId);
  }, []);

  const onAddFolderToFolderCallback = useCallback((folderId: string | null) => {
    handleOpenNewItemDialogRef.current('folder', folderId);
  }, []);

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
    setCurrentProject(prev => prev ? {...prev, fileSystemRoots: newFileSystemRoots} : null);
    await performSave(true); // isStructuralChange = true
  }, [isReadOnlyView, currentProject, performSave, toast]);

  const toastAlreadyShownRef = useRef(false); 
  useEffect(() => {
    if (!currentProject || !authUser || !mounted || isLoadingProject) return;
    const currentIsSharedParam = searchParams.get('shared') === 'true';
    // An owner should never be in read-only mode, even with a shared link
    let effectiveReadOnly = currentIsSharedParam && authUser.uid !== currentProject.ownerId;
    
    if (effectiveReadOnly !== isReadOnlyView) {
      setIsReadOnlyView(effectiveReadOnly);
    }

    if (effectiveReadOnly && mounted && !isLoadingProject && !toastAlreadyShownRef.current && currentProject.ownerId) {
      toast({
        title: "Read-Only Mode",
        description: "You are viewing a shared project. Changes cannot be saved.",
        duration: 5000
      });
      toastAlreadyShownRef.current = true;
    }
  }, [searchParams, toast, mounted, isReadOnlyView, currentProject, authUser, isLoadingProject]);
  
  const filteredFileSystemNodes = useMemo(() => {
    if (!currentProject) return [];
    return filterFileSystem(currentProject.fileSystemRoots, projectSearchTerm);
  }, [currentProject, projectSearchTerm]);


  // --- Render Logic ---
  if (!mounted || isLoadingProject) {
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
                onBlur={(e) => {
                    const newName = e.target.value.trim();
                    if (newName && newName !== currentProject.name) {
                        setCurrentProject(prev => prev ? {...prev, name: newName} : null);
                        handleProjectNameChange();
                    }
                    handleNameEditToggle();
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        const newName = e.currentTarget.value.trim();
                        if (newName && newName !== currentProject.name) {
                             setCurrentProject(prev => prev ? {...prev, name: newName} : null);
                             handleProjectNameChange();
                        }
                        handleNameEditToggle();
                    }
                }}
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
              <DropdownMenuItem onClick={() => {
                const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(currentProject.fileSystemRoots, selectedFileNodeId) : null;
                let parentIdToUse: string | null = null;
                if (currentActiveNode) {
                    parentIdToUse = currentActiveNode.type === 'folder' ? currentActiveNode.id : findParentId(currentProject.fileSystemRoots, currentActiveNode.id);
                } 
                handleOpenNewItemDialogRef.current('file', parentIdToUse);
              }}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                <span>New File</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                 const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(currentProject.fileSystemRoots, selectedFileNodeId) : null;
                 let parentIdToUse: string | null = null;
                 if (currentActiveNode) {
                     parentIdToUse = currentActiveNode.type === 'folder' ? currentActiveNode.id : findParentId(currentProject.fileSystemRoots, currentActiveNode.id);
                 } 
                 handleOpenNewItemDialogRef.current('folder', parentIdToUse);
              }}>
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
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => performSave()}
                            disabled={saveStatus !== 'unsaved'}
                            className="px-3"
                        >
                            {saveStatus === 'saving' ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : saveStatus === 'synced' ? (
                                <>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Saved
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save
                                </>
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        <p>{saveStatus === 'unsaved' ? 'You have unsaved changes' : 'All changes saved'}</p>
                    </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExplorerVisible(!isExplorerVisible)}
              className="px-2"
              aria-label={isExplorerVisible ? "Hide file explorer" : "Show file explorer"}
            >
              {isExplorerVisible ? <PanelLeftOpen className="h-4 w-4 sm:mr-2" /> : <FolderTree className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">Explorer</span>
            </Button>

            <div className="flex items-center gap-1 px-2 rounded-md border bg-muted">
              <Button variant={viewMode === 'editor' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('editor')} aria-label="Editor View" disabled={showContentPlaceholder || (showCreateFilePrompt && isReadOnlyView) || showSearchResultsInfo}>
                <Edit3 className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Editor</span>
              </Button>
              <Button variant={viewMode === 'both' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('both')} aria-label="Split View" disabled={showContentPlaceholder || (showCreateFilePrompt && isReadOnlyView) || showSearchResultsInfo}>
                 <Rows className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Both</span>
              </Button>
              <Button variant={viewMode === 'whiteboard' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('whiteboard')} aria-label="Whiteboard View" disabled={showContentPlaceholder || (showCreateFilePrompt && isReadOnlyView) || showSearchResultsInfo}>
                <LayoutDashboard className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Board</span>
              </Button>
            </div>

            <Button variant="outline" onClick={() => setIsShareDialogOpen(true)}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
            {!isReadOnlyView && authUser?.uid === currentProject.ownerId && (
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
                        project "{currentProject.name}" from the cloud.
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
                  <FileExplorer
                    nodes={filteredFileSystemNodes}
                    onNodeSelect={handleNodeSelectedInExplorer}
                    onDeleteNode={handleDeleteNodeRequest}
                    onAddFileToFolder={onAddFileToFolderCallback}
                    onAddFolderToFolder={onAddFolderToFolderCallback}
                    selectedNodeId={selectedFileNodeId}
                    onMoveNode={handleMoveNode}
                    isReadOnly={isReadOnlyView}
                    searchTerm={projectSearchTerm}
                  />
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
                <p className="text-muted-foreground">
                  {filteredFileSystemNodes.length > 0
                    ? `Found ${filteredFileSystemNodes.length} matching item(s). Select one from the explorer.`
                    : 'No items match your search.'}
                </p>
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
            {showCreateFilePrompt && !isReadOnlyView && (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <FilePlus2 className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Project is Empty</h2>
                <p className="text-muted-foreground mb-4">Create your first file to get started.</p>
                <Button onClick={() => handleOpenNewItemDialogRef.current('file', null)}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Create New File
                </Button>
              </div>
            )}
            {showCreateFilePrompt && isReadOnlyView && (
                 <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                    <Info className="h-16 w-16 text-muted-foreground mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Project is Empty</h2>
                    <p className="text-muted-foreground">This shared project currently has no files or folders.</p>
                 </div>
            )}

            {(!selectedFileNodeId && !showCreateFilePrompt && !showContentPlaceholder && !showSearchResultsInfo) || (selectedFileNodeId && !showSearchResultsInfo) ? (
                viewMode === "editor" ? (
                  <div className="h-full p-1 sm:p-2 md:p-3">
                    <RichTextEditor key={editorKey} value={activeTextContent} onChange={handleTextChange} isReadOnly={isReadOnlyView} />
                  </div>
                ) : viewMode === "whiteboard" ? (
                  <div className="h-full p-1 sm:p-2 md:p-3">
                    <Whiteboard key={whiteboardKey} initialData={activeWhiteboardDataRef.current} onChange={handleWhiteboardChange} isReadOnly={isReadOnlyView} />
                  </div>
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

      {currentProject && (
        <ShareProjectDialog
          project={currentProject}
          isOpen={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          isLocal={false} 
        />
      )}

    {!isReadOnlyView && (
      <Dialog open={isNewItemDialogOpen} onOpenChange={setIsNewItemDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New {newItemType === 'file' ? 'File' : 'Folder'}</DialogTitle>
            <DialogDescription>
              Enter a name for your new {newItemType}.
              {parentIdForNewItem && findNodeByIdRecursive(currentProject.fileSystemRoots, parentIdForNewItem) ? 
                ` It will be created in "${findNodeByIdRecursive(currentProject.fileSystemRoots, parentIdForNewItem)?.name}".` :
                 selectedFileNodeId && findNodeByIdRecursive(currentProject.fileSystemRoots, selectedFileNodeId)?.type === 'folder' ?
                 ` It will be created in "${findNodeByIdRecursive(currentProject.fileSystemRoots, selectedFileNodeId)?.name}".` :
                 " It will be created at the root of the project."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="itemName">Name</Label>
            <Input
              id="itemName"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              aria-describedby="item-name-error"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateNewItem(); }}}
            />
             {newItemError && <p id="item-name-error" className="text-sm text-red-500">{newItemError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewItemDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateNewItem}>Create {newItemType === 'file' ? 'File' : 'Folder'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
    {!isReadOnlyView && (
      <AlertDialog open={!!nodeToDeleteId} onOpenChange={(open) => !open && setNodeToDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected item
              {currentProject && nodeToDeleteId && findNodeByIdRecursive(currentProject.fileSystemRoots, nodeToDeleteId)?.type === 'folder' && ' and all its contents'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNodeToDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteNode}>Delete</AlertDialogAction>
          </AlertDialogFooter>
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
            <div className="container flex h-full items-center px-4 sm:px-6 lg:px-8">
                <h1 className="text-lg font-semibold">Loading Project Structure...</h1>
                <Loader2 className="ml-2 h-5 w-5 animate-spin" />
            </div>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Preparing project workspace...</p>
        </div>
      </div>
    }>
      <ProjectPageContent />
    </Suspense>
  )
}
    

    

    