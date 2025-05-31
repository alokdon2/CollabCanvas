
"use client";

import type { FileSystemNode } from "@/lib/types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FilePlus2, FolderPlus } from "lucide-react";
import { FileNodeItem } from "./FileNodeItem";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileExplorerProps {
  nodes: FileSystemNode[];
  onAddFile: (name: string, parentId: string | null) => void; // parentId null for root
  onAddFolder: (name: string, parentId: string | null) => void; // parentId null for root
  onSelectNode?: (nodeId: string, type: 'file' | 'folder') => void; // For future use, e.g. opening file
}

export function FileExplorer({ nodes, onAddFile, onAddFolder, onSelectNode }: FileExplorerProps) {
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [error, setError] = useState("");
  // const [selectedParentId, setSelectedParentId] = useState<string | null>(null); // For future context-menu creation

  const openDialog = (type: "file" | "folder", parentId: string | null = null) => {
    setNewItemName("");
    setError("");
    // setSelectedParentId(parentId); // For future context-menu creation
    if (type === "file") setIsFileDialogOpen(true);
    else setIsFolderDialogOpen(true);
  };

  const handleCreateItem = (type: "file" | "folder") => {
    if (!newItemName.trim()) {
      setError(`Name cannot be empty.`);
      return;
    }
    setError("");
    if (type === "file") {
      onAddFile(newItemName.trim(), null); // Currently always adds to root
      setIsFileDialogOpen(false);
    } else {
      onAddFolder(newItemName.trim(), null); // Currently always adds to root
      setIsFolderDialogOpen(false);
    }
    setNewItemName("");
  };

  return (
    <div className="h-full flex flex-col bg-card text-card-foreground p-2 rounded-lg border shadow-sm">
      <div className="flex items-center justify-between mb-2 p-1 border-b pb-2">
        <h3 className="text-sm font-semibold">File Explorer</h3>
        <div className="space-x-1">
          <Button variant="ghost" size="icon" onClick={() => openDialog("file")} title="New File">
            <FilePlus2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => openDialog("folder")} title="New Folder">
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-grow">
        {nodes.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">No files or folders yet. <br/>Click '+' to create.</p>
        ) : (
            nodes.map((node) => (
                <FileNodeItem key={node.id} node={node} onSelectNode={onSelectNode} />
            ))
        )}
      </ScrollArea>

      {/* New File Dialog */}
      <Dialog open={isFileDialogOpen} onOpenChange={setIsFileDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
            <DialogDescription>Enter a name for your new file.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="fileName">File Name</Label>
            <Input
              id="fileName"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              aria-describedby="file-name-error"
            />
             {error && <p id="file-name-error" className="text-sm text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFileDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => handleCreateItem("file")}>Create File</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Enter a name for your new folder.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="folderName">Folder Name</Label>
            <Input
              id="folderName"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              aria-describedby="folder-name-error"
            />
            {error && <p id="folder-name-error" className="text-sm text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFolderDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => handleCreateItem("folder")}>Create Folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
