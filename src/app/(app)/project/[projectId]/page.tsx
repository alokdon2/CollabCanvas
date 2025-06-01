
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
  subscribeToProjectUpdates as realtimeSubscribeToProjectUpdates,
  deleteProjectFromFirestore,
  ensureNodeContentDefaults,
  processDataObjectWhiteboardContent,
  sanitizeDataForFirestore,
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

// Local helper functions for manipulating FileSystemNode[] immutably
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
  if (targetFolderId === null) { // Add to root
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
            if (foundInChild !== undefined) return foundInChild; // Allow returning null if found at root's child
        }
    }
    return undefined; // Or null if you prefer consistent null return for "not found" or "is root itself"
};


function ProjectPageContent() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();
  const { setCurrentProjectName: setGlobalProjectName } = useProjectContext(); // Renamed for clarity
  const { user: authUser } = useAuth();

  const searchParams = useSearchParams();
  const initialIsShared = searchParams.get('shared') === 'true';

  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isReadOnlyView, setIsReadOnlyView] = useState(initialIsShared);

  const [editingProjectName, setEditingProjectName] = useState("");
  const [activeFileSystemRoots, setActiveFileSystemRoots] = useState<FileSystemNode[]>([]);
  const [projectRootTextContent, setProjectRootTextContent] = useState(DEFAULT_EMPTY_TEXT_CONTENT);
  const [projectRootWhiteboardData, setProjectRootWhiteboardData] = useState<WhiteboardData>({...DEFAULT_EMPTY_WHITEBOARD_DATA});

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

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedToServerTimestampRef = useRef<string | null>(null);

  const { registerTriggerNewFile, registerTriggerNewFolder } = useProjectContext();


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

  // Effect to derive specific content states from currentProject
  useEffect(() => {
    if (currentProject) {
        setActiveFileSystemRoots(ensureNodeContentDefaults(currentProject.fileSystemRoots || []));
        setProjectRootTextContent(currentProject.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
        setProjectRootWhiteboardData(processDataObjectWhiteboardContent({ whiteboardContent: currentProject.whiteboardContent } as any, 'load').whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA });
        setEditingProjectName(currentProject.name);
        setGlobalProjectName(currentProject.name);
    }
  }, [currentProject, setGlobalProjectName]);
  

  // Effect for initial data load from Firestore
  useEffect(() => {
    setMounted(true);
    if (!projectId || !mounted) return;
    
    let isSubscribed = true; // To prevent state updates after unmount

    async function fetchAndInitializeProject() {
      console.log("[ProjectPage] Starting fetchAndInitializeProject for", projectId);
      if (!isLoadingProject) setIsLoadingProject(true); // Ensure loading state is true

      try {
        const projectDataFromDB = await realtimeLoadProjectData(projectId);
        if (!isSubscribed) return;

        if (projectDataFromDB) {
          console.log(`[ProjectPage] Project ${projectId} data loaded from DB.`);
          const processedData = processDataObjectWhiteboardContent(projectDataFromDB, 'load') as Project;
          
          setCurrentProject(processedData);
          // Derived states will be updated by the useEffect depending on currentProject
          
          setSaveStatus('synced');
          setLastSyncTime(new Date(processedData.updatedAt).toLocaleTimeString());
          lastSavedToServerTimestampRef.current = processedData.updatedAt;
          setSelectedFileNodeId(null); // Start with no file selected

        } else {
          console.log(`[ProjectPage] Project ${projectId} not found in DB.`);
          toast({ title: "Error", description: "Project not found.", variant: "destructive" });
          router.replace("/");
        }
      } catch (error) {
        if (!isSubscribed) return;
        console.error(`[ProjectPage] Failed to fetch project ${projectId}:`, error);
        toast({ title: "Error Loading Project", description: `Could not load project data: ${(error as Error).message}`, variant: "destructive" });
        router.replace("/");
      } finally {
        if (isSubscribed) {
            console.log(`[ProjectPage] fetchAndInitializeProject finally block for ${projectId}. Setting isLoadingProject to false.`);
            setIsLoadingProject(false);
        }
      }
    }

    fetchAndInitializeProject();
    
    return () => {
        isSubscribed = false;
        setGlobalProjectName(null);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    }
  }, [projectId, mounted, router, toast, setGlobalProjectName]); // isLoadingProject removed

  // Effect for Firestore real-time subscription
  useEffect(() => {
    if (!projectId || !mounted || isLoadingProject) return; // Wait for initial load to finish

    let unsubscribeRealtime: (() => void) | null = null;
    let isStillMounted = true;

    async function setupSubscription() {
        console.log(`[ProjectPage Realtime] Setting up subscription for project ${projectId}`);
        try {
             unsubscribeRealtime = await realtimeSubscribeToProjectUpdates(projectId, (updatedProjectFromFirestore) => {
                if (!isStillMounted) return;
                console.log(`[ProjectPage Realtime] Subscription update for project ${projectId}:`, updatedProjectFromFirestore.name);

                if (lastSavedToServerTimestampRef.current && updatedProjectFromFirestore.updatedAt < lastSavedToServerTimestampRef.current && updatedProjectFromFirestore.id === projectId) {
                    console.log("[ProjectPage Realtime] Incoming Firestore update is older or same as last server save initiated by this client, skipping.", updatedProjectFromFirestore.updatedAt, "vs", lastSavedToServerTimestampRef.current);
                    return; 
                }
                
                const processedUpdate = processDataObjectWhiteboardContent(updatedProjectFromFirestore, 'load') as Project;
                setCurrentProject(processedUpdate);
                // Derived states (activeFileSystemRoots, etc.) will update via their own useEffect
                setSaveStatus('synced');
                setLastSyncTime(new Date(processedUpdate.updatedAt).toLocaleTimeString());
                lastSavedToServerTimestampRef.current = processedUpdate.updatedAt; // Update ref with confirmed DB timestamp

                toast({ title: "Project Updated", description: "Changes received from collaborators.", duration: 2000 });
            });
        } catch (error) {
            console.error(`[ProjectPage Realtime] Failed to subscribe to project ${projectId}:`, error);
            if(isStillMounted) {
                 toast({ title: "Realtime Error", description: "Could not connect to real-time updates.", variant: "destructive"});
            }
        }
    }
    
    setupSubscription();

    return () => {
      isStillMounted = false;
      if (unsubscribeRealtime) {
        console.log("[ProjectPage Realtime] Unsubscribing from Firestore updates for project:", projectId);
        unsubscribeRealtime();
      }
    };
  }, [projectId, mounted, isLoadingProject, toast]); // Depends on initial load completion

  // Effect for registering context menu triggers
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


  // Effect for loading content into active editor/whiteboard based on selection
  useEffect(() => {
    // This effect now depends on the derived states, which depend on currentProject
    if (selectedFileNodeId) {
      const node = findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId);
      if (node) {
        setActiveTextContent(node.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
        const processedWBNode = processDataObjectWhiteboardContent(node, 'load') as FileSystemNode;
        activeWhiteboardDataRef.current = processedWBNode.whiteboardContent || {...DEFAULT_EMPTY_WHITEBOARD_DATA};
      } else {
        setSelectedFileNodeId(null); // Node not found, reset selection
        setActiveTextContent(projectRootTextContent);
        activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
      }
    } else { 
      setActiveTextContent(projectRootTextContent);
      activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
    }
  }, [selectedFileNodeId, activeFileSystemRoots, projectRootTextContent, projectRootWhiteboardData]);


  const constructProjectDataToSave = useCallback((): Project | null => {
    if (!currentProject) {
        console.error("constructProjectDataToSave called without currentProject!");
        return null;
    }

    let projectSnapshot = JSON.parse(JSON.stringify(currentProject)) as Project; // Deep clone

    if (selectedFileNodeId) {
        const nodeToUpdateInSnapshot = findNodeByIdRecursive(projectSnapshot.fileSystemRoots, selectedFileNodeId);
        if (nodeToUpdateInSnapshot) {
            const updatedNode = {
                ...nodeToUpdateInSnapshot,
                textContent: activeTextContent,
                whiteboardContent: activeWhiteboardDataRef.current,
            };
            projectSnapshot.fileSystemRoots = replaceNodeInTree(projectSnapshot.fileSystemRoots, selectedFileNodeId, updatedNode);
        }
    } else {
        projectSnapshot.textContent = activeTextContent;
        projectSnapshot.whiteboardContent = activeWhiteboardDataRef.current;
    }
    projectSnapshot.name = editingProjectName || projectSnapshot.name;
    return projectSnapshot;
  }, [currentProject, selectedFileNodeId, activeTextContent, editingProjectName]);


  const performSave = useCallback(async (projectToSave: Project): Promise<boolean> => {
    if (isReadOnlyView) {
      console.log("[ProjectPage] In read-only view, save skipped.");
      return false;
    }
    
    setSaveStatus('saving');
    const timestampForThisSave = new Date().toISOString();
    lastSavedToServerTimestampRef.current = timestampForThisSave; 

    const finalProjectDataForFirestore: Project = {
        ...projectToSave,
        ownerId: projectToSave.ownerId || authUser?.uid || 'unknown_owner',
        updatedAt: timestampForThisSave, // Use the generated timestamp
    };

    let processedForFirestore = processDataObjectWhiteboardContent(finalProjectDataForFirestore, 'save') as Project;
    const sanitizedData = sanitizeDataForFirestore(processedForFirestore);

    try {
      await realtimeSaveProjectData(sanitizedData as Project);
      // DO NOT set saveStatus('synced') here. Let Firestore listener handle it.
      // DO NOT setCurrentProject here. Let Firestore listener handle it.
      console.log("[ProjectPage performSave] Save initiated to Firestore for project:", projectToSave.id, "at", timestampForThisSave);
      return true; 
    } catch (error) {
      console.error("[ProjectPage performSave] Failed to save project to Firestore:", error);
      toast({ title: "Save Error", description: `Could not save project: ${(error as Error).message}`, variant: "destructive" });
      setSaveStatus('error');
      return false;
    }
  }, [isReadOnlyView, authUser, toast]);


  // Auto-save logic
  useEffect(() => {
    if (isReadOnlyView || !mounted || isLoadingProject || !currentProject || (saveStatus !== 'idle' && saveStatus !== 'error')) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      return;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    console.log(`[Auto-Save Effect] Status: ${saveStatus}. Scheduling save.`);
    saveTimeoutRef.current = setTimeout(async () => {
      if (isReadOnlyView || !currentProject || (saveStatus !== 'idle' && saveStatus !== 'error')) {
        console.log("[Auto-Save Timeout] Skipped due to state.", saveStatus);
        return;
      }

      const projectBeingSaved = constructProjectDataToSave();
      if (!projectBeingSaved) {
        console.warn("[Auto-Save Timeout] Could not construct project data to save.");
        return;
      }

      console.log("[Auto-Save Timeout] Performing save...");
      const saveInitiated = await performSave(projectBeingSaved);

      if (saveInitiated) {
        console.log("[Auto-Save Timeout] Save initiated. Waiting for Firestore echo.");
      } else {
        console.log("[Auto-Save Timeout] performSave returned false. Save status is:", saveStatus);
      }
      saveTimeoutRef.current = null;
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    saveStatus, 
    isReadOnlyView, mounted, isLoadingProject, currentProject,
    performSave, 
    constructProjectDataToSave,
  ]);


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


  const handleNameEditToggle = useCallback(async () => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Project name cannot be changed.", variant: "default" });
      return;
    }
    if (isEditingNameState && currentProject) {
      const newName = editingProjectName.trim();
      if (newName && newName !== currentProject.name) {
        const projectSnapshot = constructProjectDataToSave();
        if (!projectSnapshot) return;
        projectSnapshot.name = newName;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        const saveInitiated = await performSave(projectSnapshot);
        if (saveInitiated) {
            toast({title: "Project Renamed", description: `Project name update sent. Syncing...`});
            // State (name, updatedAt, saveStatus) will be updated by Firestore listener
        } else {
            // performSave would have set status to 'error' and shown a toast
            setEditingProjectName(currentProject.name); // Revert optimistic UI
        }
      } else if (newName === "" || newName === currentProject.name) {
        setEditingProjectName(currentProject.name); 
      }
    }
    setIsEditingNameState(!isEditingNameState);
  }, [isReadOnlyView, isEditingNameState, currentProject, editingProjectName, constructProjectDataToSave, performSave, toast]);


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


  const handleCreateNewItem = useCallback(async () => {
    if (isReadOnlyView || !currentProject) return;
    if (!newItemName.trim() || !newItemType ) {
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

    let projectSnapshot = constructProjectDataToSave();
    if (!projectSnapshot) return;
    projectSnapshot.fileSystemRoots = addNodeToTreeRecursive(projectSnapshot.fileSystemRoots, parentIdForNewItem, newNode);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const saveInitiated = await performSave(projectSnapshot);
    if (saveInitiated) {
        setSelectedFileNodeId(newNode.id); 
        toast({ title: `${newItemType === 'file' ? 'File' : 'Folder'} Created`, description: `"${newNode.name}" creation sent. Syncing...`});
        // State update via Firestore listener
    }
    setIsNewItemDialogOpen(false);
    setNewItemType(null);
  }, [isReadOnlyView, currentProject, newItemName, newItemType, parentIdForNewItem, constructProjectDataToSave, performSave, toast]);


  const handleNodeSelectedInExplorer = useCallback(async (selectedNode: FileSystemNode | null) => {
    if (saveStatus === 'saving') {
        toast({ title: "Saving...", description: "Please wait for current changes to save.", duration: 1500});
        return;
    }

    const previousSelectedNodeId = selectedFileNodeId;
    const newSelectedNodeId = selectedNode ? selectedNode.id : null;

    if (previousSelectedNodeId === newSelectedNodeId) return;

    if (!isReadOnlyView && currentProject) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        const projectDataToSave = constructProjectDataToSave();
        if (projectDataToSave) {
            const saveInitiated = await performSave(projectDataToSave);
            if (saveInitiated) {
                 console.log("[NodeSelect] Save initiated before switching node. Waiting for Firestore echo.");
            } else if (!isReadOnlyView) {
                console.warn("[NodeSelect] Save failed before switching node.");
                // performSave would have set status to 'error' and shown a toast.
                // Consider if we should prevent node switch here or allow it with a warning.
                // For now, we allow it, relying on user to retry or Firestore to eventually sync.
            }
        }
    }
    setSelectedFileNodeId(newSelectedNodeId);

  }, [isReadOnlyView, currentProject, selectedFileNodeId, constructProjectDataToSave, performSave, toast, saveStatus]);


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

    const nodeBeingDeleted = findNodeByIdRecursive(currentProject.fileSystemRoots, nodeToDeleteId);
    let projectSnapshot = constructProjectDataToSave();
    if (!projectSnapshot) return;
    projectSnapshot.fileSystemRoots = deleteNodeFromTreeRecursive(projectSnapshot.fileSystemRoots, nodeToDeleteId);

    const saveInitiated = await performSave(projectSnapshot);
    if (saveInitiated) {
        if (selectedFileNodeId === nodeToDeleteId) {
            setSelectedFileNodeId(null);
        }
        toast({ title: "Item Deletion Sent", description: `"${nodeBeingDeleted?.name || 'Item'}" deletion sent. Syncing...` });
    }
    setNodeToDeleteId(null);
  }, [nodeToDeleteId, selectedFileNodeId, currentProject, constructProjectDataToSave, performSave, toast, isReadOnlyView, saveStatus]);


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

    let projectSnapshot = constructProjectDataToSave();
    if (!projectSnapshot) return;
    const { removedNode, newTree: treeWithoutDraggedNode } = removeNodeFromTree(projectSnapshot.fileSystemRoots, draggedNodeId);

    if (!removedNode) {
      toast({ title: "Move Error", description: "Could not find item to move.", variant: "destructive" });
      return;
    }

    if (targetFolderId && removedNode.type === 'folder') {
      const findPathToRoot = (nodes: FileSystemNode[], id: string, path: string[] = []): string[] | null => {
          for (const n of nodes) {
              if (n.id === id) return [...path, n.id];
              if (n.children) {
                  const found = findPathToRoot(n.children, id, [...path, n.id]);
                  if (found) return found;
              }
          }
          return null;
      }
      const pathToTarget = findPathToRoot(projectSnapshot.fileSystemRoots, targetFolderId);
      if (pathToTarget?.includes(draggedNodeId)) {
           toast({ title: "Invalid Move", description: "Cannot move a folder into one of its own subfolders.", variant: "destructive" });
          return;
      }
    }

    projectSnapshot.fileSystemRoots = addNodeToTargetInTree(treeWithoutDraggedNode, targetFolderId, removedNode);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const saveInitiated = await performSave(projectSnapshot);
    if (saveInitiated) {
        toast({ title: "Item Move Sent", description: `"${removedNode.name}" move sent. Syncing...` });
    }
  }, [isReadOnlyView, currentProject, constructProjectDataToSave, performSave, toast]);


  useEffect(() => {
    if (!currentProject || !authUser || !mounted || isLoadingProject) return;
    const currentIsShared = searchParams.get('shared') === 'true';
    let effectiveReadOnly = currentIsShared;
    if (!currentIsShared && currentProject.ownerId && authUser.uid !== currentProject.ownerId) {
      effectiveReadOnly = true;
    }
    if (effectiveReadOnly !== isReadOnlyView) setIsReadOnlyView(effectiveReadOnly);

    if (effectiveReadOnly && mounted && !isLoadingProject) {
      toast({
        title: currentIsShared ? "Read-Only Mode" : "Viewing Others' Project",
        description: currentIsShared ? "You are viewing a shared project. Changes cannot be saved." : "This project is owned by another user. You are in read-only mode.",
      });
    }
  }, [searchParams, toast, mounted, isReadOnlyView, currentProject, authUser, isLoadingProject]);


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

  const editorKey = `editor-${selectedFileNodeId || 'project-root'}-${currentProject.updatedAt}`;
  const whiteboardKey = `whiteboard-${selectedFileNodeId || 'project-root'}-${currentProject.updatedAt}`;
  const showContentPlaceholder = !selectedFileNodeId && activeFileSystemRoots.length > 0;
  const showCreateFilePrompt = !selectedFileNodeId && activeFileSystemRoots.length === 0;

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
      case 'error': return "Error saving. Check console.";
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
                onChange={(e) => {
                    setEditingProjectName(e.target.value);
                    if (!isReadOnlyView && saveStatus !== 'saving') setSaveStatus('idle');
                }}
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
                <Button variant="ghost" size="icon" onClick={handleNameEditToggle} className="ml-1 mr-2" aria-label="Edit project name">
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
                        <div className="p-2 rounded-md hover:bg-accent flex items-center justify-center">
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
              aria-label="Toggle file explorer"
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

            {(!selectedFileNodeId && !showCreateFilePrompt && !showContentPlaceholder) && ( // Root content shown
                viewMode === "editor" ? (
                  <div className="h-full p-1 sm:p-2 md:p-3">
                    <RichTextEditor key={`${editorKey}-root`} value={activeTextContent} onChange={handleTextChange} isReadOnly={isReadOnlyView} />
                  </div>
                ) : viewMode === "whiteboard" ? (
                  <div className="h-full p-1 sm:p-2 md:p-3">
                    <Whiteboard key={`${whiteboardKey}-root`} initialData={activeWhiteboardDataRef.current} onChange={handleWhiteboardChange} isReadOnly={isReadOnlyView} />
                  </div>
                ) : viewMode === "both" ? (
                  <ResizablePanelGroup direction="horizontal" className="h-full w-full">
                    <ResizablePanel defaultSize={50} minSize={20}><div className="h-full p-1 sm:p-2 md:p-3"><RichTextEditor key={`${editorKey}-root-both`} value={activeTextContent} onChange={handleTextChange} isReadOnly={isReadOnlyView}/></div></ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={50} minSize={20}><div className="h-full p-1 sm:p-2 md:p-3"><Whiteboard key={`${whiteboardKey}-root-both`} initialData={activeWhiteboardDataRef.current} onChange={handleWhiteboardChange} isReadOnly={isReadOnlyView}/></div></ResizablePanel>
                  </ResizablePanelGroup>
                ) : null
            )}


            {selectedFileNodeId && viewMode === "editor" && (
              <div className="h-full p-1 sm:p-2 md:p-3">
                <RichTextEditor key={editorKey} value={activeTextContent} onChange={handleTextChange} isReadOnly={isReadOnlyView} />
              </div>
            )}
            {selectedFileNodeId && viewMode === "whiteboard" && (
              <div className="h-full p-1 sm:p-2 md:p-3">
                <Whiteboard key={whiteboardKey} initialData={activeWhiteboardDataRef.current} onChange={handleWhiteboardChange} isReadOnly={isReadOnlyView} />
              </div>
            )}
            {selectedFileNodeId && viewMode === "both" && (
              <ResizablePanelGroup direction="horizontal" className="h-full w-full">
                <ResizablePanel defaultSize={50} minSize={20}><div className="h-full p-1 sm:p-2 md:p-3"><RichTextEditor key={`${editorKey}-both`} value={activeTextContent} onChange={handleTextChange} isReadOnly={isReadOnlyView} /></div></ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={20}><div className="h-full p-1 sm:p-2 md:p-3"><Whiteboard key={`${whiteboardKey}-both`} initialData={activeWhiteboardDataRef.current} onChange={handleWhiteboardChange} isReadOnly={isReadOnlyView} /></div></ResizablePanel>
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
              {parentIdForNewItem ?
                ` It will be created in "${findNodeByIdRecursive(activeFileSystemRoots, parentIdForNewItem)?.name || 'selected folder'}".` :
                 selectedFileNodeId && findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.type === 'folder' ?
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
              {currentProject && activeFileSystemRoots && findNodeByIdRecursive(activeFileSystemRoots, nodeToDeleteId || '')?.type === 'folder' && ' and all its contents'}.
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
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading Project...</p></div>}>
      <ProjectPageContent />
    </Suspense>
  )
}

    
