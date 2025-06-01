
"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Whiteboard } from "@/components/Whiteboard";
import type { Project, WhiteboardData, FileSystemNode, ExcalidrawAppState } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Trash2, Edit, Check, LayoutDashboard, Edit3, Rows, FolderTree, Loader2, PanelLeftOpen, PlusCircle, FilePlus2, FolderPlus } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { useProjectContext } from "@/contexts/ProjectContext";
import { FileExplorer } from "@/components/FileExplorer";
import {
  loadProjectData as realtimeLoadProjectData,
  saveProjectData as realtimeSaveProjectData,
  subscribeToProjectUpdates as realtimeSubscribeToProjectUpdates,
  deleteProjectFromFirestore
} from "@/services/realtimeCollaborationService";
import { useAuth } from "@/contexts/AuthContext"; // Import useAuth


type ViewMode = "editor" | "whiteboard" | "both";

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA: WhiteboardData = {
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false } as ExcalidrawAppState,
  files: {}
};

const ensureNodeContentRecursive = (nodes: FileSystemNode[]): FileSystemNode[] => {
  return nodes.map(node => ({
    ...node,
    textContent: node.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
    whiteboardContent: node.whiteboardContent ? {
        elements: node.whiteboardContent.elements || [],
        appState: node.whiteboardContent.appState || { ...DEFAULT_EMPTY_WHITEBOARD_DATA.appState },
        files: node.whiteboardContent.files || {},
    } : { ...DEFAULT_EMPTY_WHITEBOARD_DATA },
    ...(node.children && { children: ensureNodeContentRecursive(node.children) }),
  }));
};


const updateNodeInTreeRecursive = (
  nodes: FileSystemNode[],
  nodeId: string,
  newContent: { textContent?: string; whiteboardContent?: WhiteboardData | null }
): FileSystemNode[] => {
  return nodes.map(node => {
    if (node.id === nodeId) {
      const updatedNode = { ...node, ...newContent };
      return updatedNode;
    }
    if (node.children) {
      return { ...node, children: updateNodeInTreeRecursive(node.children, nodeId, newContent) };
    }
    return node;
  });
};

