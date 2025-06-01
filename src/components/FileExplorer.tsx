
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
  isReadOnly?: boolean;
}

export function FileExplorer({ 
    nodes, 
    onNodeSelect, 
    onDeleteNode,
    onAddFileToFolder,
    onAddFolderToFolder,
    selectedNodeId,
    onMoveNode, 
    isReadOnly = false,
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
    if (isReadOnly) return;
    event.preventDefault();
    setIsRootDragOver(false); 
    const draggedNodeId = event.dataTransfer.getData("application/node-id");
    if (draggedNodeId) {
      onMoveNode(draggedNodeId, null); 
    }
  };

  const handleRootDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (isReadOnly) return;
    event.preventDefault(); 
    event.dataTransfer.dropEffect = "move";
    if (event.dataTransfer.types.includes("application/node-id")) {
        setIsRootDragOver(true);
    }
  };

  const handleRootDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (isReadOnly) return;
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsRootDragOver(false);
    }
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
        isReadOnly={isReadOnly}
      />
    ));
  };

  return (
    <div 
      className={cn(
        "h-full w-full flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm p-2",
        isRootDragOver && !isReadOnly && "bg-primary/10 ring-2 ring-primary" 
      )}
      onDrop={!isReadOnly ? handleRootDrop : undefined}
      onDragOver={!isReadOnly ? handleRootDragOver : undefined}
      onDragLeave={!isReadOnly ? handleRootDragLeave : undefined}
    >
      <ScrollArea className="flex-grow">
        <div className="space-y-0.5">
          {nodes.length > 0 ? (
            renderNodes(nodes, 0)
          ) : (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No files or folders.
              {!isReadOnly && <><br />Use the '+' in the top bar to add items.</>}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

    