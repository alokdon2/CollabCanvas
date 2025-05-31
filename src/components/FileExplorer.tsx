
"use client";

import { useState, useCallback } from "react";
import type { FileSystemNode } from "@/lib/types";
import { FileNodeItem } from "./FileNodeItem";
import { ScrollArea } from "@/components/ui/scroll-area";
// Removed: useToast, Add File/Folder buttons as they are now in global navbar

interface FileExplorerProps {
  nodes: FileSystemNode[];
  onNodeSelect?: (node: FileSystemNode | null) => void;
  onDeleteNode: (nodeId: string) => void; // To request deletion
  onAddFileToFolder: (folderId: string | null) => void; // New prop
  onAddFolderToFolder: (folderId: string | null) => void; // New prop
}

export function FileExplorer({ 
    nodes, 
    onNodeSelect, 
    onDeleteNode,
    onAddFileToFolder,
    onAddFolderToFolder 
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
    setSelectedNodeId(node.id);
    if (onNodeSelect) {
      onNodeSelect(node);
    }
  }, [onNodeSelect]);

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
        onDeleteNode={onDeleteNode} // Pass down delete handler
        onAddFileToFolder={onAddFileToFolder} // Pass down add file handler
        onAddFolderToFolder={onAddFolderToFolder} // Pass down add folder handler
      />
    ));
  };

  return (
    <div className="h-full w-full flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm p-2">
      {/* "New File/Folder" buttons removed from here, handled by global navbar + ProjectContext */}
      <ScrollArea className="flex-grow">
        <div className="space-y-0.5">
          {nodes.length > 0 ? (
            renderNodes(nodes, 0)
          ) : (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No files or folders.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
