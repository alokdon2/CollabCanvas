
"use client";

import { useState, useCallback } from "react";
import type { FileSystemNode } from "@/lib/types";
import { FileNodeItem } from "./FileNodeItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface FileExplorerProps {
  nodes: FileSystemNode[];
  onNodeSelect?: (node: FileSystemNode | null) => void; 
  onDeleteNode: (nodeId: string) => void; 
  onAddFileToFolder: (folderId: string | null) => void; 
  onAddFolderToFolder: (folderId: string | null) => void;
  selectedNodeId: string | null; 
  onMoveNode: (draggedNodeId: string, targetFolderId: string | null) => void;
}

export function FileExplorer({ 
    nodes, 
    onNodeSelect, 
    onDeleteNode,
    onAddFileToFolder,
    onAddFolderToFolder,
    selectedNodeId,
    onMoveNode, 
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isRootDragOver, setIsRootDragOver] = useState(false);

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  const handleNodeClick = useCallback((node: FileSystemNode) => {
    if (onNodeSelect) {
      onNodeSelect(node); 
    }
  }, [onNodeSelect]);

  const handleRootDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsRootDragOver(false); 
    // If a child FileNodeItem (folder) handled the drop, it would have called event.stopPropagation().
    // So, if the event reaches here, it's a drop on the root area.
    const draggedNodeId = event.dataTransfer.getData("application/node-id");
    if (draggedNodeId) {
      onMoveNode(draggedNodeId, null); // null targetFolderId for root
    }
  };

  const handleRootDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); 
    event.dataTransfer.dropEffect = "move";
    // Only set root drag over if not already over a specific child FileNodeItem that might have its own indicator.
    // This can be tricky. For simplicity, we'll set it. FileNodeItem's onDragLeave might cause flicker.
    if (event.dataTransfer.types.includes("application/node-id")) {
        setIsRootDragOver(true);
    }
  };

  const handleRootDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    // Check if the mouse is leaving the actual FileExplorer component bounds
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsRootDragOver(false);
    }
    // If event.relatedTarget is a child FileNodeItem, FileNodeItem's onDragEnter/onDragOver will handle its own visuals.
    // This simple check might still cause flickering if moving quickly between root and items.
    // A more robust solution might involve checking event.target in onDragOver.
    const targetIsFileNodeItem = (event.relatedTarget as HTMLElement)?.closest('[data-filenodeitem="true"]');
    if (targetIsFileNodeItem) {
        setIsRootDragOver(false);
    } else if (!event.currentTarget.contains(event.relatedTarget as Node)){
        setIsRootDragOver(false);
    }

  };

  const renderNodes = (nodesToRender: FileSystemNode[], level: number) => {
    return nodesToRender.map((node) => (
      <FileNodeItem
        key={node.id}
        node={node}
        level={level}
        onToggleExpand={handleToggleExpand}
        onNodeClick={handleNodeClick} 
        expandedFoldersInExplorer={expandedFolders}
        selectedNodeIdInExplorer={selectedNodeId}
        onDeleteNode={onDeleteNode}
        onAddFileToFolder={onAddFileToFolder}
        onAddFolderToFolder={onAddFolderToFolder}
        onMoveNode={onMoveNode}
      />
    ));
  };

  return (
    <div 
      className={cn(
        "h-full w-full flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm p-2",
        isRootDragOver && "bg-primary/10 ring-2 ring-primary" // Visual feedback for root drag over
      )}
      onDrop={handleRootDrop}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave} // Added drag leave for root
    >
      <ScrollArea className="flex-grow">
        <div className="space-y-0.5">
          {nodes.length > 0 ? (
            renderNodes(nodes, 0)
          ) : (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No files or folders.
              <br />
              Use the '+' in the top bar to add items.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
