
"use client";

import type { FileSystemNode } from "@/lib/types";
import { ChevronDown, ChevronRight, FileText, Folder, Trash2, FilePlus2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";


interface FileNodeItemProps {
  node: FileSystemNode;
  level: number;
  onToggleExpand: (nodeId: string) => void;
  onNodeClick: (node: FileSystemNode) => void;
  expandedFoldersInExplorer: Set<string>; 
  selectedNodeIdInExplorer: string | null;
  onDeleteNode: (nodeId: string) => void;
  onAddFileToFolder: (folderId: string | null) => void;
  onAddFolderToFolder: (folderId: string | null) => void;
}

export function FileNodeItem({
  node,
  level,
  onToggleExpand,
  onNodeClick,
  expandedFoldersInExplorer,
  selectedNodeIdInExplorer,
  onDeleteNode,
  onAddFileToFolder,
  onAddFolderToFolder,
}: FileNodeItemProps) {
  const isFolder = node.type === "folder";
  const currentIsExpanded = isFolder && expandedFoldersInExplorer.has(node.id);
  const currentIsSelected = selectedNodeIdInExplorer === node.id;

  const handleNodeClick = () => {
    onNodeClick(node);
  };
  
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (isFolder) {
      onToggleExpand(node.id);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteNode(node.id);
  };

  const handleAddFileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      onAddFileToFolder(node.id);
    }
  };

  const handleAddFolderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      onAddFolderToFolder(node.id);
    }
  };


  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "flex items-center py-1.5 px-2 rounded-md cursor-pointer group hover:bg-accent",
          currentIsSelected && "bg-accent text-accent-foreground"
        )}
        style={{ paddingLeft: `${level * 1.25 + 0.5}rem` }} 
        onClick={handleNodeClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNodeClick()}
        title={node.name}
      >
        {isFolder && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 mr-1 p-0"
            onClick={handleChevronClick}
            aria-label={currentIsExpanded ? "Collapse folder" : "Expand folder"}
          >
            {currentIsExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground" />
            )}
          </Button>
        )}
        {!isFolder && <div className="w-6 mr-1 flex-shrink-0" /> }
        
        {isFolder ? (
          <Folder className="h-4 w-4 mr-2 text-muted-foreground group-hover:text-accent-foreground flex-shrink-0" />
        ) : (
          <FileText className="h-4 w-4 mr-2 text-muted-foreground group-hover:text-accent-foreground flex-shrink-0" />
        )}
        <span className="text-sm truncate flex-grow">{node.name}</span>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 ml-auto p-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
              onClick={(e) => e.stopPropagation()} // Prevent node click
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            onClick={(e) => e.stopPropagation()} // Prevent closing on item click if needed for main node click
            side="right" 
            align="start"
          >
            {isFolder && (
              <>
                <DropdownMenuItem onClick={handleAddFileClick}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  New File
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAddFolderClick}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  New Folder
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={handleDeleteClick} className="text-destructive focus:text-destructive focus:bg-destructive/10">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
      {isFolder && currentIsExpanded && node.children && node.children.length > 0 && (
        <div className="pl-0"> 
          {node.children.map((child) => (
            <FileNodeItem
              key={child.id}
              node={child}
              level={level + 1}
              onToggleExpand={onToggleExpand}
              onNodeClick={onNodeClick}
              expandedFoldersInExplorer={expandedFoldersInExplorer}
              selectedNodeIdInExplorer={selectedNodeIdInExplorer}
              onDeleteNode={onDeleteNode}
              onAddFileToFolder={onAddFileToFolder}
              onAddFolderToFolder={onAddFolderToFolder}
            />
          ))}
        </div>
      )}
      {isFolder && currentIsExpanded && (!node.children || node.children.length === 0) && (
         <div 
            className="text-xs text-muted-foreground italic"
            style={{ paddingLeft: `${(level + 1) * 1.25 + 0.5 + 1.5}rem` }} // Match icon + name indent
          >
            empty
        </div>
      )}
    </div>
  );
}
