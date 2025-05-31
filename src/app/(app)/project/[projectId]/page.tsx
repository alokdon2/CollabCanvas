
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Whiteboard } from "@/components/Whiteboard";
import type { Project, WhiteboardData, FileSystemNode } from "@/lib/types";
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
import { dbGetProjectById, dbSaveProject, dbDeleteProject } from "@/lib/indexedDB";
import {
  loadProjectData as realtimeLoadProjectData,
  saveProjectData as realtimeSaveProjectData,
  subscribeToProjectUpdates as realtimeSubscribeToProjectUpdates,
  unsubscribeFromAllProjectUpdates as realtimeUnsubscribeFromAllProjectUpdates
} from "@/services/realtimeCollaborationService";


type ViewMode = "editor" | "whiteboard" | "both";

const DEFAULT_EMPTY_TEXT_CONTENT = "<p></p>";
const DEFAULT_EMPTY_WHITEBOARD_DATA: WhiteboardData = {
  elements: [],
  appState: { ZenModeEnabled: false, viewModeEnabled: false },
  files: {}
};

const ensureNodeContentRecursive = (nodes: FileSystemNode[]): FileSystemNode[] => {
  return nodes.map(node => ({
    ...node,
    textContent: node.textContent || DEFAULT_EMPTY_TEXT_CONTENT,
    whiteboardContent: node.whiteboardContent || { ...DEFAULT_EMPTY_WHITEBOARD_DATA },
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
  const isSavingRef = useRef(false); // To prevent concurrent saves

  const updateLocalStateFromProject = useCallback((projectData: Project | null) => {
    if (!projectData) return;

    const ensuredFileSystemRoots = ensureNodeContentRecursive(projectData.fileSystemRoots || []);
    
    setCurrentProject({...projectData, fileSystemRoots: ensuredFileSystemRoots});
    setEditingProjectName(projectData.name);
    setCurrentProjectName(projectData.name); // Update context
    
    const rootText = projectData.textContent || DEFAULT_EMPTY_TEXT_CONTENT;
    const rootBoard = projectData.whiteboardContent || {...DEFAULT_EMPTY_WHITEBOARD_DATA};
    setProjectRootTextContent(rootText);
    setProjectRootWhiteboardData(rootBoard);
    setActiveFileSystemRoots(ensuredFileSystemRoots);

    const currentSelectedNodeId = selectedFileNodeId; // Use state before it's potentially changed by folder logic
    const nodeToLoad = currentSelectedNodeId ? findNodeByIdRecursive(ensuredFileSystemRoots, currentSelectedNodeId) : null;

    if (nodeToLoad) {
      setActiveTextContent(nodeToLoad.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
      const newBoardData = nodeToLoad.whiteboardContent ? {...nodeToLoad.whiteboardContent} : {...DEFAULT_EMPTY_WHITEBOARD_DATA};
      setActiveWhiteboardData(newBoardData);
      activeWhiteboardDataRef.current = newBoardData;
    } else { // No node selected or node not found, fall back to root (or if previously a folder was 'selected' for root view)
      setSelectedFileNodeId(null); // Ensure if node was deleted, we reset selection
      setActiveTextContent(rootText);
      setActiveWhiteboardData({...rootBoard});
      activeWhiteboardDataRef.current = {...rootBoard};
    }
  }, [setCurrentProjectName, selectedFileNodeId]);


  useEffect(() => {
    setMounted(true);
    let unsubscribeRealtime: (() => void) | null = null;

    async function fetchAndInitializeProject() {
      if (!projectId) return;
      setIsLoadingProject(true);
      try {
        let projectData = await realtimeLoadProjectData(projectId);
        let source = "Realtime";

        if (!projectData) {
          projectData = await dbGetProjectById(projectId);
          source = "IndexedDB";
        }
        
        if (projectData) {
          console.log(`Project loaded from ${source}`);
          updateLocalStateFromProject(projectData);

          const unsubFn = await realtimeSubscribeToProjectUpdates(projectId, (updatedProject) => {
            console.log("[Realtime] Received project update from subscription:", updatedProject.name, updatedProject.updatedAt);
            if (isSavingRef.current) {
                console.log("[Realtime] Save in progress, skipping update from subscription for now.");
                return;
            }
            const currentProjectSnapshot = currentProject; // Capture currentProject at the time of update
            if (currentProjectSnapshot && new Date(updatedProject.updatedAt) < new Date(currentProjectSnapshot.updatedAt)) {
                console.log("[Realtime] Incoming update is older than current state, skipping.");
                return;
            }
            toast({ title: "Project Updated", description: "Changes received from collaborators.", duration: 2000 });
            updateLocalStateFromProject(updatedProject);
          });
          unsubscribeRealtime = unsubFn;

        } else {
          toast({ title: "Error", description: "Project not found.", variant: "destructive" });
          router.replace("/");
        }
      } catch (error) {
        console.error("Failed to fetch project:", error);
        toast({ title: "Error", description: `Could not load project data: ${(error as Error).message}`, variant: "destructive" });
        router.replace("/");
      } finally {
        setIsLoadingProject(false);
      }
    }
    fetchAndInitializeProject();
    
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
        unsubscribeRealtime();
      } else {
        (async () => {
          try {
            if(projectId) await realtimeUnsubscribeFromAllProjectUpdates(projectId);
          } catch (e) {
             console.error("Error unsubscribing from all project updates during cleanup:", e);
          }
        })();
      }
    };
  }, [projectId, router, toast, setCurrentProjectName, registerTriggerNewFile, registerTriggerNewFolder, updateLocalStateFromProject]); 

  useEffect(() => {
    activeWhiteboardDataRef.current = activeWhiteboardData;
  }, [activeWhiteboardData]);

  const performSave = useCallback(async (projectToSave: Project | null) => {
    if (!projectToSave || isSavingRef.current) return;
    
    isSavingRef.current = true;
    try {
      await dbSaveProject(projectToSave);
      await realtimeSaveProjectData(projectToSave);

      if (projectToSave.name !== currentProjectNameFromContext) {
        setCurrentProjectName(projectToSave.name);
      }
      if (!saveTimeoutRef.current) { 
          toast({ title: "Progress Saved", description: "Your changes have been saved locally and synced.", duration: 2000 });
      }
    } catch (error) {
      console.error("Failed to save project:", error);
      toast({ title: "Save Error", description: `Could not save project: ${(error as Error).message}`, variant: "destructive" });
    } finally {
      isSavingRef.current = false;
    }
  }, [currentProjectNameFromContext, setCurrentProjectName, toast]);


  useEffect(() => {
    if (!mounted || isLoadingProject || !currentProject) return;

    const constructProjectDataToSave = (): Project => {
      return {
        id: currentProject.id,
        createdAt: currentProject.createdAt,
        name: editingProjectName || currentProject.name,
        fileSystemRoots: [...activeFileSystemRoots], 
        textContent: projectRootTextContent, // This should be the project's root text content
        whiteboardContent: projectRootWhiteboardData, // This should be the project's root whiteboard data
        updatedAt: new Date().toISOString(),
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
        toast({ title: "Auto-Saved", description: "Changes automatically saved.", duration: 2000});
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
    performSave, toast
  ]);

  const handleTextChange = useCallback((newText: string) => {
    setActiveTextContent(newText); 
    if (selectedFileNodeId) { 
      setActiveFileSystemRoots(prevRoots => 
        updateNodeInTreeRecursive(prevRoots, selectedFileNodeId, { textContent: newText })
      );
    } else { // Should not happen if folders also get selectedFileNodeId, but as fallback for root
      setProjectRootTextContent(newText); 
    }
  }, [selectedFileNodeId]); 
  
  const handleWhiteboardChange = useCallback((newData: WhiteboardData) => {
    const oldElementsString = JSON.stringify(activeWhiteboardDataRef.current?.elements || []);
    const newElementsString = JSON.stringify(newData.elements || []);

    if (newElementsString !== oldElementsString || 
        newData.appState?.viewBackgroundColor !== activeWhiteboardDataRef.current?.appState?.viewBackgroundColor
       ) {
        
        setActiveWhiteboardData(newData); 

        if (selectedFileNodeId) { 
            setActiveFileSystemRoots(prevRoots => 
              updateNodeInTreeRecursive(prevRoots, selectedFileNodeId, { whiteboardContent: newData })
            );
        } else { // Should not happen if folders also get selectedFileNodeId
            setProjectRootWhiteboardData(newData); 
        }
    }
  }, [selectedFileNodeId]); 
  
  const handleNameEditToggle = useCallback(async () => {
    if (isEditingName && currentProject) {
      const newName = editingProjectName.trim();
      if (newName && newName !== currentProject.name) {
        // Construct the most current state of the project for saving the name change
        const updatedProjectDataForNameChange = { 
            ...currentProject, 
            name: newName, 
            updatedAt: new Date().toISOString(),
            textContent: projectRootTextContent,
            whiteboardContent: projectRootWhiteboardData,
            fileSystemRoots: activeFileSystemRoots,
        };
        try {
          // Force save any pending data before processing the name change
          if (saveTimeoutRef.current && pendingSaveDataRef.current?.project) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
            await performSave(pendingSaveDataRef.current.project); // Save what was pending
            pendingSaveDataRef.current = null;
          } else if (pendingSaveDataRef.current?.project && !saveTimeoutRef.current) {
             // If there's pending data but no timeout (edge case, e.g., if timeout just fired), save it
             await performSave(pendingSaveDataRef.current.project);
             pendingSaveDataRef.current = null;
          }
          
          await performSave(updatedProjectDataForNameChange); 
          setCurrentProject(updatedProjectDataForNameChange); 
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
  }, [isEditingName, currentProject, editingProjectName, setCurrentProjectName, toast, projectRootTextContent, projectRootWhiteboardData, activeFileSystemRoots, performSave]);


  const confirmDeleteProject = useCallback(async () => {
    if (!currentProject) return;
    try {
      await dbDeleteProject(currentProject.id);
      toast({ title: "Project Deleted", description: `"${currentProject.name}" has been deleted.` });
      router.replace("/");
    } catch (error) {
      toast({ title: "Error", description: "Could not delete project.", variant: "destructive" });
    }
  }, [currentProject, router, toast]);


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
      textContent: DEFAULT_EMPTY_TEXT_CONTENT, 
      whiteboardContent: {...DEFAULT_EMPTY_WHITEBOARD_DATA}, 
      ...(newItemType === 'folder' ? { children: [] } : {}), 
    };
    
    setActiveFileSystemRoots(prevRoots => addNodeToTreeRecursive(prevRoots, parentIdForNewItem, newNode));

    toast({ title: `${newItemType === 'file' ? 'File' : 'Folder'} Created`, description: `"${newNode.name}" added.`});
    setIsNewItemDialogOpen(false);
    setNewItemType(null);
  }, [newItemName, newItemType, parentIdForNewItem, toast]);
  

  const handleNodeSelectedInExplorer = useCallback(async (selectedNode: FileSystemNode | null) => {
    if (isSavingRef.current) {
        toast({ title: "Saving...", description: "Please wait for current changes to save before switching items.", duration: 1500});
        return;
    }

    // Force save current content before switching
    if (saveTimeoutRef.current && pendingSaveDataRef.current?.project) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null; // Nullify to prevent auto-save toast
      await performSave(pendingSaveDataRef.current.project); 
      pendingSaveDataRef.current = null; 
    } else if (pendingSaveDataRef.current?.project && !saveTimeoutRef.current) {
      // If there's pending data but no timeout (e.g. very fast switch, or timeout just fired)
      await performSave(pendingSaveDataRef.current.project);
      pendingSaveDataRef.current = null;
    }

    const newSelectedNodeId = selectedNode ? selectedNode.id : null;
    setSelectedFileNodeId(newSelectedNodeId); // This will always be set now, for files or folders

    if (selectedNode) { 
        setActiveTextContent(selectedNode.textContent || DEFAULT_EMPTY_TEXT_CONTENT);
        const newBoardData = selectedNode.whiteboardContent ? {...selectedNode.whiteboardContent} : {...DEFAULT_EMPTY_WHITEBOARD_DATA};
        setActiveWhiteboardData(newBoardData);
        activeWhiteboardDataRef.current = newBoardData; 
    } else { 
        // This case implies the project root is selected (e.g., by deselecting all)
        setActiveTextContent(projectRootTextContent);
        setActiveWhiteboardData({...projectRootWhiteboardData});
        activeWhiteboardDataRef.current = {...projectRootWhiteboardData};
    }
  }, [
    performSave, 
    projectRootTextContent, projectRootWhiteboardData, 
    toast, 
  ]);


  const handleDeleteNodeRequest = useCallback((nodeId: string) => {
    setNodeToDeleteId(nodeId); 
  }, []);

  const confirmDeleteNode = useCallback(async () => {
    if (!nodeToDeleteId || !currentProject || isSavingRef.current) return;

    // Force save current content before deleting
    if (saveTimeoutRef.current && pendingSaveDataRef.current?.project) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null; // Nullify to prevent auto-save toast
      await performSave(pendingSaveDataRef.current.project);
      pendingSaveDataRef.current = null;
    } else if (pendingSaveDataRef.current?.project && !saveTimeoutRef.current) {
      await performSave(pendingSaveDataRef.current.project);
      pendingSaveDataRef.current = null;
    }

    const nodeBeingDeleted = findNodeByIdRecursive(activeFileSystemRoots, nodeToDeleteId);
    const newRoots = deleteNodeFromTreeRecursive(activeFileSystemRoots, nodeToDeleteId);
    setActiveFileSystemRoots(newRoots); 

    // If the deleted node was selected, revert to project root view
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
    activeFileSystemRoots, performSave, currentProject, toast,
  ]);


  const onAddFileToFolderCallback = useCallback((folderId: string | null) => {
    handleOpenNewItemDialog('file', folderId);
  }, [handleOpenNewItemDialog]);

  const onAddFolderToFolderCallback = useCallback((folderId: string | null) => {
    handleOpenNewItemDialog('folder', folderId);
  }, [handleOpenNewItemDialog]);

  const handleMoveNode = useCallback((draggedNodeId: string, targetFolderId: string | null) => {
    if (draggedNodeId === targetFolderId) {
        toast({ title: "Invalid Move", description: "Cannot move an item into itself.", variant: "destructive" });
        return;
    }

    setActiveFileSystemRoots(prevRoots => {
      const { removedNode, newTree: treeWithoutDraggedNode } = removeNodeFromTree(prevRoots, draggedNodeId);

      if (!removedNode) {
        console.error("Dragged node not found during move operation.");
        toast({ title: "Move Error", description: "Could not find the item to move.", variant: "destructive" });
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
                toast({ title: "Invalid Move", description: "Cannot move a folder into one of its own subfolders.", variant: "destructive" });
                return prevRoots; 
            }
            const parentOfCurrentTarget = findParentRecursive(prevRoots, currentParentId); 
            currentParentId = parentOfCurrentTarget ? parentOfCurrentTarget.id : null;
        }
      }
      
      const newRootsWithMovedNode = addNodeToTargetInTree(treeWithoutDraggedNode, targetFolderId, removedNode);
      
      toast({ title: "Item Moved", description: `"${removedNode.name}" moved.` });
      return newRootsWithMovedNode;
    });
  }, [toast]);


  if (!mounted || isLoadingProject || !currentProject) {
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
              />
            ) : (
              <h1 className="text-lg font-semibold truncate max-w-[150px] sm:max-w-xs cursor-pointer hover:underline" onClick={handleNameEditToggle}>
                {editingProjectName} 
              </h1>
            )}
            <Button variant="ghost" size="icon" onClick={handleNameEditToggle} className="ml-1 mr-2" aria-label="Edit project name">
              {isEditingName ? <Check className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
            </Button>
          </div>

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
                    onMoveNode={handleMoveNode}
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
                  key={selectedFileNodeId || 'project-root-whiteboard'}
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
                      key={selectedFileNodeId || 'project-root-whiteboard-both'}
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

