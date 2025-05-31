
"use client";

import { useState, useCallback } from "react";
import type { FileSystemNode } from "@/lib/types";
import { FileNodeItem } from "./FileNodeItem";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileExplorerProps {
  nodes: FileSystemNode[];
  onNodeSelect?: (node: FileSystemNode | null) => void; 
  onDeleteNode: (nodeId: string) => void; 
  onAddFileToFolder: (folderId: string | null) => void; 
  onAddFolderToFolder: (folderId: string | null) => void;
  selectedNodeId: string | null; 
  onMoveNode: (draggedNodeId: string, targetFolderId: string | null) => void; // New prop
}

export function FileExplorer({ 
    nodes, 
    onNodeSelect, 
    onDeleteNode,
    onAddFileToFolder,
    onAddFolderToFolder,
    selectedNodeId,
    onMoveNode, // New prop
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

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
    // Check if the event target is the root div itself, not a child FileNodeItem
    // This simple check might not be robust enough for complex nested elements.
    if (event.target === event.currentTarget) { 
      const draggedNodeId = event.dataTransfer.getData("application/node-id");
      if (draggedNodeId) {
        onMoveNode(draggedNodeId, null); // null targetFolderId for root
      }
    }
    // Reset any global drag over styles if needed here
  };

  const handleRootDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = "move";
    // Add visual cue for root drop target if desired (e.g., change background of this div)
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
        onMoveNode={onMoveNode} // Pass down
      />
    ));
  };

  return (
    <div 
      className="h-full w-full flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm p-2"
      onDrop={handleRootDrop}
      onDragOver={handleRootDragOver}
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
