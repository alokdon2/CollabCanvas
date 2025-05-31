
"use client";

import { useState, useCallback } from "react";
import type { FileSystemNode } from "@/lib/types";
import { FileNodeItem } from "./FileNodeItem";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileExplorerProps {
  nodes: FileSystemNode[];
  onNodeSelect?: (node: FileSystemNode | null) => void; // Can be null if clearing selection
  onDeleteNode: (nodeId: string) => void; 
  onAddFileToFolder: (folderId: string | null) => void; 
  onAddFolderToFolder: (folderId: string | null) => void;
  selectedNodeId: string | null; // To manage selected state from parent
}

export function FileExplorer({ 
    nodes, 
    onNodeSelect, 
    onDeleteNode,
    onAddFileToFolder,
    onAddFolderToFolder,
    selectedNodeId
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // selectedNodeId is now managed by the parent (ProjectPage)

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
      onNodeSelect(node); // Pass the full node up
    }
  }, [onNodeSelect]);

  const renderNodes = (nodesToRender: FileSystemNode[], level: number) => {
    return nodesToRender.map((node) => (
      <FileNodeItem
        key={node.id}
        node={node}
        level={level}
        onToggleExpand={handleToggleExpand}
        onNodeClick={handleNodeClick} // This will pass the full node to the handler
        expandedFoldersInExplorer={expandedFolders}
        selectedNodeIdInExplorer={selectedNodeId} // Use prop for selected state
        onDeleteNode={onDeleteNode}
        onAddFileToFolder={onAddFileToFolder}
        onAddFolderToFolder={onAddFolderToFolder}
      />
    ));
  };

  return (
    <div className="h-full w-full flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm p-2">
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
