
"use client";

import type { FileSystemNode } from "@/lib/types";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileNodeItemProps {
  node: FileSystemNode;
  level: number;
  isExpanded: boolean;
  onToggleExpand: (nodeId: string) => void;
  onNodeClick: (node: FileSystemNode) => void;
  isSelected?: boolean;
  // Props for recursive rendering
  expandedFoldersInExplorer: Set<string>; 
  selectedNodeIdInExplorer: string | null;
}

export function FileNodeItem({
  node,
  level,
  // isExpanded, // This will now come from expandedFoldersInExplorer for the current node
  onToggleExpand,
  onNodeClick,
  // isSelected, // This will now come from selectedNodeIdInExplorer for the current node
  expandedFoldersInExplorer,
  selectedNodeIdInExplorer,
}: FileNodeItemProps) {
  const isFolder = node.type === "folder";
  const currentIsExpanded = isFolder && expandedFoldersInExplorer.has(node.id);
  const currentIsSelected = selectedNodeIdInExplorer === node.id;


  const handleNodeClick = () => {
    onNodeClick(node); // This will set selectedNodeId in FileExplorer
    // if (isFolder) { // Folder expansion is now solely handled by chevron
    //   onToggleExpand(node.id);
    // }
  };
  
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (isFolder) {
      onToggleExpand(node.id);
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
        <span className="text-sm truncate">{node.name}</span>
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
            />
          ))}
        </div>
      )}
      {isFolder && currentIsExpanded && (!node.children || node.children.length === 0) && (
         <div 
            className="text-xs text-muted-foreground italic"
            style={{ paddingLeft: `${(level + 1) * 1.25 + 0.5 + 1.5}rem` }}
          >
            empty
        </div>
      )}
    </div>
  );
}
