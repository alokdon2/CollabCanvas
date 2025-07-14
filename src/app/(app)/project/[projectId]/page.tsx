
"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Whiteboard } from "@/components/Whiteboard";
import type { Project, WhiteboardData, FileSystemNode, ExcalidrawAppState } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Trash2, Edit, Check, LayoutDashboard, Edit3, Rows, FolderTree, Loader2, PanelLeftOpen, PlusCircle, FilePlus2, FolderPlus, Info, CheckCircle2, AlertCircle } from "lucide-react";
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
type SaveStatus = 'idle' | 'saving' | 'synced' | 'error';

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

  // --- Derived States (from currentProject for UI binding, but can be temporarily out of sync before save) ---
  const [editingProjectName, setEditingProjectName] = useState("");
  const [activeFileSystemRoots, setActiveFileSystemRoots] = useState<FileSystemNode[]>([]);
  const [projectRootTextContent, setProjectRootTextContent] = useState(DEFAULT_EMPTY_TEXT_CONTENT); // Derived from currentProject
  const [projectRootWhiteboardData, setProjectRootWhiteboardData] = useState<WhiteboardData>({...DEFAULT_EMPTY_WHITEBOARD_DATA}); // Derived

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

  // --- Save Mechanism States ---
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingSnapshotRef = useRef(false);

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
          setLastSyncTime(new Date(projectDataFromDB.updatedAt).toLocaleTimeString());
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
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setGlobalProjectNameFromContext(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, mounted]); // Minimal stable dependencies, router/toast/setGlobalProjectNameFromContext are stable


  // --- Derive states from currentProject ---
  useEffect(() => {
    if (currentProject) {
      setEditingProjectName(currentProject.name);
      setGlobalProjectNameFromContext(currentProject.name);
      setActiveFileSystemRoots(ensureNodeContentDefaults(currentProject.fileSystemRoots || []));
      setProjectRootTextContent(currentProject.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
      setProjectRootWhiteboardData(
        currentProject.whiteboardContent 
        ? processSingleWhiteboardData(currentProject.whiteboardContent, 'load') || {...DEFAULT_EMPTY_WHITEBOARD_DATA}
        : {...DEFAULT_EMPTY_WHITEBOARD_DATA}
      );
    }
  }, [currentProject, setGlobalProjectNameFromContext]);


  // --- Sync active editor/whiteboard content based on selection and derived root/file states ---
  useEffect(() => {
    if (!currentProject) return; // Ensure currentProject is loaded

    if (selectedFileNodeId) {
      const node = findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId);
      if (node) {
        setActiveTextContent(node.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
        activeWhiteboardDataRef.current = node.whiteboardContent ? processSingleWhiteboardData(node.whiteboardContent, 'load') || {...DEFAULT_EMPTY_WHITEBOARD_DATA} : {...DEFAULT_EMPTY_WHITEBOARD_DATA};
      } else {
        setSelectedFileNodeId(null); 
        setActiveTextContent(projectRootTextContent);
        activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
      }
    } else {
      setActiveTextContent(projectRootTextContent);
      activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
    }
  }, [selectedFileNodeId, activeFileSystemRoots, projectRootTextContent, projectRootWhiteboardData, currentProject]);


  // --- Construct project data for saving ---
  const constructProjectDataToSave = useCallback((
    projectNameOverride: string | null = null,
    fileSystemRootsArg: FileSystemNode[] | null = null
  ): Project | null => {
    if (!currentProject) return null;

    const nameForSave = projectNameOverride ?? editingProjectName;
    const currentFileSystemRootsSource = fileSystemRootsArg ?? activeFileSystemRoots;
    const fileSystemRootsForSaveAttempt = JSON.parse(JSON.stringify(currentFileSystemRootsSource)) as FileSystemNode[];

    let textContentForSave: string;
    let whiteboardContentForSave: WhiteboardData | null;
    let finalModifiedFileSystemRoots: FileSystemNode[];

    if (selectedFileNodeId && !fileSystemRootsArg) {
        finalModifiedFileSystemRoots = replaceNodeInTree(fileSystemRootsForSaveAttempt, selectedFileNodeId, {
            ...(findNodeByIdRecursive(fileSystemRootsForSaveAttempt, selectedFileNodeId) as FileSystemNode),
            textContent: activeTextContent,
            whiteboardContent: activeWhiteboardDataRef.current, // Use ref directly
        });
        textContentForSave = currentProject.textContent;
        whiteboardContentForSave = currentProject.whiteboardContent;
    } else {
        textContentForSave = activeTextContent;
        whiteboardContentForSave = activeWhiteboardDataRef.current; // Use ref directly
        finalModifiedFileSystemRoots = fileSystemRootsForSaveAttempt;
    }
    
    return {
        ...currentProject,
        name: nameForSave,
        textContent: textContentForSave,
        whiteboardContent: whiteboardContentForSave,
        fileSystemRoots: finalModifiedFileSystemRoots,
        updatedAt: new Date().toISOString(),
    };
  }, [currentProject, editingProjectName, activeTextContent, activeFileSystemRoots, selectedFileNodeId]);


  // --- Perform Save Operation ---
  const performSave = useCallback(async (
    projectNameOverride: string | null = null,
    fileSystemRootsOverride: FileSystemNode[] | null = null
  ): Promise<Project | null> => {
    if (isReadOnlyView || !authUser || !currentProject) {
      console.log("[ProjectPage performSave] In read-only view, no auth user, or no current project. Save skipped.");
      return null;
    }

    setSaveStatus('saving');
    const projectToSave = constructProjectDataToSave(projectNameOverride, fileSystemRootsOverride);

    if (!projectToSave) {
        console.error("[ProjectPage performSave] constructProjectDataToSave returned null.");
        setSaveStatus('error');
        return null;
    }
    
    const finalProjectDataForFirestore: Project = {
        ...projectToSave,
        ownerId: projectToSave.ownerId || authUser.uid, 
    };

    try {
      await realtimeSaveProjectData(finalProjectDataForFirestore);
      console.log("[ProjectPage performSave] Save successful to Firestore for project:", finalProjectDataForFirestore.id, "at", finalProjectDataForFirestore.updatedAt);
      
      setCurrentProject(finalProjectDataForFirestore); 
      setSaveStatus('synced');
      setLastSyncTime(new Date(finalProjectDataForFirestore.updatedAt).toLocaleTimeString());
      return finalProjectDataForFirestore;
    } catch (error) {
      console.error("[ProjectPage performSave] Failed to save project to Firestore:", error);
      toast({ title: "Save Error", description: `Could not save project: ${(error as Error).message}`, variant: "destructive" });
      setSaveStatus('error');
      return null;
    }
  }, [isReadOnlyView, authUser, currentProject, constructProjectDataToSave, toast]);

  // --- Auto-Save useEffect ---
  useEffect(() => {
    if (isReadOnlyView || !mounted || isLoadingProject || (saveStatus !== 'idle' && saveStatus !== 'error')) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      return;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (isReadOnlyView || saveStatus !== 'idle') { 
        return;
      }
      await performSave(); // Call without overrides for auto-save
      saveTimeoutRef.current = null;
    }, 2000);

    return () => {
      if(saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [activeTextContent, performSave, isReadOnlyView, mounted, isLoadingProject, saveStatus]);


  // --- Keyboard shortcut for saving ---
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (isReadOnlyView || !currentProject || saveStatus === 'saving') {
          toast({
            title: "Cannot Save",
            description: isReadOnlyView ? "Project is in read-only mode." : (saveStatus === 'saving' ? "Already saving..." : "Project not ready to save."),
            variant: "default",
            duration: 2000,
          });
          return;
        }

        // Clear any pending auto-save timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        
        // Manually trigger save
        await performSave();
        toast({
          title: "Project Saved",
          description: "Your changes have been saved manually.",
          duration: 2000
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isReadOnlyView, currentProject, performSave, toast, saveStatus]);


  // --- User Input Handlers (triggering saveStatus='idle') ---
  const handleTextChange = useCallback((newText: string) => {
    if (isReadOnlyView) return;
    setActiveTextContent(newText);
    if (saveStatus !== 'saving') setSaveStatus('idle');
  }, [isReadOnlyView, saveStatus]);

  const handleWhiteboardChange = useCallback((newData: WhiteboardData) => {
    if (isReadOnlyView) return;
    activeWhiteboardDataRef.current = newData;
    if (saveStatus !== 'saving') setSaveStatus('idle');
  }, [isReadOnlyView, saveStatus]);

  const handleProjectNameChange = useCallback((newName: string) => {
    if (isReadOnlyView) return;
    setEditingProjectName(newName);
    if (saveStatus !== 'saving') setSaveStatus('idle');
  }, [isReadOnlyView, saveStatus]);


  // --- Other Actions (Create, Delete, Share, etc.) ---
  const handleNameEditToggle = useCallback(async () => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Project name cannot be changed.", variant: "default" });
      return;
    }
    if (isEditingNameState && currentProject) {
      const newName = editingProjectName.trim();
      if (newName && newName !== currentProject.name) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        const savedProject = await performSave(newName, null); 
        if (savedProject) {
            toast({title: "Project Renamed", description: `Project name updated to "${newName}".`});
        } else {
            setEditingProjectName(currentProject.name); 
        }
      } else if (!newName || newName === currentProject.name) { 
        setEditingProjectName(currentProject.name);
      }
    }
    setIsEditingNameState(!isEditingNameState);
  }, [isReadOnlyView, isEditingNameState, currentProject, editingProjectName, performSave, toast]);

  const confirmDeleteProject = useCallback(async () => {
    if (isReadOnlyView || !currentProject) return;
    if (authUser && currentProject.ownerId !== authUser.uid) {
        toast({ title: "Permission Denied", description: "You are not the owner.", variant: "destructive" });
        return;
    }
    try {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
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
    if (typeof registerTriggerNewFile === 'function') {
      registerTriggerNewFile(() => {
        const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId) : null;
        let parentIdToUse: string | null = null;
        if (currentActiveNode) {
            parentIdToUse = currentActiveNode.type === 'folder' ? currentActiveNode.id : findParentId(activeFileSystemRoots, currentActiveNode.id);
        }
        handleOpenNewItemDialogRef.current('file', parentIdToUse);
      });
    }
    if (typeof registerTriggerNewFolder === 'function') {
      registerTriggerNewFolder(() => {
        const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId) : null;
        let parentIdToUse: string | null = null;
        if (currentActiveNode) {
            parentIdToUse = currentActiveNode.type === 'folder' ? currentActiveNode.id : findParentId(activeFileSystemRoots, currentActiveNode.id);
        }
        handleOpenNewItemDialogRef.current('folder', parentIdToUse);
      });
    }
  }, [registerTriggerNewFile, registerTriggerNewFolder, selectedFileNodeId, activeFileSystemRoots]);

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

    const newFileSystemRoots = addNodeToTreeRecursive(activeFileSystemRoots, parentIdForNewItem, newNode);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const savedProject = await performSave(null, newFileSystemRoots); 
    
    if (savedProject) {
        // currentProject is updated by performSave. The useEffect deriving activeFileSystemRoots will handle UI update.
        // We can also set it directly if needed for very immediate feedback, but derived effect is cleaner.
        setActiveFileSystemRoots(newFileSystemRoots); // Optional: for immediate UI feedback
        setSelectedFileNodeId(newNode.id); 
        toast({ title: `${newItemType === 'file' ? 'File' : 'Folder'} Created`, description: `"${newNode.name}" created.`});
    }
    // No explicit revert needed for activeFileSystemRoots if save fails, as it's derived from currentProject,
    // and currentProject wouldn't have been updated with the new node.
    setIsNewItemDialogOpen(false);
    setNewItemType(null);
  }, [isReadOnlyView, currentProject, newItemName, newItemType, parentIdForNewItem, performSave, toast, activeFileSystemRoots]);

  const handleNodeSelectedInExplorer = useCallback(async (selectedNode: FileSystemNode | null) => {
    if (saveStatus === 'saving') {
        toast({ title: "Saving...", description: "Please wait for current changes to save.", duration: 1500});
        return;
    }    
    const newSelectedNodeId = selectedNode ? selectedNode.id : null;
    if (selectedFileNodeId === newSelectedNodeId) return; 
    setSelectedFileNodeId(newSelectedNodeId);
  }, [selectedFileNodeId, saveStatus, toast]);

  const handleDeleteNodeRequest = useCallback((nodeId: string) => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Cannot delete items.", variant: "default" });
      return;
    }
    setNodeToDeleteId(nodeId);
  }, [isReadOnlyView, toast]);

  const confirmDeleteNode = useCallback(async () => {
    if (isReadOnlyView || !nodeToDeleteId || !currentProject || saveStatus === 'saving') return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    const nodeBeingDeleted = findNodeByIdRecursive(activeFileSystemRoots, nodeToDeleteId);
    const newFileSystemRoots = deleteNodeFromTreeRecursive(activeFileSystemRoots, nodeToDeleteId);

    const savedProject = await performSave(null, newFileSystemRoots);
    if (savedProject) {
        setActiveFileSystemRoots(newFileSystemRoots); // Optional: for immediate UI feedback
        if (selectedFileNodeId === nodeToDeleteId) {
            setSelectedFileNodeId(null); 
        }
        toast({ title: "Item Deleted", description: `"${nodeBeingDeleted?.name || 'Item'}" deleted.` });
    }
    setNodeToDeleteId(null);
  }, [nodeToDeleteId, selectedFileNodeId, currentProject, performSave, toast, isReadOnlyView, saveStatus, activeFileSystemRoots]);

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

    if (targetFolderId && findNodeByIdRecursive([{...(findNodeByIdRecursive(activeFileSystemRoots, draggedNodeId) || {} as FileSystemNode)}], targetFolderId)) {
        toast({ title: "Invalid Move", description: "Cannot move a folder into one of its own subfolders.", variant: "destructive" });
        return;
    }

    const { removedNode, newTree: treeWithoutDraggedNode } = removeNodeFromTree(activeFileSystemRoots, draggedNodeId);
    if (!removedNode) {
      toast({ title: "Move Error", description: "Could not find item to move.", variant: "destructive" });
      return;
    }
    
    const newFileSystemRoots = addNodeToTargetInTree(treeWithoutDraggedNode, targetFolderId, removedNode);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const savedProject = await performSave(null, newFileSystemRoots);
    if (savedProject) {
        setActiveFileSystemRoots(newFileSystemRoots); // Optional: for immediate UI feedback
        toast({ title: "Item Moved", description: `"${removedNode.name}" moved.` });
    }
  }, [isReadOnlyView, currentProject, performSave, toast, activeFileSystemRoots]);

  useEffect(() => {
    if (!currentProject || !authUser || !mounted || isLoadingProject) return;
    const currentIsSharedParam = searchParams.get('shared') === 'true';
    let effectiveReadOnly = currentIsSharedParam;
    if (!currentIsSharedParam && currentProject.ownerId && authUser.uid !== currentProject.ownerId) {
      effectiveReadOnly = true;
    }
    if (effectiveReadOnly !== isReadOnlyView) {
      setIsReadOnlyView(effectiveReadOnly);
    }
    if (effectiveReadOnly && mounted && !isLoadingProject && !toastAlreadyShownRef.current && currentProject.ownerId) {
      toast({
        title: currentIsSharedParam ? "Read-Only Mode" : "Viewing Others' Project",
        description: currentIsSharedParam ? "You are viewing a shared project. Changes cannot be saved." : "This project is owned by another user. You are in read-only mode.",
        duration: 5000
      });
      toastAlreadyShownRef.current = true;
    }
  }, [searchParams, toast, mounted, isReadOnlyView, currentProject, authUser, isLoadingProject]);
  const toastAlreadyShownRef = useRef(false); 


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

  const hasFileSystemRoots = activeFileSystemRoots && activeFileSystemRoots.length > 0;
  const showContentPlaceholder = !selectedFileNodeId && hasFileSystemRoots;
  const showCreateFilePrompt = !selectedFileNodeId && !hasFileSystemRoots;

  const saveStatusIcon = () => {
    switch (saveStatus) {
      case 'saving': return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'synced': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'idle': return <Edit className="h-4 w-4 text-yellow-500" />; 
      default: return <div className="h-4 w-4" />;
    }
  };
  const saveStatusTooltip = () => {
    switch (saveStatus) {
      case 'saving': return "Saving changes...";
      case 'synced': return lastSyncTime ? `Changes synced at ${lastSyncTime}` : "All changes saved.";
      case 'error': return "Error saving. Check console or retry.";
      case 'idle': return "Unsaved changes.";
      default: return "Checking status...";
    }
  };

  return (
    <div className="flex h-screen flex-col fixed inset-0 pt-14">
       <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-14">
        <div className="container flex h-full items-center px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="mr-2" aria-label="Back to dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex items-center">
            {isEditingNameState ? (
              <Input
                value={editingProjectName}
                onChange={(e) => handleProjectNameChange(e.target.value)}
                onBlur={handleNameEditToggle}
                onKeyDown={(e) => e.key === 'Enter' && handleNameEditToggle()}
                className="h-9 text-lg font-semibold max-w-[150px] sm:max-w-xs"
                autoFocus
                readOnly={isReadOnlyView}
              />
            ) : (
              <h1 className="text-lg font-semibold truncate max-w-[150px] sm:max-w-xs cursor-pointer hover:underline" onClick={!isReadOnlyView ? handleNameEditToggle : undefined}>
                {editingProjectName}
              </h1>
            )}
            {!isReadOnlyView && (
                <Button variant="ghost" size="icon" onClick={handleNameEditToggle} className="ml-1 mr-2" aria-label={isEditingNameState ? "Confirm name change" : "Edit project name"}>
                {isEditingNameState ? <Check className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                </Button>
            )}
          </div>

        {!isReadOnlyView && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-2">
                <PlusCircle className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">New Item</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => {
                const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId) : null;
                let parentIdToUse: string | null = null;
                if (currentActiveNode) {
                    parentIdToUse = currentActiveNode.type === 'folder' ? currentActiveNode.id : findParentId(activeFileSystemRoots, currentActiveNode.id);
                } 
                handleOpenNewItemDialogRef.current('file', parentIdToUse);
              }}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                <span>New File</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                 const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId) : null;
                 let parentIdToUse: string | null = null;
                 if (currentActiveNode) {
                     parentIdToUse = currentActiveNode.type === 'folder' ? currentActiveNode.id : findParentId(activeFileSystemRoots, currentActiveNode.id);
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
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="p-2 rounded-md hover:bg-accent flex items-center justify-center cursor-default">
                           {saveStatusIcon()}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        <p>{saveStatusTooltip()}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

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
              <Button variant={viewMode === 'editor' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('editor')} aria-label="Editor View" disabled={showContentPlaceholder || (showCreateFilePrompt && isReadOnlyView)}>
                <Edit3 className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Editor</span>
              </Button>
              <Button variant={viewMode === 'both' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('both')} aria-label="Split View" disabled={showContentPlaceholder || (showCreateFilePrompt && isReadOnlyView)}>
                 <Rows className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Both</span>
              </Button>
              <Button variant={viewMode === 'whiteboard' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('whiteboard')} aria-label="Whiteboard View" disabled={showContentPlaceholder || (showCreateFilePrompt && isReadOnlyView)}>
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
                    nodes={activeFileSystemRoots}
                    onNodeSelect={handleNodeSelectedInExplorer}
                    onDeleteNode={handleDeleteNodeRequest}
                    onAddFileToFolder={onAddFileToFolderCallback}
                    onAddFolderToFolder={onAddFolderToFolderCallback}
                    selectedNodeId={selectedFileNodeId}
                    onMoveNode={handleMoveNode}
                    isReadOnly={isReadOnlyView}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel defaultSize={isExplorerVisible ? 80 : 100} className="flex flex-col">
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

            {(!selectedFileNodeId && !showCreateFilePrompt && !showContentPlaceholder) || selectedFileNodeId ? (
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
              {parentIdForNewItem && activeFileSystemRoots.length > 0 && findNodeByIdRecursive(activeFileSystemRoots, parentIdForNewItem) ? 
                ` It will be created in "${findNodeByIdRecursive(activeFileSystemRoots, parentIdForNewItem)?.name}".` :
                 selectedFileNodeId && activeFileSystemRoots.length > 0 && findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.type === 'folder' ?
                 ` It will be created in "${findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.name}".` :
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
              {currentProject && activeFileSystemRoots && nodeToDeleteId && findNodeByIdRecursive(activeFileSystemRoots, nodeToDeleteId)?.type === 'folder' && ' and all its contents'}.
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
    
