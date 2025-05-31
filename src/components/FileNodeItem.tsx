
"use client";

import type { FileSystemNode } from "@/lib/types";
import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileNodeItemProps {
  node: FileSystemNode;
  level?: number;
  onSelectNode?: (nodeId: string, type: 'file' | 'folder') => void; // Placeholder for future use
}

export function FileNodeItem({ node, level = 0, onSelectNode }: FileNodeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection when toggling
    if (node.type === "folder") {
      setIsExpanded(!isExpanded);
    }
  };

  const handleSelect = () => {
    if (onSelectNode) {
      onSelectNode(node.id, node.type);
    }
    // If it's a file, could also trigger opening it in an editor here.
    // If it's a folder, selection might just highlight it or toggle expansion.
    if (node.type === 'folder') {
        setIsExpanded(!isExpanded);
    }
  };

  const Icon = node.type === "folder" ? Folder : File;
  const indentStyle = { paddingLeft: `${level * 1.25}rem` }; // 0.75rem per level

  return (
    <div>
      <div
        className={cn(
          "flex items-center py-1.5 px-2 rounded-md hover:bg-accent cursor-pointer text-sm",
          // Add selected styles later if needed
        )}
        style={indentStyle}
        onClick={handleSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect()}}
      >
        {node.type === "folder" ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 mr-1"
            onClick={handleToggleExpand}
            aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        ) : (
          <span className="w-6 mr-1 flex-shrink-0"></span> // Placeholder for alignment
        )}
        <Icon className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" />
        <span className="truncate flex-grow">{node.name}</span>
      </div>
      {node.type === "folder" && isExpanded && node.children && node.children.length > 0 && (
        <div className="mt-0">
          {node.children.map((childNode) => (
            <FileNodeItem
              key={childNode.id}
              node={childNode}
              level={level + 1}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
      {node.type === "folder" && isExpanded && (!node.children || node.children.length === 0) && (
         <p className="text-xs text-muted-foreground" style={{ paddingLeft: `${(level + 1) * 1.25 + 0.5}rem` }}>
            Empty folder
        </p>
      )}
    </div>
  );
}

