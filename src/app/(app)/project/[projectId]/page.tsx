
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
  ensureNodeContentDefaults, // Keep helper for ensuring defaults
  processDataObjectWhiteboardContent, // Keep helper for whiteboard data
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


function ProjectPageContent() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();
  const { currentProjectName: currentProjectNameFromContext, setCurrentProjectName, registerTriggerNewFile, registerTriggerNewFolder } = useProjectContext();
  const { user: authUser } = useAuth(); 

  const searchParams = useSearchParams();
  const initialIsShared = searchParams.get('shared') === 'true';
  
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isReadOnlyView, setIsReadOnlyView] = useState(initialIsShared);

  const [projectRootTextContent, setProjectRootTextContent] = useState(DEFAULT_EMPTY_TEXT_CONTENT);
  const [projectRootWhiteboardData, setProjectRootWhiteboardData] = useState<WhiteboardData>({...DEFAULT_EMPTY_WHITEBOARD_DATA});

  const [activeTextContent, setActiveTextContent] = useState(DEFAULT_EMPTY_TEXT_CONTENT);
  const activeWhiteboardDataRef = useRef<WhiteboardData>({...DEFAULT_EMPTY_WHITEBOARD_DATA}); // Ref for whiteboard data to avoid frequent re-renders in auto-save

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

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedToServerTimestampRef = useRef<string | null>(null); // Track Firestore's updatedAt
  
  const handleOpenNewItemDialogRef = useRef(useCallback((type: 'file' | 'folder', parentNodeId: string | null) => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Cannot create new items in read-only view.", variant: "default" });
      return;
    }
    setNewItemType(type);
    setParentIdForNewItem(parentNodeId);
    setNewItemName("");
    setNewItemError("");
    setIsNewItemDialogOpen(true);
  }, [isReadOnlyView, toast])); // Dependencies for the callback itself

  useEffect(() => {
    handleOpenNewItemDialogRef.current = (type: 'file' | 'folder', parentNodeId: string | null) => {
        if (isReadOnlyView) {
          toast({ title: "Read-Only Mode", description: "Cannot create new items in read-only view.", variant: "default" });
          return;
        }
        setNewItemType(type);
        setParentIdForNewItem(parentNodeId);
        setNewItemName("");
        setNewItemError("");
        setIsNewItemDialogOpen(true);
      };
  }, [isReadOnlyView, toast]); // Update ref when dependencies change


  const updateLocalStateFromProject = useCallback((projectData: Project | null, source: "initialLoad" | "firestoreUpdate" | "localSave" = "initialLoad") => {
    if (!projectData) {
        setCurrentProject(null); // Clear project if null
        return;
    }
    // Apply client-side defaults to the incoming project data
    const ensuredProjectData = {
        ...projectData,
        textContent: projectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
        whiteboardContent: projectData.whiteboardContent ? 
          processDataObjectWhiteboardContent(projectData, 'load').whiteboardContent : 
          {...DEFAULT_EMPTY_WHITEBOARD_DATA},
        fileSystemRoots: ensureNodeContentDefaults(
            (processDataObjectWhiteboardContent(projectData, 'load') as Project).fileSystemRoots || []
        )
    };

    setCurrentProject(ensuredProjectData);
    setEditingProjectName(ensuredProjectData.name);
    setCurrentProjectName(ensuredProjectData.name); // Update context for Navbar

    // Derive these states directly from the new currentProject
    setActiveFileSystemRoots(ensuredProjectData.fileSystemRoots);
    setProjectRootTextContent(ensuredProjectData.textContent);
    setProjectRootWhiteboardData(ensuredProjectData.whiteboardContent || {...DEFAULT_EMPTY_WHITEBOARD_DATA});

    if (source === "initialLoad") {
        setSelectedFileNodeId(null); // On initial load, no file is selected.
    }
    
    if (source === "firestoreUpdate" || source === "localSave") {
        setSaveStatus('synced');
        setLastSyncTime(new Date(ensuredProjectData.updatedAt).toLocaleTimeString());
        lastSavedToServerTimestampRef.current = ensuredProjectData.updatedAt;
    }
    if (source === "firestoreUpdate"){
        toast({ title: "Project Updated", description: "Changes received from collaborators.", duration: 2000 });
    }
  }, [setCurrentProjectName, toast]);


  const performSave = useCallback(async (projectToSave: Project): Promise<Project | null> => {
    if (isReadOnlyView) {
      console.log("[ProjectPage] In read-only view, save skipped.");
      setSaveStatus('idle'); // Or perhaps 'synced' if it was already synced
      return null;
    }
    if (!projectToSave) return null;

    setSaveStatus('saving');
    const timestampForThisSave = new Date().toISOString();
    const finalProjectDataForFirestore: Project = {
        ...projectToSave,
        ownerId: projectToSave.ownerId || authUser?.uid, // Ensure ownerId
        updatedAt: timestampForThisSave,
    };

    try {
      await realtimeSaveProjectData(finalProjectDataForFirestore); // This handles its own processDataObjectWhiteboardContent('save')
      
      // After successful save, update local timestamp and status
      lastSavedToServerTimestampRef.current = timestampForThisSave;
      setSaveStatus('synced');
      setLastSyncTime(new Date(timestampForThisSave).toLocaleTimeString());
      
      if (finalProjectDataForFirestore.name !== currentProjectNameFromContext) {
        setCurrentProjectName(finalProjectDataForFirestore.name);
      }
      // Return the project state as it was intended to be saved, but client-ready for whiteboard
      return processDataObjectWhiteboardContent(finalProjectDataForFirestore, 'load') as Project;
    } catch (error) {
      console.error("[ProjectPage] Failed to save project to Firestore:", error);
      toast({ title: "Save Error", description: `Could not save project: ${(error as Error).message}`, variant: "destructive" });
      setSaveStatus('error');
      return null;
    }
  }, [isReadOnlyView, authUser, currentProjectNameFromContext, setCurrentProjectName, toast]);


  useEffect(() => {
    setMounted(true);
    let unsubscribeRealtime: (() => void) | null = null;

    async function fetchAndInitializeProject() {
      if (!projectId || !mounted) return;
      setIsLoadingProject(true);
      try {
        const projectDataFromDB = await realtimeLoadProjectData(projectId);
        if (projectDataFromDB) {
          updateLocalStateFromProject(projectDataFromDB, "initialLoad");
          lastSavedToServerTimestampRef.current = projectDataFromDB.updatedAt;

          unsubscribeRealtime = await realtimeSubscribeToProjectUpdates(projectId, (updatedProject) => {
            console.log("[ProjectPage Realtime] Received project update from subscription:", updatedProject.name, updatedProject.updatedAt);
            if (saveStatus === 'saving') {
                console.log("[ProjectPage Realtime] Save in progress, skipping update from subscription for now.");
                return;
            }
            // Check if the incoming update is newer than the last one saved by *this client*
            // This helps prevent overwriting local changes that are about to be saved.
            if (lastSavedToServerTimestampRef.current && new Date(updatedProject.updatedAt) <= new Date(lastSavedToServerTimestampRef.current)) {
                 console.log("[ProjectPage Realtime] Incoming update is older or same as last server save by this client, skipping.", updatedProject.updatedAt, "vs", lastSavedToServerTimestampRef.current);
                 return;
            }
            updateLocalStateFromProject(updatedProject, "firestoreUpdate");
          });

        } else {
          toast({ title: "Error", description: "Project not found.", variant: "destructive" });
          router.replace("/");
        }
      } catch (error) {
        console.error("[ProjectPage] Failed to fetch project:", error);
        toast({ title: "Error Loading Project", description: `Could not load project data: ${(error as Error).message}`, variant: "destructive" });
        router.replace("/");
      } finally {
        setIsLoadingProject(false);
      }
    }

    fetchAndInitializeProject();
    
    if (typeof registerTriggerNewFile === 'function') {
        registerTriggerNewFile(() => {
            const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId) : null;
            const parentId = currentActiveNode?.type === 'folder' ? currentActiveNode.id : null;
            handleOpenNewItemDialogRef.current('file', parentId);
        });
    }
    if (typeof registerTriggerNewFolder === 'function') {
        registerTriggerNewFolder(() => {
            const currentActiveNode = selectedFileNodeId ? findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId) : null;
            const parentId = currentActiveNode?.type === 'folder' ? currentActiveNode.id : null;
            handleOpenNewItemDialogRef.current('folder', parentId);
        });
    }

    return () => {
      setCurrentProjectName(null);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (unsubscribeRealtime) {
        console.log("[ProjectPage] Unsubscribing from Firestore updates for project:", projectId);
        unsubscribeRealtime();
      }
    };
  // Minimal, stable dependencies for initial load and subscription setup
  }, [projectId, router, mounted, toast, setCurrentProjectName, updateLocalStateFromProject, registerTriggerNewFile, registerTriggerNewFolder]);


  // Effect to load active content based on selectedFileNodeId or project root, using derived states
  useEffect(() => {
    if (!currentProject || isLoadingProject) return;

    if (saveStatus === 'saving' && !isReadOnlyView) {
      console.log("[ProjectPage Content Sync] Save in progress, deferring content sync.");
      return;
    }

    if (selectedFileNodeId) {
      const node = findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId);
      if (node) {
        setActiveTextContent(node.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
        activeWhiteboardDataRef.current = node.whiteboardContent ? 
          {...processDataObjectWhiteboardContent(node, 'load').whiteboardContent } : 
          {...DEFAULT_EMPTY_WHITEBOARD_DATA};
      } else {
        // Selected node not found (e.g., deleted), revert to project root or clear selection
        setSelectedFileNodeId(null); 
        setActiveTextContent(projectRootTextContent);
        activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
      }
    } else { // No file selected, show project root content
      setActiveTextContent(projectRootTextContent);
      activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
    }
  }, [selectedFileNodeId, currentProject, activeFileSystemRoots, projectRootTextContent, projectRootWhiteboardData, isLoadingProject, saveStatus, isReadOnlyView]);


  // Debounced auto-save effect
  useEffect(() => {
    if (isReadOnlyView || !mounted || isLoadingProject || !currentProject || saveStatus === 'saving') return;

    // If any of the content-related states change, mark status as 'idle' (unsaved changes)
    // This relies on the fact that this effect runs AFTER the change due to dependency array.
    if (saveStatus === 'synced' || saveStatus === 'error') {
        setSaveStatus('idle');
    }

    const constructProjectDataToSave = (): Project => {
      // Start with a deep copy of the current project from state
      let projectSnapshot = JSON.parse(JSON.stringify(currentProject)) as Project;
      
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
          // Root content remains as it is in the currentProject snapshot
      } else { // No node selected, update project root content in the snapshot
          projectSnapshot.textContent = activeTextContent;
          projectSnapshot.whiteboardContent = activeWhiteboardDataRef.current;
      }
      projectSnapshot.name = editingProjectName || projectSnapshot.name; // Update name if it was being edited
      return projectSnapshot;
    };
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
        if (isReadOnlyView || saveStatus === 'saving') {
          console.log("[Auto-Save] Skipped due to read-only or existing save.", saveStatus);
          return;
        }
        const projectBeingSaved = constructProjectDataToSave();
        const savedProject = await performSave(projectBeingSaved);
        if (savedProject) {
            // updateLocalStateFromProject(savedProject, 'localSave'); // Update local state with acknowledged save
            toast({ title: "Auto-Saved", description: "Changes automatically saved.", duration: 2000});
        }
        saveTimeoutRef.current = null; 
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  // Dependencies: Key content pieces and operational states.
  // currentProject is included so that if it changes (e.g. via snapshot), and content is edited before auto-save, the save uses the latest structure.
  }, [
    activeTextContent, activeWhiteboardDataRef.current, // Note: ref.current direct usage in deps is tricky, this triggers on activeWhiteboardData change instead
    projectRootTextContent, projectRootWhiteboardData, activeFileSystemRoots, editingProjectName,
    mounted, isLoadingProject, currentProject, saveStatus,
    performSave, toast, isReadOnlyView, selectedFileNodeId
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
    // Trigger auto-save effect manually if needed or rely on its own activeWhiteboardData dep if it's a state
    // For ref, we might need to manually nudge the effect if other deps don't change:
    // This is a bit of a hack; ideally, activeWhiteboardData would be state to trigger effect.
    // For now, we rely on the auto-save effect's other dependencies or a slight structural change.
  }, [isReadOnlyView, saveStatus]);


  const handleNameEditToggle = useCallback(async () => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Project name cannot be changed.", variant: "default" });
      return;
    }
    if (isEditingName && currentProject) {
      const newName = editingProjectName.trim();
      if (newName && newName !== currentProject.name) {
        let projectSnapshot = JSON.parse(JSON.stringify(currentProject)) as Project;
        projectSnapshot.name = newName;

        if (selectedFileNodeId) { // if a file is selected, update its content in the structure before saving name
            const nodeToUpdate = findNodeByIdRecursive(projectSnapshot.fileSystemRoots, selectedFileNodeId);
            if (nodeToUpdate) {
                nodeToUpdate.textContent = activeTextContent;
                nodeToUpdate.whiteboardContent = activeWhiteboardDataRef.current;
            }
        } else { // Project root content was active
            projectSnapshot.textContent = activeTextContent;
            projectSnapshot.whiteboardContent = activeWhiteboardDataRef.current;
        }
        
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        const savedProject = await performSave(projectSnapshot); 
        if (savedProject) {
            updateLocalStateFromProject(savedProject, 'localSave');
            toast({title: "Project Renamed", description: `Project name updated to "${newName}".`});
        } else {
            setEditingProjectName(currentProject.name); // Revert on failed save
        }
      } else {
        setEditingProjectName(currentProject.name); 
      }
    }
    setIsEditingName(!isEditingName);
  }, [isReadOnlyView, isEditingName, currentProject, editingProjectName, activeTextContent, activeWhiteboardDataRef, selectedFileNodeId, performSave, updateLocalStateFromProject, toast]);


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

    let projectSnapshot = JSON.parse(JSON.stringify(currentProject)) as Project;
    projectSnapshot.fileSystemRoots = addNodeToTreeRecursive(projectSnapshot.fileSystemRoots, parentIdForNewItem, newNode);
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const savedProject = await performSave(projectSnapshot);
    if (savedProject) {
        updateLocalStateFromProject(savedProject, 'localSave');
        setSelectedFileNodeId(newNode.id); 
        toast({ title: `${newItemType === 'file' ? 'File' : 'Folder'} Created`, description: `"${newNode.name}" created.`});
    }
    setIsNewItemDialogOpen(false);
    setNewItemType(null);
  }, [isReadOnlyView, currentProject, newItemName, newItemType, parentIdForNewItem, performSave, updateLocalStateFromProject, toast]);


  const handleNodeSelectedInExplorer = useCallback(async (selectedNode: FileSystemNode | null) => {
    if (saveStatus === 'saving') {
        toast({ title: "Saving...", description: "Please wait for current changes to save.", duration: 1500});
        return;
    }
    
    const previousSelectedNodeId = selectedFileNodeId; // Capture before it changes

    if (!isReadOnlyView && currentProject) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        let projectDataToSave = JSON.parse(JSON.stringify(currentProject)) as Project;
        projectDataToSave.name = editingProjectName || projectDataToSave.name; // Ensure name is current

        if (previousSelectedNodeId) {
            const nodeToUpdate = findNodeByIdRecursive(projectDataToSave.fileSystemRoots, previousSelectedNodeId);
            if (nodeToUpdate) {
                const updatedNode = {
                    ...nodeToUpdate,
                    textContent: activeTextContent,
                    whiteboardContent: activeWhiteboardDataRef.current,
                };
                projectDataToSave.fileSystemRoots = replaceNodeInTree(projectDataToSave.fileSystemRoots, previousSelectedNodeId, updatedNode);
            }
        } else { // Project root content was active
            projectDataToSave.textContent = activeTextContent;
            projectDataToSave.whiteboardContent = activeWhiteboardDataRef.current;
        }
        
        const savedProject = await performSave(projectDataToSave);
        if (savedProject) {
             updateLocalStateFromProject(savedProject, 'localSave');
        } else if (!isReadOnlyView) {
            // If save failed, we still need to reflect the local intent to switch,
            // but warn the user that the previous content might not be saved.
            toast({title: "Save Operation Pending/Failed", description: "Previous content might not be saved. Switching view.", variant: "destructive", duration: 3000});
        }
    }
    // Update selected node ID after save attempt & local state update
    setSelectedFileNodeId(selectedNode ? selectedNode.id : null);

  }, [isReadOnlyView, currentProject, selectedFileNodeId, activeTextContent, 
      activeWhiteboardDataRef, editingProjectName, performSave, 
      updateLocalStateFromProject, toast, saveStatus
    ]);


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
    let projectSnapshot = JSON.parse(JSON.stringify(currentProject)) as Project;
    projectSnapshot.fileSystemRoots = deleteNodeFromTreeRecursive(projectSnapshot.fileSystemRoots, nodeToDeleteId);
    
    const savedProject = await performSave(projectSnapshot);
    if (savedProject) {
        updateLocalStateFromProject(savedProject, 'localSave');
        if (selectedFileNodeId === nodeToDeleteId) {
            setSelectedFileNodeId(null); 
        }
        toast({ title: "Item Deleted", description: `"${nodeBeingDeleted?.name || 'Item'}" deleted.` });
    }
    setNodeToDeleteId(null);
  }, [nodeToDeleteId, selectedFileNodeId, currentProject, performSave, updateLocalStateFromProject, toast, isReadOnlyView, saveStatus]);


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

    let projectSnapshot = JSON.parse(JSON.stringify(currentProject)) as Project;
    const { removedNode, newTree: treeWithoutDraggedNode } = removeNodeFromTree(projectSnapshot.fileSystemRoots, draggedNodeId);

    if (!removedNode) {
      toast({ title: "Move Error", description: "Could not find item to move.", variant: "destructive" });
      return;
    }

    // Prevent moving a folder into itself or its own subfolders
    if (targetFolderId && removedNode.type === 'folder') {
      let currentParentInPath = targetFolderId;
      while(currentParentInPath) {
        if (currentParentInPath === draggedNodeId) {
          toast({ title: "Invalid Move", description: "Cannot move a folder into itself or a subfolder.", variant: "destructive" });
          return;
        }
        const parentNode = findNodeByIdRecursive(projectSnapshot.fileSystemRoots, currentParentInPath);
        // This logic needs to trace up the original tree, not the modified one.
        // Simplified check for now, complex cycle detection can be added.
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
        const pathToTarget = findPathToRoot(currentProject.fileSystemRoots, targetFolderId);
        if (pathToTarget?.includes(draggedNodeId)) {
             toast({ title: "Invalid Move", description: "Cannot move a folder into one of its own subfolders.", variant: "destructive" });
            return;
        }
        // This loop logic for parent tracing was flawed, simplified the check above.
        break; 
      }
    }


    projectSnapshot.fileSystemRoots = addNodeToTargetInTree(treeWithoutDraggedNode, targetFolderId, removedNode);
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const savedProject = await performSave(projectSnapshot);
    if (savedProject) {
        updateLocalStateFromProject(savedProject, 'localSave');
        toast({ title: "Item Moved", description: `"${removedNode.name}" moved.` });
    }
  }, [isReadOnlyView, currentProject, performSave, updateLocalStateFromProject, toast]);


  useEffect(() => { // Read-only logic based on URL and ownership
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


  if (!mounted || isLoadingProject || (!currentProject && projectId)) {
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
  const showContentPlaceholder = !selectedFileNodeId && currentProject?.fileSystemRoots.length > 0;
  const showCreateFilePrompt = !selectedFileNodeId && currentProject?.fileSystemRoots.length === 0;
  
  const saveStatusIcon = () => {
    switch (saveStatus) {
      case 'saving': return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'synced': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'idle': return <div className="h-4 w-4" />; // Placeholder for spacing
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
            {isEditingName ? (
              <Input
                value={editingProjectName}
                onChange={(e) => setEditingProjectName(e.target.value)}
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
                {isEditingName ? <Check className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
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
              <DropdownMenuItem onClick={() => handleOpenNewItemDialogRef.current('file', selectedFileNodeId && findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.type === 'folder' ? selectedFileNodeId : null )}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                <span>New File</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenNewItemDialogRef.current('folder', selectedFileNodeId && findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.type === 'folder' ? selectedFileNodeId : null)}>
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
              <Button variant={viewMode === 'editor' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('editor')} aria-label="Editor View" disabled={!selectedFileNodeId && !showCreateFilePrompt}>
                <Edit3 className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Editor</span>
              </Button>
              <Button variant={viewMode === 'both' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('both')} aria-label="Split View" disabled={!selectedFileNodeId && !showCreateFilePrompt}>
                 <Rows className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Both</span>
              </Button>
              <Button variant={viewMode === 'whiteboard' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('whiteboard')} aria-label="Whiteboard View" disabled={!selectedFileNodeId && !showCreateFilePrompt}>
                <LayoutDashboard className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Board</span>
              </Button>
            </div>

            <Button variant="outline" onClick={() => setIsShareDialogOpen(true)}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
            {!isReadOnlyView && (
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
            
            {(!selectedFileNodeId && !showCreateFilePrompt && !showContentPlaceholder) && ( // Default content view if no file selected AND no prompts
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
          isLocal={false} // Indicate Firestore backend
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