const deleteNodeFromTreeRecursive = (
  nodes: FileSystemNode[],
  nodeId: string
): FileSystemNode[] => {
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

const addNodeToTreeRecursive = (
  nodes: FileSystemNode[],
  parentId: string | null,
  newNode: FileSystemNode
): FileSystemNode[] => {
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

const removeNodeFromTree = (
  nodes: FileSystemNode[],
  nodeId: string
): { removedNode: FileSystemNode | null; newTree: FileSystemNode[] } => {
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

const addNodeToTargetInTree = (
  nodes: FileSystemNode[],
  targetFolderId: string | null,
  nodeToAdd: FileSystemNode
): FileSystemNode[] => {
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


function ProjectPageContent() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();
  const { currentProjectName: currentProjectNameFromContext, setCurrentProjectName, registerTriggerNewFile, registerTriggerNewFolder } = useProjectContext();
  const { user: authUser } = useAuth(); // Get authenticated user

  const searchParams = useSearchParams();
  const initialIsShared = searchParams.get('shared') === 'true';
  const [isReadOnlyView, setIsReadOnlyView] = useState(initialIsShared);


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
  const isSavingRef = useRef(false);
  const lastSavedToServerTimestampRef = useRef<string | null>(null);
  const lastLocalUpdateTimestampRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);


  useEffect(() => {
    const currentIsShared = searchParams.get('shared') === 'true';
    let effectiveReadOnly = currentIsShared;

    if (currentProject && authUser && projectRootTextContent !== DEFAULT_EMPTY_TEXT_CONTENT ) { // Ensure project is loaded to check ownerId
        if (!currentIsShared && currentProject.ownerId && authUser.uid !== currentProject.ownerId) {
             effectiveReadOnly = true; // Force read-only if not owner and not explicitly shared
        }
    }
    
    if (effectiveReadOnly !== isReadOnlyView) {
        setIsReadOnlyView(effectiveReadOnly);
    }

    if (currentIsShared && mounted && !isLoadingProject) { 
      toast({
        title: "Read-Only Mode",
        description: "You are viewing a shared project. Changes cannot be saved.",
      });
    } else if (effectiveReadOnly && !currentIsShared && mounted && !isLoadingProject && currentProject?.ownerId && authUser?.uid !== currentProject.ownerId) {
        toast({
            title: "Viewing Others' Project",
            description: "This project is owned by another user. You are in read-only mode.",
            variant: "default"
        });
    }
  }, [searchParams, toast, mounted, isReadOnlyView, currentProject, authUser, isLoadingProject, projectRootTextContent]);


  const updateLocalStateFromProject = useCallback((projectData: Project | null, source: "initialLoad" | "realtimeUpdate" = "initialLoad") => {
    if (!projectData) return;

    if (source === "realtimeUpdate" && lastSavedToServerTimestampRef.current && projectData.updatedAt <= lastSavedToServerTimestampRef.current) {
      console.log("[Realtime] Received update is older or same as last server save, skipping to prevent stale data overwrite:", projectData.updatedAt, "vs", lastSavedToServerTimestampRef.current);
      return;
    }
     if (source === "realtimeUpdate" && lastLocalUpdateTimestampRef.current && projectData.updatedAt < lastLocalUpdateTimestampRef.current) {
      console.log("[Realtime] Received update is older than last local change that might be pending save, skipping:", projectData.updatedAt, "vs", lastLocalUpdateTimestampRef.current);
      return;
    }

    const ensuredProjectData = {
        ...projectData,
        whiteboardContent: projectData.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA },
        fileSystemRoots: ensureNodeContentRecursive(projectData.fileSystemRoots || [])
    };

    setCurrentProject(ensuredProjectData);
    setEditingProjectName(ensuredProjectData.name);
    setCurrentProjectName(ensuredProjectData.name);

    const rootText = ensuredProjectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT;
    const rootBoard = ensuredProjectData.whiteboardContent || {...DEFAULT_EMPTY_WHITEBOARD_DATA};
    setProjectRootTextContent(rootText);
    setProjectRootWhiteboardData(rootBoard);
    setActiveFileSystemRoots(ensuredProjectData.fileSystemRoots);

    const currentSelectedNodeId = selectedFileNodeId;
    const nodeToLoad = currentSelectedNodeId ? findNodeByIdRecursive(ensuredProjectData.fileSystemRoots, currentSelectedNodeId) : null;

    if (nodeToLoad) {
      setActiveTextContent(nodeToLoad.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
      const newBoardData = nodeToLoad.whiteboardContent ? {...nodeToLoad.whiteboardContent} : {...DEFAULT_EMPTY_WHITEBOARD_DATA};
      setActiveWhiteboardData(newBoardData);
      activeWhiteboardDataRef.current = newBoardData;
    } else {
      setSelectedFileNodeId(null);
      setActiveTextContent(rootText);
      setActiveWhiteboardData({...rootBoard});
      activeWhiteboardDataRef.current = {...rootBoard};
    }
    if (source === "realtimeUpdate") {
        setTimeout(() => toast({ title: "Project Updated", description: "Changes received from collaborators.", duration: 2000 }), 0);
    }

  }, [setCurrentProjectName, selectedFileNodeId, toast]);


  useEffect(() => {
    let unsubscribeRealtime: (() => void) | null = null;

    async function fetchAndInitializeProject() {
      if (!projectId) return;
      setIsLoadingProject(true);
      try {
        const projectDataFromFirestore = await realtimeLoadProjectData(projectId); // Renamed to avoid conflict

        if (projectDataFromFirestore) {
          console.log(`[ProjectPage] Project ${projectId} loaded from Firestore.`);
          
          // Determine read-only status based on shared link and ownership
          const isSharedViaUrl = searchParams.get('shared') === 'true';
          let effectiveReadOnly = isSharedViaUrl;
          if (!isSharedViaUrl && authUser && projectDataFromFirestore.ownerId && authUser.uid !== projectDataFromFirestore.ownerId) {
            console.warn("[ProjectPage] User is not owner and not a shared link. Forcing read-only mode.");
            effectiveReadOnly = true;
          }
          setIsReadOnlyView(effectiveReadOnly); // Set read-only state before updating local state

          updateLocalStateFromProject(projectDataFromFirestore, "initialLoad");
          lastSavedToServerTimestampRef.current = projectDataFromFirestore.updatedAt;


          unsubscribeRealtime = await realtimeSubscribeToProjectUpdates(projectId, (updatedProject) => {
            console.log("[ProjectPage Realtime] Received project update from subscription:", updatedProject.name, updatedProject.updatedAt);
            if (isSavingRef.current) {
                console.log("[ProjectPage Realtime] Save in progress, skipping update from subscription for now.");
                return;
            }

            setCurrentProject(currentProj => {
                if (currentProj && new Date(updatedProject.updatedAt) <= new Date(currentProj.updatedAt)) {
                    console.log("[ProjectPage Realtime] Incoming update is older or same as current client state, skipping to prevent race condition.", updatedProject.updatedAt, "vs", currentProj.updatedAt);
                    return currentProj;
                }
                updateLocalStateFromProject(updatedProject, "realtimeUpdate");
                lastSavedToServerTimestampRef.current = updatedProject.updatedAt;
                return updatedProject;
            });

          });

        } else {
          setTimeout(() => toast({ title: "Error", description: "Project not found.", variant: "destructive" }), 0);
          router.replace("/");
        }
      } catch (error) {
        console.error("[ProjectPage] Failed to fetch project:", error);
        setTimeout(() => toast({ title: "Error Loading Project", description: `Could not load project data: ${(error as Error).message}`, variant: "destructive" }), 0);
        router.replace("/");
      } finally {
        setIsLoadingProject(false);
      }
    }

    if (mounted) { 
        fetchAndInitializeProject();
    }

    if (typeof registerTriggerNewFile === 'function') {
        registerTriggerNewFile(() => {
            const parentId = selectedFileNodeId && findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.type === 'folder' ? selectedFileNodeId : null;
            handleOpenNewItemDialog('file', parentId);
        });
    }
    if (typeof registerTriggerNewFolder === 'function') {
        registerTriggerNewFolder(() => {
             const parentId = selectedFileNodeId && findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.type === 'folder' ? selectedFileNodeId : null;
            handleOpenNewItemDialog('folder', parentId);
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
  }, [projectId, router, toast, setCurrentProjectName, registerTriggerNewFile, registerTriggerNewFolder, updateLocalStateFromProject, mounted, authUser, searchParams]);


  useEffect(() => {
    activeWhiteboardDataRef.current = activeWhiteboardData;
  }, [activeWhiteboardData]);

  const performSave = useCallback(async (projectToSave: Project | null) => {
    if (isReadOnlyView) {
      console.log("[ProjectPage] In read-only view, save skipped.");
      return;
    }
    if (!projectToSave || isSavingRef.current) return;

    isSavingRef.current = true;
    const timestampForThisSave = new Date().toISOString();
    const finalProjectToSave = {...projectToSave, ownerId: projectToSave.ownerId || authUser?.uid, updatedAt: timestampForThisSave}; // Ensure ownerId

    try {
      await realtimeSaveProjectData(finalProjectToSave);
      lastSavedToServerTimestampRef.current = timestampForThisSave;

      if (finalProjectToSave.name !== currentProjectNameFromContext) {
        setCurrentProjectName(finalProjectToSave.name);
      }
      if (!saveTimeoutRef.current) {
          setTimeout(() => toast({ title: "Progress Saved", description: "Your changes have been synced to the cloud.", duration: 2000 }),0);
      }
    } catch (error) {
      console.error("[ProjectPage] Failed to save project to Firestore:", error);
      setTimeout(() => toast({ title: "Save Error", description: `Could not save project: ${(error as Error).message}`, variant: "destructive" }), 0);
    } finally {
      isSavingRef.current = false;
    }
  }, [currentProjectNameFromContext, setCurrentProjectName, toast, isReadOnlyView, authUser]);


  useEffect(() => {
    if (isReadOnlyView) {
        console.log("[ProjectPage] In read-only view, auto-save and project updates skipped.");
        return;
    }
    if (!mounted || isLoadingProject || !currentProject) return;

    const currentLocalTimestamp = new Date().toISOString();
    lastLocalUpdateTimestampRef.current = currentLocalTimestamp;

    const constructProjectDataToSave = (): Project => {
      return {
        id: currentProject.id,
        createdAt: currentProject.createdAt,
        name: editingProjectName || currentProject.name,
        ownerId: currentProject.ownerId || authUser?.uid, 
        fileSystemRoots: [...activeFileSystemRoots],
        textContent: projectRootTextContent,
        whiteboardContent: projectRootWhiteboardData,
        updatedAt: currentLocalTimestamp,
      };
    };

    const currentDataToSave = constructProjectDataToSave();
    pendingSaveDataRef.current = { project: currentDataToSave };

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (pendingSaveDataRef.current?.project && !isSavingRef.current) {
        const projectBeingSaved = pendingSaveDataRef.current.project;
        pendingSaveDataRef.current = null;
        saveTimeoutRef.current = null;
        await performSave(projectBeingSaved);
        setTimeout(() => toast({ title: "Auto-Saved", description: "Changes automatically saved to cloud.", duration: 2000}), 0);
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [
    projectRootTextContent, projectRootWhiteboardData, activeFileSystemRoots,
    editingProjectName,
    mounted, isLoadingProject, currentProject,
    performSave, toast, isReadOnlyView, authUser
  ]);

  const handleTextChange = useCallback((newText: string) => {
    if (isReadOnlyView) return;
    setActiveTextContent(newText);
    if (selectedFileNodeId) {
      setActiveFileSystemRoots(prevRoots =>
        updateNodeInTreeRecursive(prevRoots, selectedFileNodeId, { textContent: newText })
      );
    } else {
      setProjectRootTextContent(newText);
    }
  }, [selectedFileNodeId, isReadOnlyView]);

  const handleWhiteboardChange = useCallback((newData: WhiteboardData) => {
    if (isReadOnlyView) return;

    const oldElementsString = JSON.stringify(activeWhiteboardDataRef.current?.elements || []);
    const newElementsString = JSON.stringify(newData.elements || []);

    const oldAppStateString = JSON.stringify({
      viewBackgroundColor: activeWhiteboardDataRef.current?.appState?.viewBackgroundColor,
      zoom: activeWhiteboardDataRef.current?.appState?.zoom,
      scrollX: activeWhiteboardDataRef.current?.appState?.scrollX,
      scrollY: activeWhiteboardDataRef.current?.appState?.scrollY,
    });
    const newAppStateString = JSON.stringify({
      viewBackgroundColor: newData.appState?.viewBackgroundColor,
      zoom: newData.appState?.zoom,
      scrollX: newData.appState?.scrollX,
      scrollY: newData.appState?.scrollY,
    });


    if (newElementsString !== oldElementsString || newAppStateString !== oldAppStateString) {
        setActiveWhiteboardData(newData);

        if (selectedFileNodeId) {
            setActiveFileSystemRoots(prevRoots =>
              updateNodeInTreeRecursive(prevRoots, selectedFileNodeId, { whiteboardContent: newData })
            );
        } else {
            setProjectRootWhiteboardData(newData);
        }
    }
  }, [selectedFileNodeId, isReadOnlyView]);

  const handleNameEditToggle = useCallback(async () => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Project name cannot be changed in read-only view.", variant: "default" });
      return;
    }
    if (isEditingName && currentProject) {
      const newName = editingProjectName.trim();
      if (newName && newName !== currentProject.name) {

        const updatedProjectDataForNameChange: Project = {
            id: currentProject.id,
            createdAt: currentProject.createdAt,
            name: newName,
            ownerId: currentProject.ownerId || authUser?.uid, 
            fileSystemRoots: activeFileSystemRoots,
            textContent: projectRootTextContent,
            whiteboardContent: projectRootWhiteboardData,
            updatedAt: new Date().toISOString(), 
        };
        try {
          if (pendingSaveDataRef.current?.project && (saveTimeoutRef.current || !isSavingRef.current)) {
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
              saveTimeoutRef.current = null;
            }
            await performSave(pendingSaveDataRef.current.project);
            pendingSaveDataRef.current = null; 
          }
          
          await performSave(updatedProjectDataForNameChange); 
          setCurrentProject(prev => prev ? {...prev, name: newName, updatedAt: updatedProjectDataForNameChange.updatedAt} : null);
          setCurrentProjectName(newName);
          setTimeout(() => toast({title: "Project Renamed", description: `Project name updated to "${newName}".`}), 0);
        } catch (error) {
          setTimeout(() => toast({title: "Error", description: "Failed to update project name.", variant: "destructive"}), 0);
          setEditingProjectName(currentProject.name); 
        }
      } else if (currentProject) {
        setEditingProjectName(currentProject.name); 
      }
    }
    setIsEditingName(!isEditingName);
  }, [isReadOnlyView, isEditingName, currentProject, editingProjectName, setCurrentProjectName, toast, projectRootTextContent, projectRootWhiteboardData, activeFileSystemRoots, performSave, authUser]);


  const confirmDeleteProject = useCallback(async () => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Project cannot be deleted in read-only view.", variant: "default" });
      return;
    }
    if (!currentProject) return;
    // Ownership check before delete attempt client-side (Firestore rules will also check)
    if (authUser && currentProject.ownerId !== authUser.uid) {
        toast({ title: "Permission Denied", description: "You are not the owner of this project and cannot delete it.", variant: "destructive" });
        return;
    }
    try {
      await deleteProjectFromFirestore(currentProject.id);
      setTimeout(() => toast({ title: "Project Deleted", description: `"${currentProject.name}" has been deleted from the cloud.` }), 0);
      router.replace("/");
    } catch (error) {
      setTimeout(() => toast({ title: "Error Deleting Project", description: "Could not delete project from cloud.", variant: "destructive" }), 0);
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


  const handleCreateNewItem = useCallback(() => {
    if (isReadOnlyView) return;
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

    setActiveFileSystemRoots(prevRoots => addNodeToTreeRecursive(prevRoots, parentIdForNewItem, newNode));

    setTimeout(() => toast({ title: `${newItemType === 'file' ? 'File' : 'Folder'} Created`, description: `"${newNode.name}" added locally. Will sync shortly.`}), 0);
    setIsNewItemDialogOpen(false);
    setNewItemType(null);
  }, [newItemName, newItemType, parentIdForNewItem, toast, isReadOnlyView]);


  const handleNodeSelectedInExplorer = useCallback(async (selectedNode: FileSystemNode | null) => {
    if (isSavingRef.current) {
        setTimeout(() => toast({ title: "Saving...", description: "Please wait for current changes to save before switching items.", duration: 1500}), 0);
        return;
    }

    if (!isReadOnlyView && saveTimeoutRef.current && pendingSaveDataRef.current?.project) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      await performSave(pendingSaveDataRef.current.project);
      pendingSaveDataRef.current = null;
    } else if (!isReadOnlyView && pendingSaveDataRef.current?.project && !saveTimeoutRef.current) {
      await performSave(pendingSaveDataRef.current.project);
      pendingSaveDataRef.current = null;
    }

    const newSelectedNodeId = selectedNode ? selectedNode.id : null;
    setSelectedFileNodeId(newSelectedNodeId);

    if (selectedNode) {
        setActiveTextContent(selectedNode.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
        const newBoardData = selectedNode.whiteboardContent ? {...selectedNode.whiteboardContent} : {...DEFAULT_EMPTY_WHITEBOARD_DATA};
        setActiveWhiteboardData(newBoardData);
        activeWhiteboardDataRef.current = newBoardData;
    } else {
        setActiveTextContent(projectRootTextContent);
        setActiveWhiteboardData({...projectRootWhiteboardData});
        activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
    }
  }, [performSave, projectRootTextContent, projectRootWhiteboardData, toast, isReadOnlyView]);


  const handleDeleteNodeRequest = useCallback((nodeId: string) => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Cannot delete items in read-only view.", variant: "default" });
      return;
    }
    setNodeToDeleteId(nodeId);
  }, [isReadOnlyView, toast]);

  const confirmDeleteNode = useCallback(async () => {
    if (isReadOnlyView) return;
    if (!nodeToDeleteId || !currentProject || isSavingRef.current) return;

    if (saveTimeoutRef.current && pendingSaveDataRef.current?.project) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      await performSave(pendingSaveDataRef.current.project);
      pendingSaveDataRef.current = null;
    } else if (pendingSaveDataRef.current?.project && !saveTimeoutRef.current) {
      await performSave(pendingSaveDataRef.current.project);
      pendingSaveDataRef.current = null;
    }

    const nodeBeingDeleted = findNodeByIdRecursive(activeFileSystemRoots, nodeToDeleteId);
    const newRoots = deleteNodeFromTreeRecursive(activeFileSystemRoots, nodeToDeleteId);
    setActiveFileSystemRoots(newRoots);

    if (selectedFileNodeId === nodeToDeleteId) {
        setSelectedFileNodeId(null);
        setActiveTextContent(projectRootTextContent);
        setActiveWhiteboardData({...projectRootWhiteboardData});
        activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
    }
    setTimeout(() => toast({ title: "Item Deleted", description: `"${nodeBeingDeleted?.name || 'Item'}" removed locally. Will sync shortly.` }), 0);
    setNodeToDeleteId(null);
  }, [
    nodeToDeleteId, selectedFileNodeId, projectRootTextContent, projectRootWhiteboardData,
    activeFileSystemRoots, performSave, currentProject, toast, isReadOnlyView,
  ]);


  const onAddFileToFolderCallback = useCallback((folderId: string | null) => {
    handleOpenNewItemDialog('file', folderId);
  }, [handleOpenNewItemDialog]);

  const onAddFolderToFolderCallback = useCallback((folderId: string | null) => {
    handleOpenNewItemDialog('folder', folderId);
  }, [handleOpenNewItemDialog]);

  const handleMoveNode = useCallback((draggedNodeId: string, targetFolderId: string | null) => {
    if (isReadOnlyView) {
      toast({ title: "Read-Only Mode", description: "Cannot move items in read-only view.", variant: "default" });
      return;
    }
    if (draggedNodeId === targetFolderId) {
        setTimeout(() => toast({ title: "Invalid Move", description: "Cannot move an item into itself.", variant: "destructive" }), 0);
        return;
    }

    setActiveFileSystemRoots(prevRoots => {
      const { removedNode, newTree: treeWithoutDraggedNode } = removeNodeFromTree(prevRoots, draggedNodeId);

      if (!removedNode) {
        console.error("Dragged node not found during move operation.");
        setTimeout(() => toast({ title: "Move Error", description: "Could not find the item to move.", variant: "destructive" }), 0);
        return prevRoots;
      }

      if (targetFolderId && removedNode.type === 'folder') {
        let currentParentId: string | null = targetFolderId;
        const findParentRecursive = (nodes: FileSystemNode[], id: string): FileSystemNode | null => {
            for(const n of nodes) {
                if (n.children?.some(child => child.id === id)) return n;
                if (n.children) {
                    const parent = findParentRecursive(n.children, id);
                    if (parent) return parent;
                }
            }
            return null;
        }

        while(currentParentId) {
            if (currentParentId === draggedNodeId) {
                setTimeout(() => toast({ title: "Invalid Move", description: "Cannot move a folder into one of its own subfolders.", variant: "destructive" }), 0);
                return prevRoots;
            }
            const parentOfCurrentTarget = findParentRecursive(prevRoots, currentParentId);
            currentParentId = parentOfCurrentTarget ? parentOfCurrentTarget.id : null;
        }
      }

      const newRootsWithMovedNode = addNodeToTargetInTree(treeWithoutDraggedNode, targetFolderId, removedNode);

      setTimeout(() => toast({ title: "Item Moved", description: `"${removedNode.name}" moved locally. Will sync shortly.` }), 0);
      return newRootsWithMovedNode;
    });
  }, [toast, isReadOnlyView]);


  if (!mounted || isLoadingProject || !currentProject) {
    return (
      <div className="flex h-screen flex-col fixed inset-0 pt-14">
         <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-14">
            <div className="container flex h-full items-center px-4 sm:px-6 lg:px-8">
                <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="mr-2">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-lg font-semibold">Loading Project from Cloud...</h1>
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

  const editorKey = `editor-${selectedFileNodeId || 'project-root'}`;
  const whiteboardKey = `whiteboard-${selectedFileNodeId || 'project-root'}`;

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
              <DropdownMenuItem onClick={() => handleOpenNewItemDialog('file', selectedFileNodeId && findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.type === 'folder' ? selectedFileNodeId : null )}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                <span>New File</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenNewItemDialog('folder', selectedFileNodeId && findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.type === 'folder' ? selectedFileNodeId : null)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                <span>New Folder</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

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
            {viewMode === "editor" && (
              <div className="h-full p-1 sm:p-2 md:p-3">
                <RichTextEditor
                  key={editorKey}
                  value={activeTextContent}
                  onChange={handleTextChange}
                  isReadOnly={isReadOnlyView}
                />
              </div>
            )}
            {viewMode === "whiteboard" && (
              <div className="h-full p-1 sm:p-2 md:p-3">
                <Whiteboard
                  key={whiteboardKey}
                  initialData={activeWhiteboardData}
                  onChange={handleWhiteboardChange}
                  isReadOnly={isReadOnlyView}
                />
              </div>
            )}
            {viewMode === "both" && (
              <ResizablePanelGroup direction="horizontal" className="h-full w-full">
                <ResizablePanel defaultSize={50} minSize={20}>
                  <div className="h-full p-1 sm:p-2 md:p-3">
                    <RichTextEditor
                      key={`${editorKey}-both`}
                      value={activeTextContent}
                      onChange={handleTextChange}
                      isReadOnly={isReadOnlyView}
                    />
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={20}>
                  <div className="h-full p-1 sm:p-2 md:p-3">
                    <Whiteboard
                      key={`${whiteboardKey}-both`}
                      initialData={activeWhiteboardData}
                      onChange={handleWhiteboardChange}
                      isReadOnly={isReadOnlyView}
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

    {!isReadOnlyView && (
      <Dialog open={isNewItemDialogOpen} onOpenChange={setIsNewItemDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New {newItemType === 'file' ? 'File' : 'Folder'}</DialogTitle>
            <DialogDescription>
              Enter a name for your new {newItemType}.
              {parentIdForNewItem ?
                ` It will be created in the folder "${findNodeByIdRecursive(activeFileSystemRoots, parentIdForNewItem)?.name || 'selected folder'}".` :
                 selectedFileNodeId && findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.type === 'folder' ?
                 ` It will be created in the folder "${findNodeByIdRecursive(activeFileSystemRoots, selectedFileNodeId)?.name}".` :
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
    )}
    {!isReadOnlyView && (
      <AlertDialog open={!!nodeToDeleteId} onOpenChange={(open) => !open && setNodeToDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected item
              {currentProject && activeFileSystemRoots && findNodeByIdRecursive(activeFileSystemRoots, nodeToDeleteId || '')?.type === 'folder' && ' and all its contents'}.
              This will sync to the cloud.
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

