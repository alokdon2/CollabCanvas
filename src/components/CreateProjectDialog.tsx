
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { PlusCircle } from "lucide-react";
import type { Project } from "@/lib/types";

interface CreateProjectDialogProps {
  onCreateProject: (newProject: Project) => void;
}

export function CreateProjectDialog({ onCreateProject }: CreateProjectDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!projectName.trim()) {
      setError("Project name cannot be empty.");
      return;
    }
    setError("");
    const newProject: Project = {
      id: crypto.randomUUID(),
      name: projectName.trim(),
      textContent: "<p></p>", // Initialize with an empty paragraph for TipTap
      whiteboardContent: null, // Initialize with null to let Excalidraw use its defaults
      fileSystemRoots: [], // Initialize empty file system
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onCreateProject(newProject);
    setProjectName("");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> Create Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Give your new project a name. You can change this later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="col-span-3"
              aria-describedby="name-error"
            />
          </div>
          {error && <p id="name-error" className="col-span-4 text-sm text-red-500 text-center">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button type="submit" onClick={handleSubmit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

